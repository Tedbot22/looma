import { beforeEach, describe, expect, it } from 'vitest'
import type { Job } from './jobRunner'
import { cartMessage, createPushHandlers, customerMessage, parseCustomerPayload, type PushDb, type PushPayload, type SendOptions, type WaitingOrder } from './pushJobs'

const job = (payload: Record<string, unknown>, kind = 'push.customer'): Job => ({ id: 1, kind, payload, attempts: 1, max_attempts: 5 })
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0)
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

// A database and push service that remember what they were asked.
function setup(over: { stale?: boolean; devices?: { id: string; subscription: unknown }[]; sendFails?: Record<string, unknown>; logFails?: boolean } = {}) {
  const sent: { to: unknown; payload: PushPayload; options: SendOptions }[] = []
  const state = {
    deletedSubscriptions: [] as string[],
    deletedOwnerDevices: [] as string[],
    logged: [] as [string, string, string][],
    reminded: [] as string[][],
    emails: [] as { subject: string; html: string }[],
    logs: [] as string[],
    orders: [] as WaitingOrder[],
    ownerDevices: [] as { id: string; token: string }[],
    names: {} as Record<string, string | null>,
  }
  const db: PushDb = {
    isStale: async () => over.stale ?? false,
    subscriptionsFor: async () => over.devices ?? [{ id: 'd1', subscription: { endpoint: 'https://push/1' } }],
    deleteSubscription: async (id) => void state.deletedSubscriptions.push(id),
    logSent: async (u, k, r) => {
      if (over.logFails) throw new Error('push_log is down')
      state.logged.push([u, k, r])
    },
    ownerDevices: async () => state.ownerDevices,
    deleteOwnerDevice: async (id) => void state.deletedOwnerDevices.push(id),
    waitingOrders: async (ids) => state.orders.filter((o) => ids.includes(o.id)),
    customerNames: async () => state.names,
    markOrdersReminded: async (ids) => void state.reminded.push(ids),
  }
  const handlers = createPushHandlers({
    db,
    now: () => NOW,
    log: (m) => state.logs.push(m),
    siteUrl: 'https://looma.example',
    send: async (to, payload, options) => {
      const key = JSON.stringify((to as { endpoint?: string }).endpoint ?? to)
      const failure = over.sendFails?.[JSON.parse(key)]
      if (failure) throw failure
      sent.push({ to, payload, options })
    },
    sendEmail: async (subject, html) => (state.emails.push({ subject, html }), true),
  })
  return { handlers, sent, state }
}

const cartJob = (over: Record<string, unknown> = {}) =>
  job({ user_id: 'u1', kind: 'cart_1', stage: 1, ref: '2026-06-15T07:00:00+00:00', item_count: 1, first_item: 'Denim Jacket', has_last_one: false, ...over })

describe('message wording', () => {
  it('first cart reminder names the item, or counts the others', () => {
    expect(cartMessage(1, { itemCount: 1, firstItem: 'Denim Jacket', hasLastOne: false })).toEqual({
      title: 'Still thinking it over?',
      body: "Your Denim Jacket is waiting in your cart. Finish your order whenever you're ready.",
    })
    expect(cartMessage(1, { itemCount: 3, firstItem: 'Denim Jacket', hasLastOne: false }).body).toBe(
      "Denim Jacket and 2 more items are waiting in your cart. Finish your order whenever you're ready."
    )
    expect(cartMessage(1, { itemCount: 2, firstItem: 'Cap', hasLastOne: false }).body).toBe(
      "Cap and 1 more item are waiting in your cart. Finish your order whenever you're ready."
    )
  })

  it('second cart reminder warns when something is the last one', () => {
    expect(cartMessage(2, { itemCount: 1, firstItem: 'Cap', hasLastOne: true }).body).toContain('yours could be gone soon')
    expect(cartMessage(2, { itemCount: 4, firstItem: 'Cap', hasLastOne: true }).body).toContain('some of yours could be gone soon')
    expect(cartMessage(2, { itemCount: 1, firstItem: 'Cap', hasLastOne: false })).toEqual({
      title: 'Your cart is still waiting',
      body: "Your Cap is still saved for you. Check out when you're ready.",
    })
  })

  it('gives each kind its own tag, link and how long to hold it', () => {
    const base = { userId: 'u', ref: 'r', itemCount: 1, firstItem: 'Cap', hasLastOne: false, newItems: 0, title: '', body: '', url: '/' }
    expect(customerMessage({ ...base, kind: 'cart_1' })).toMatchObject({ payload: { tag: 'cart-reminder', url: '/cart' }, ttl: 12 * 3600 })
    expect(customerMessage({ ...base, kind: 'inactive' })).toMatchObject({ payload: { tag: 'inactive', url: '/shop' }, ttl: 24 * 3600 })
    expect(customerMessage({ ...base, kind: 'promo', ref: 'p9', title: 'Sale', body: 'Half price', url: '/shop?c=1' })).toEqual({
      payload: { title: 'Sale', body: 'Half price', tag: 'promo-p9', url: '/shop?c=1' },
      ttl: 24 * 3600,
    })
  })

  it('says how many new finds there are in the "we miss you" message', () => {
    const base = { userId: 'u', kind: 'inactive' as const, ref: 'r', itemCount: 1, firstItem: '', hasLastOne: false, title: '', body: '', url: '/' }
    expect(customerMessage({ ...base, newItems: 1 }).payload.body).toBe('1 new find has landed since your last visit. Come take a look.')
    expect(customerMessage({ ...base, newItems: 5 }).payload.body).toBe('5 new finds have landed since your last visit. Come take a look.')
    expect(customerMessage({ ...base, newItems: 0 }).payload.body).toBe("It's been a while. Come see what's fresh in the store.")
  })
})

