// What each kind of reminder job does. Plain TypeScript: the database and the push service are passed in
// (see PushDeps), so every branch below is covered by tests (pushJobs.test.ts) without Deno or the network.
//
//   push.customer         one reminder or promotion to one customer's devices
//   owner.orders_waiting  one alert to the owner about orders nobody has confirmed yet
//
// How a send is made safe:
//   * The queue guarantees one worker per job, and a job is only ever queued once (its dedupe key).
//   * Just before sending, we ask whether the reminder is still relevant (a customer who has checked out
//     must not be told their cart is waiting).
//   * A send that fails for a passing reason is retried after a pause; one that cannot ever work stops.
//   * We send FIRST and record it in push_log afterwards. If a worker dies between the two, the job is retried
//     and the customer may get the message twice, but never zero times. Both copies carry the same `tag`, so the
//     phone replaces the first notification with the second rather than showing two.

import type { Handler, Job, Outcome } from './jobRunner.ts'

export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
}

export interface SendOptions {
  ttl: number // seconds the push service may hold the message if the device is offline
  urgency: 'normal' | 'high'
}

export interface WaitingOrder {
  id: string
  order_number: number
  total: number
  payment_method: string
  user_id: string | null
  created_at: string
}

export interface PushDb {
  isStale(kind: string, payload: Record<string, unknown>): Promise<boolean>
  subscriptionsFor(userId: string): Promise<{ id: string; subscription: unknown }[]>
  deleteSubscription(id: string): Promise<void>
  logSent(userId: string, kind: string, ref: string): Promise<void>
  ownerDevices(): Promise<{ id: string; token: string }[]>
  deleteOwnerDevice(id: string): Promise<void>
  waitingOrders(ids: string[]): Promise<WaitingOrder[]> // those still "placed" and not yet reminded about
  customerNames(userIds: string[]): Promise<Record<string, string | null>>
  markOrdersReminded(ids: string[]): Promise<void>
}

export interface PushDeps {
  db: PushDb
  send(subscription: unknown, payload: PushPayload, options: SendOptions): Promise<void> // throws on refusal
  sendEmail?(subject: string, html: string): Promise<boolean>
  siteUrl?: string
  now?: () => number
  log?: (message: string) => void
}

/* ------------------------------ message wording ------------------------------ */

export type CustomerKind = 'cart_1' | 'cart_2' | 'inactive' | 'promo'

export interface CustomerPayload {
  userId: string
  kind: CustomerKind
  ref: string // what the message is about; with the kind it identifies the message in push_log
  itemCount: number
  firstItem: string
  hasLastOne: boolean
  newItems: number
  title: string
  body: string
  url: string
}

const KINDS: readonly string[] = ['cart_1', 'cart_2', 'inactive', 'promo']
const HOUR = 3600

// Reads a job's payload. Null means it is malformed, which no retry can fix.
export function parseCustomerPayload(raw: Record<string, unknown>): CustomerPayload | null {
  const userId = raw.user_id
  const kind = raw.kind
  const ref = raw.ref
  if (typeof userId !== 'string' || !userId) return null
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null
  if (typeof ref !== 'string' || !ref) return null
  if (kind === 'promo' && (typeof raw.title !== 'string' || typeof raw.body !== 'string')) return null

  const link = typeof raw.url === 'string' ? raw.url : '/'
  return {
    userId,
    kind: kind as CustomerKind,
    ref,
    itemCount: Number(raw.item_count ?? 1),
    firstItem: String(raw.first_item ?? 'Your picks'),
    hasLastOne: raw.has_last_one === true,
    newItems: Number(raw.new_items ?? 0),
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    url: link.startsWith('/') ? link : '/', // only links inside the store
  }
}