describe('reading a job’s payload', () => {
  it('accepts a good one and fills in sensible defaults', () => {
    expect(parseCustomerPayload({ user_id: 'u1', kind: 'inactive', ref: 'r' })).toMatchObject({ userId: 'u1', itemCount: 1, firstItem: 'Your picks', newItems: 0, hasLastOne: false })
  })

  it('refuses ones that are missing something essential, or name an unknown kind', () => {
    expect(parseCustomerPayload({})).toBeNull()
    expect(parseCustomerPayload({ user_id: 'u1', kind: 'weird', ref: 'r' })).toBeNull()
    expect(parseCustomerPayload({ user_id: 'u1', kind: 'cart_1' })).toBeNull()
    expect(parseCustomerPayload({ user_id: '', kind: 'cart_1', ref: 'r' })).toBeNull()
    expect(parseCustomerPayload({ user_id: 'u1', kind: 'promo', ref: 'p' })).toBeNull() // a promotion needs its words
  })

  it('only allows links inside the store', () => {
    expect(parseCustomerPayload({ user_id: 'u', kind: 'promo', ref: 'p', title: 't', body: 'b', url: 'https://evil.example' })!.url).toBe('/')
    expect(parseCustomerPayload({ user_id: 'u', kind: 'promo', ref: 'p', title: 't', body: 'b', url: '/shop' })!.url).toBe('/shop')
  })
})