export function cartMessage(stage: 1 | 2, c: Pick<CustomerPayload, 'itemCount' | 'firstItem' | 'hasLastOne'>): { title: string; body: string } {
  const more = c.itemCount - 1
  const what = more <= 0 ? `Your ${c.firstItem}` : `${c.firstItem} and ${more} more ${more === 1 ? 'item' : 'items'}`

  if (stage === 1) {
    return {
      title: 'Still thinking it over?',
      body: `${what} ${more <= 0 ? 'is' : 'are'} waiting in your cart. Finish your order whenever you're ready.`,
    }
  }
  return {
    title: 'Your cart is still waiting',
    body: c.hasLastOne
      ? `Thrifted pieces are one of a kind, and ${more <= 0 ? 'yours' : 'some of yours'} could be gone soon. Check out before someone else grabs it.`
      : `${what} ${more <= 0 ? 'is' : 'are'} still saved for you. Check out when you're ready.`,
  }
}

export function customerMessage(p: CustomerPayload): { payload: PushPayload; ttl: number } {
  switch (p.kind) {
    case 'cart_1':
    case 'cart_2':
      return { payload: { ...cartMessage(p.kind === 'cart_1' ? 1 : 2, p), tag: 'cart-reminder', url: '/cart' }, ttl: 12 * HOUR }
    case 'inactive':
      return {
        payload: {
          title: 'We miss you at Looma',
          body:
            p.newItems > 0
              ? `${p.newItems} new ${p.newItems === 1 ? 'find has' : 'finds have'} landed since your last visit. Come take a look.`
              : "It's been a while. Come see what's fresh in the store.",
          tag: 'inactive',
          url: '/shop',
        },
        ttl: 24 * HOUR,
      }
    case 'promo':
      return { payload: { title: p.title, body: p.body, tag: `promo-${p.ref}`, url: p.url }, ttl: 24 * HOUR }
  }
}

/* --------------------------------- sending ---------------------------------- */

interface SendError {
  statusCode?: number
  body?: string
  message?: string
}

const isGone = (err: SendError) => err.statusCode === 404 || err.statusCode === 410 // the device unsubscribed

const reasonOf = (err: unknown): string => {
  const e = (err ?? {}) as SendError
  return `${e.statusCode ?? 'error'}: ${e.body || e.message || 'unknown'}`.slice(0, 200)
}

const done = (result: Record<string, unknown>): Outcome => ({ type: 'done', result })

/* ------------------------------ push.customer ------------------------------- */

function customerHandler(deps: PushDeps): Handler {
  const log = deps.log ?? (() => {})

  return async (job: Job): Promise<Outcome> => {
    const p = parseCustomerPayload(job.payload)
    if (!p) return { type: 'dead', error: 'The job is missing the customer, the kind of message or what it is about.' }

    // The customer may have carried on shopping, come back, or switched reminders off while this job waited.
    if (await deps.db.isStale(`push.customer`, job.payload)) return done({ skipped: 'stale' })

    const devices = await deps.db.subscriptionsFor(p.userId)
    if (devices.length === 0) return done({ skipped: 'no_device' })

    const { payload, ttl } = customerMessage(p)
    const reasons: string[] = []
    let delivered = 0
    let gone = 0

    for (const device of devices) {
      try {
        await deps.send(device.subscription, payload, { ttl, urgency: 'normal' })
        delivered++
      } catch (err) {
        const reason = reasonOf(err)
        log(`push rejected for job ${job.id}: ${reason}`)
        if (isGone(err as SendError)) {
          gone++
          await deps.db.deleteSubscription(device.id) // the device is gone for good
        } else {
          reasons.push(reason)
        }
      }
    }

    if (delivered > 0) {
      let logged = true
      try {
        await deps.db.logSent(p.userId, p.kind, p.ref)
      } catch (err) {
        // The customer HAS the message. Retrying would send it again, so a failed note-keeping is only reported.
        logged = false
        log(`job ${job.id}: sent, but could not record it in push_log: ${reasonOf(err)}`)
      }
      return done({ delivered, ...(logged ? {} : { logged: false }) })
    }

    if (reasons.length === 0) return done({ skipped: 'devices_gone', gone }) // every device had unsubscribed
    return { type: 'retry', error: `Push rejected: ${reasons[0]}` }
  }
}

/* ---------------------------- owner.orders_waiting ---------------------------- */

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function ordersWaitingHandler(deps: PushDeps): Handler {
  const now = deps.now ?? Date.now
  const log = deps.log ?? (() => {})

  return async (job: Job): Promise<Outcome> => {
    const ids = job.payload.order_ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      return { type: 'dead', error: 'The job does not say which orders are waiting.' }
    }

    // Orders confirmed or already reminded about since the job was queued are no longer worth mentioning.
    const waiting = await deps.db.waitingOrders(ids as string[])
    if (waiting.length === 0) return done({ skipped: 'nothing_waiting' })

    const minsAgo = (iso: string) => Math.max(1, Math.round((now() - new Date(iso).getTime()) / 60_000))
    const userIds = [...new Set(waiting.map((o) => o.user_id).filter((id): id is string => !!id))]
    const names = userIds.length > 0 ? await deps.db.customerNames(userIds) : {}
    const nameOf = (userId: string | null) => (userId && names[userId]) || 'A customer'

    // A few orders get their own alert; many get one summary.
    const payloads: PushPayload[] =
      waiting.length <= 3
        ? waiting.map((o) => ({
            title: `Order #${o.order_number} is waiting for you`,
            body: `${nameOf(o.user_id)} · ${naira(o.total)} · placed ${minsAgo(o.created_at)} min ago. Tap to confirm it.`,
            tag: `order-${o.id}`, // replaces the original "New order" alert instead of stacking another one
            url: '/admin/orders',
          }))
        : [
            {
              title: `${waiting.length} orders are waiting for you`,
              body: `Oldest placed ${Math.max(...waiting.map((o) => minsAgo(o.created_at)))} min ago. Tap to review them.`,
              tag: 'orders-waiting',
              url: '/admin/orders',
            },
          ]

    const devices = await deps.db.ownerDevices()
    let pushed = 0
    for (const device of devices) {
      let token: unknown
      try {
        token = JSON.parse(device.token)
      } catch {
        continue // a damaged saved device is skipped
      }
      for (const payload of payloads) {
        try {
          await deps.send(token, payload, { ttl: 1 * HOUR, urgency: 'high' })
          pushed++
        } catch (err) {
          log(`owner push rejected for job ${job.id}: ${reasonOf(err)}`)
          if (isGone(err as SendError)) {
            await deps.db.deleteOwnerDevice(device.id)
            break // no point trying the rest of the messages on a device that is gone
          }
        }
      }
    }

    let emailed = false
    if (deps.sendEmail) {
      const rows = waiting
        .map(
          (o) =>
            `<li>Order #${o.order_number} · ${esc(nameOf(o.user_id))} · ${naira(o.total)} · ${o.payment_method === 'on_delivery' ? 'pay on delivery' : 'paid online'} · placed ${minsAgo(o.created_at)} min ago</li>`
        )
        .join('')
      emailed = await deps.sendEmail(
        waiting.length === 1 ? `Order #${waiting[0].order_number} is waiting for you` : `${waiting.length} orders are waiting for you`,
        `<h2>Not confirmed yet</h2><ul>${rows}</ul><p><a href="${esc(deps.siteUrl ?? '')}/admin/orders">Open the orders page</a></p>`
      )
    }

    // Nothing reached the owner at all: do not mark the orders as reminded, so the next attempt tries again.
    if (pushed === 0 && !emailed) return { type: 'retry', error: 'Nothing reached the owner: no working device and no email.' }

    await deps.db.markOrdersReminded(waiting.map((o) => o.id))
    return done({ waiting: waiting.length, pushed, emailed })
  }
}

/* --------------------------------- registry --------------------------------- */

export function createPushHandlers(deps: PushDeps): Record<string, Handler> {
  return {
    'push.customer': customerHandler(deps),
    'owner.orders_waiting': ordersWaitingHandler(deps),
  }
}