describe('push.customer', () => {
  let t: ReturnType<typeof setup>
  beforeEach(() => {
    t = setup()
  })

  it('sends the reminder once, records it, and is done', async () => {
    const outcome = await t.handlers['push.customer'](cartJob())
    expect(outcome).toEqual({ type: 'done', result: { delivered: 1 } })
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0].payload).toMatchObject({ title: 'Still thinking it over?', tag: 'cart-reminder', url: '/cart' })
    expect(t.sent[0].options).toEqual({ ttl: 12 * 3600, urgency: 'normal' })
    expect(t.state.logged).toEqual([['u1', 'cart_1', '2026-06-15T07:00:00+00:00']])
  })

  it('sends to every device the customer has, and is done if at least one took it', async () => {
    t = setup({
      devices: [
        { id: 'phone', subscription: { endpoint: 'https://push/phone' } },
        { id: 'laptop', subscription: { endpoint: 'https://push/laptop' } },
      ],
      sendFails: { 'https://push/laptop': { statusCode: 503, body: 'try later' } },
    })
    expect(await t.handlers['push.customer'](cartJob())).toEqual({ type: 'done', result: { delivered: 1 } })
    expect(t.state.logged).toHaveLength(1)
  })

  it('skips a reminder that is no longer relevant, without sending or recording anything', async () => {
    t = setup({ stale: true })
    expect(await t.handlers['push.customer'](cartJob())).toEqual({ type: 'done', result: { skipped: 'stale' } })
    expect(t.sent).toHaveLength(0)
    expect(t.state.logged).toHaveLength(0)
  })

  it('is done (nothing to send) when the customer has no device', async () => {
    t = setup({ devices: [] })
    expect(await t.handlers['push.customer'](cartJob())).toEqual({ type: 'done', result: { skipped: 'no_device' } })
  })

  it('forgets devices that have unsubscribed, and does not retry when none are left', async () => {
    t = setup({ sendFails: { 'https://push/1': { statusCode: 410, body: 'Gone' } } })
    const outcome = await t.handlers['push.customer'](cartJob())
    expect(outcome).toEqual({ type: 'done', result: { skipped: 'devices_gone', gone: 1 } })
    expect(t.state.deletedSubscriptions).toEqual(['d1'])
    expect(t.state.logged).toHaveLength(0)
  })

  it('treats 404 the same as 410', async () => {
    t = setup({ sendFails: { 'https://push/1': { statusCode: 404 } } })
    expect(await t.handlers['push.customer'](cartJob())).toEqual({ type: 'done', result: { skipped: 'devices_gone', gone: 1 } })
  })

  it('asks for a retry, with the push service’s own reason, when a device could not be reached right now', async () => {
    t = setup({ sendFails: { 'https://push/1': { statusCode: 503, body: 'Service Unavailable' } } })
    expect(await t.handlers['push.customer'](cartJob())).toEqual({ type: 'retry', error: 'Push rejected: 503: Service Unavailable' })
    expect(t.state.logged).toHaveLength(0) // not recorded, so it can be tried again
    expect(t.state.deletedSubscriptions).toEqual([]) // a passing problem does not delete the device
  })

  it('retries (not gives up) when one device is gone but another failed for a passing reason', async () => {
    t = setup({
      devices: [{ id: 'old', subscription: { endpoint: 'https://push/old' } }, { id: 'new', subscription: { endpoint: 'https://push/new' } }],
      sendFails: { 'https://push/old': { statusCode: 410 }, 'https://push/new': { statusCode: 429, message: 'slow down' } },
    })
    expect((await t.handlers['push.customer'](cartJob())).type).toBe('retry')
    expect(t.state.deletedSubscriptions).toEqual(['old'])
  })

  it('does not send twice just because the note-keeping failed', async () => {
    t = setup({ logFails: true })
    const outcome = await t.handlers['push.customer'](cartJob())
    expect(outcome).toEqual({ type: 'done', result: { delivered: 1, logged: false } })
    expect(t.sent).toHaveLength(1)
    expect(t.state.logs.some((l) => l.includes('could not record it in push_log'))).toBe(true)
  })

  it('gives up straight away on a malformed job', async () => {
    const outcome = await t.handlers['push.customer'](job({ kind: 'cart_1' }))
    expect(outcome.type).toBe('dead')
    expect(t.sent).toHaveLength(0)
  })

  it('sends a promotion with its own words and a per-promotion tag', async () => {
    await t.handlers['push.customer'](job({ user_id: 'u1', kind: 'promo', ref: 'promo-7', title: 'Flash sale', body: 'Half price today', url: '/shop' }))
    expect(t.sent[0].payload).toEqual({ title: 'Flash sale', body: 'Half price today', tag: 'promo-promo-7', url: '/shop' })
    expect(t.state.logged).toEqual([['u1', 'promo', 'promo-7']])
  })
})

describe('owner.orders_waiting', () => {
  const order = (n: number, minutes: number, over: Partial<WaitingOrder> = {}): WaitingOrder => ({
    id: `o${n}`, order_number: 100 + n, total: 12500, payment_method: 'online', user_id: `u${n}`, created_at: minutesAgo(minutes), ...over,
  })
  const ownerJob = (ids: string[]) => job({ order_ids: ids }, 'owner.orders_waiting')
  const device = (id: string, endpoint = `https://push/${id}`) => ({ id, token: JSON.stringify({ endpoint }) })

  it('alerts the owner about each order when there are only a few, and marks them reminded', async () => {
    const t = setup()
    t.state.orders = [order(1, 25), order(2, 40)]
    t.state.names = { u1: 'Ada', u2: null }
    t.state.ownerDevices = [device('d1')]

    const outcome = await t.handlers['owner.orders_waiting'](ownerJob(['o1', 'o2']))
    expect(outcome).toEqual({ type: 'done', result: { waiting: 2, pushed: 2, emailed: true } })
    expect(t.sent.map((s) => s.payload)).toEqual([
      { title: 'Order #101 is waiting for you', body: 'Ada · ₦12,500 · placed 25 min ago. Tap to confirm it.', tag: 'order-o1', url: '/admin/orders' },
      { title: 'Order #102 is waiting for you', body: 'A customer · ₦12,500 · placed 40 min ago. Tap to confirm it.', tag: 'order-o2', url: '/admin/orders' },
    ])
    expect(t.sent[0].options).toEqual({ ttl: 3600, urgency: 'high' })
    expect(t.state.reminded).toEqual([['o1', 'o2']])
  })

  it('sends one summary when many orders are waiting', async () => {
    const t = setup()
    t.state.orders = [order(1, 25), order(2, 30), order(3, 45), order(4, 28)]
    t.state.ownerDevices = [device('d1')]
    await t.handlers['owner.orders_waiting'](ownerJob(['o1', 'o2', 'o3', 'o4']))
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0].payload).toEqual({ title: '4 orders are waiting for you', body: 'Oldest placed 45 min ago. Tap to review them.', tag: 'orders-waiting', url: '/admin/orders' })
  })

  it('emails the owner a list, with customer names made safe', async () => {
    const t = setup()
    t.state.orders = [order(1, 25, { payment_method: 'on_delivery' })]
    t.state.names = { u1: '<script>alert(1)</script>' }
    t.state.ownerDevices = [device('d1')]
    await t.handlers['owner.orders_waiting'](ownerJob(['o1']))
    const [mail] = t.state.emails
    expect(mail.subject).toBe('Order #101 is waiting for you')
    expect(mail.html).toContain('pay on delivery')
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('https://looma.example/admin/orders')
  })

  it('counts an email alone as reaching the owner', async () => {
    const t = setup()
    t.state.orders = [order(1, 25)]
    t.state.ownerDevices = [] // no phone saved
    expect(await t.handlers['owner.orders_waiting'](ownerJob(['o1']))).toEqual({ type: 'done', result: { waiting: 1, pushed: 0, emailed: true } })
    expect(t.state.reminded).toEqual([['o1']])
  })

  it('tries again later, without marking anything, if nothing reached the owner', async () => {
    const t = setup()
    const failing = createPushHandlers({
      db: { ...({} as PushDb), waitingOrders: async () => [order(1, 25)], customerNames: async () => ({}), ownerDevices: async () => [], markOrdersReminded: async (ids) => void t.state.reminded.push(ids) } as PushDb,
      send: async () => {},
      now: () => NOW,
    })
    expect(await failing['owner.orders_waiting'](ownerJob(['o1']))).toEqual({ type: 'retry', error: 'Nothing reached the owner: no working device and no email.' })
    expect(t.state.reminded).toEqual([])
  })

  it('forgets an owner device that has unsubscribed, and skips damaged saved devices', async () => {
    const t = setup({ sendFails: { 'https://push/gone': { statusCode: 410 } } })
    t.state.orders = [order(1, 25), order(2, 30)]
    t.state.ownerDevices = [device('gone'), { id: 'broken', token: 'not json' }, device('ok')]
    const outcome = await t.handlers['owner.orders_waiting'](ownerJob(['o1', 'o2']))
    expect(t.state.deletedOwnerDevices).toEqual(['gone'])
    expect(outcome).toMatchObject({ type: 'done', result: { pushed: 2 } }) // two alerts to the one working device
  })

  it('is done quietly if the orders were confirmed while the job waited', async () => {
    const t = setup()
    t.state.orders = [] // none are still waiting
    expect(await t.handlers['owner.orders_waiting'](ownerJob(['o1']))).toEqual({ type: 'done', result: { skipped: 'nothing_waiting' } })
    expect(t.sent).toHaveLength(0)
  })

  it('gives up on a job that does not say which orders', async () => {
    const t = setup()
    for (const payload of [{}, { order_ids: [] }, { order_ids: [1, 2] }, { order_ids: 'o1' }]) {
      expect((await t.handlers['owner.orders_waiting'](job(payload, 'owner.orders_waiting'))).type).toBe('dead')
    }
  })
})
