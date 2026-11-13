// Supabase Edge Function: push-scheduler
//
// The "timer" behind the automatic notifications. It runs every 5 minutes (see supabase/phase10b_push_cron.sql)
// and does four jobs, each controlled from Admin > Notifications:
//
//   1. Abandoned cart      -> customer: a first reminder a few hours after the cart was last touched,
//                             then a second one 24 hours after the first.
//   2. Order awaiting you  -> owner: an order has been "placed" for 15-30 minutes and nobody confirmed it.
//   3. Promotions          -> customers: messages the owner scheduled, never more than 1-2 per customer per week.
//   4. Inactive customers  -> customer: one friendly nudge after 7-14 days away.
//
// Who may call it:
//   - the database timer, with the secret header  x-webhook-secret
//   - the logged-in admin pressing "Send now" (runs only the promotions job; may pass promo_id to send exactly that one)
//
// Deploy with:  npx supabase functions deploy push-scheduler --no-verify-jwt
// (--no-verify-jwt because the timer has no user login. We check access ourselves below.)
// Uses the same secrets as notify-order: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, WEBHOOK_SECRET,
// plus the optional RESEND_API_KEY, OWNER_EMAIL, SITE_URL for the owner's email copy.
//@ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// deno-lint-ignore no-explicit-any
let webpush: any = null

async function initPush(): Promise<string | null> {
  if (webpush) return null
  const settings: [string, string | undefined][] = [
    ['VAPID_SUBJECT', Deno.env.get('VAPID_SUBJECT')],
    ['VAPID_PUBLIC_KEY', Deno.env.get('VAPID_PUBLIC_KEY')],
    ['VAPID_PRIVATE_KEY', Deno.env.get('VAPID_PRIVATE_KEY')],
  ]
  const missing = settings.filter(([, v]) => !v).map(([n]) => n)
  if (missing.length > 0) return `Missing secrets: ${missing.join(', ')}`
  try {
    const mod = await import('npm:web-push@3.6.7')
    const lib = mod.default ?? mod
    lib.setVapidDetails(settings[0][1]!, settings[1][1]!, settings[2][1]!)
    webpush = lib
    return null
  } catch (err) {
    return `Push setup failed: ${(err as Error).message}`
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// ---------------------------------------------------------------------------
// Quiet hours (Lagos time): automatic customer reminders wait until morning.
// ---------------------------------------------------------------------------
function lagosHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date())
  return Number(h) % 24
}
function isQuiet(start: number, end: number): boolean {
  const h = lagosHour()
  return start > end ? h >= start || h < end : h >= start && h < end
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
interface Payload {
  title: string
  body: string
  tag: string
  url: string
}
interface Item {
  userId: string
  kind: 'cart_1' | 'cart_2' | 'inactive' | 'promo'
  ref: string // what the message is about; together with kind it makes a message unique per customer
  payload: Payload
}
interface DeliverResult {
  delivered: number // customers who received it on at least one device
  skipped: number // already sent before (or claimed by an overlapping run)
  failed: number // no device accepted it; will be retried on the next run
  noDevice?: number // of the failed ones: customers with no saved device at all
  errors?: string[] // a few reasons the push service gave, so a silent failure is never a mystery
}

// Sends each item to the customer's saved devices.
// The message is "claimed" in push_log BEFORE sending, so an overlapping run can never send it twice.
// If no device accepted it, the claim is released and the next run tries again.
async function deliver(items: Item[], ttl: number, deadline = Infinity): Promise<DeliverResult> {
  const result: DeliverResult = { delivered: 0, skipped: 0, failed: 0, noDevice: 0, errors: [] }

  for (const group of chunk(items, 40)) {
    if (Date.now() > deadline) break

    const { data: claimedRows, error } = await supabase
      .from('push_log')
      .upsert(
        group.map((i) => ({ user_id: i.userId, kind: i.kind, ref: i.ref })),
        { onConflict: 'user_id,kind,ref', ignoreDuplicates: true }
      )
      .select('user_id, kind, ref')
    if (error) {
      console.error('push_log claim failed:', error.message)
      result.failed += group.length
      continue
    }
    const claimed = new Set((claimedRows ?? []).map((r) => `${r.user_id}|${r.kind}|${r.ref}`))
    const mine = group.filter((i) => claimed.has(`${i.userId}|${i.kind}|${i.ref}`))
    result.skipped += group.length - mine.length
    if (mine.length === 0) continue

    const { data: subs } = await supabase
      .from('customer_push_subscriptions')
      .select('id, user_id, subscription')
      .in('user_id', mine.map((i) => i.userId))
    const byUser = new Map<string, { id: string; subscription: unknown }[]>()
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

    const outcomes = await Promise.all(
      mine.map(async (item) => {
        const devices = byUser.get(item.userId) ?? []
        if (devices.length === 0) result.noDevice!++
        const sent = await Promise.all(
          devices.map(async (d) => {
            try {
              await webpush.sendNotification(d.subscription, JSON.stringify(item.payload), { TTL: ttl, urgency: 'normal' })
              return true
            } catch (err) {
              const e = err as { statusCode?: number; body?: string; message?: string }
              const reason = `${e.statusCode ?? 'error'}: ${e.body || e.message || 'unknown'}`.slice(0, 200)
              console.error('Push rejected:', reason)
              if (result.errors!.length < 3 && !result.errors!.includes(reason)) result.errors!.push(reason)
              if (e.statusCode === 404 || e.statusCode === 410) {
                await supabase.from('customer_push_subscriptions').delete().eq('id', d.id) // device is gone
              }
              return false
            }
          })
        )
        return { item, ok: sent.some(Boolean) }
      })
    )

    for (const { item, ok } of outcomes) {
      if (ok) {
        result.delivered++
      } else {
        result.failed++
        await supabase.from('push_log').delete().eq('user_id', item.userId).eq('kind', item.kind).eq('ref', item.ref)
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 1. Abandoned carts
// ---------------------------------------------------------------------------
function cartMessage(stage: 1 | 2, c: { item_count: number; first_item: string; has_last_one: boolean }): Omit<Payload, 'tag' | 'url'> {
  const name = String(c.first_item ?? 'Your picks')
  const more = c.item_count - 1
  const what = more <= 0 ? `Your ${name}` : `${name} and ${more} more ${more === 1 ? 'item' : 'items'}`

  if (stage === 1) {
    return {
      title: 'Still thinking it over?',
      body: `${what} ${more <= 0 ? 'is' : 'are'} waiting in your cart. Finish your order whenever you're ready.`,
    }
  }
  return {
    title: 'Your cart is still waiting',
    body: c.has_last_one
      ? `Thrifted pieces are one of a kind, and ${more <= 0 ? 'yours' : 'some of yours'} could be gone soon. Check out before someone else grabs it.`
      : `${what} ${more <= 0 ? 'is' : 'are'} still saved for you. Check out when you're ready.`,
  }
}

async function runCartReminders(): Promise<Record<string, DeliverResult>> {
  const out: Record<string, DeliverResult> = {}
  for (const stage of [1, 2] as const) {
    const { data, error } = await supabase.rpc('push_cart_candidates', { p_stage: stage })
    if (error) {
      console.error(`cart stage ${stage}:`, error.message)
      continue
    }
    const items: Item[] = (data ?? []).map((c) => ({
      userId: c.user_id,
      kind: stage === 1 ? 'cart_1' : 'cart_2',
      ref: c.last_change, // a changed cart is a new cart: the sequence starts over
      payload: { ...cartMessage(stage, c), tag: 'cart-reminder', url: '/cart' },
    }))
    out[`cart_${stage}`] = await deliver(items, 12 * 3600)
  }
  return out
}

// ---------------------------------------------------------------------------
// 2. Inactive customers
// ---------------------------------------------------------------------------
async function runInactive(): Promise<DeliverResult> {
  const { data, error } = await supabase.rpc('push_inactive_candidates')
  if (error) {
    console.error('inactive:', error.message)
    return { delivered: 0, skipped: 0, failed: 0 }
  }
  const items: Item[] = (data ?? []).map((c) => ({
    userId: c.user_id,
    kind: 'inactive',
    ref: c.last_active, // once per absence: coming back and leaving again starts a new one
    payload: {
      title: 'We miss you at Looma',
      body:
        c.new_items > 0
          ? `${c.new_items} new ${c.new_items === 1 ? 'find has' : 'finds have'} landed since your last visit. Come take a look.`
          : "It's been a while. Come see what's fresh in the store.",
      tag: 'inactive',
      url: '/shop',
    },
  }))
  return await deliver(items, 24 * 3600)
}

// ---------------------------------------------------------------------------
// 3. Promotions the owner scheduled
// ---------------------------------------------------------------------------
async function runPromos(deadline: number, onlyId?: string): Promise<Record<string, unknown>[]> {
  const nowIso = new Date().toISOString()
  const staleIso = new Date(Date.now() - 15 * 60_000).toISOString() // a run that stopped halfway is resumed after 15 minutes

  // "Send now" names the exact promotion. It must not depend on the browser's clock matching this server's,
  // which is why it skips the "is it due yet?" check that the timer uses.
  let query = supabase
    .from('promo_messages')
    .select('id, title, body, url, status, started_at')
    .in('status', ['scheduled', 'sending'])
  query = onlyId ? query.eq('id', onlyId) : query.lte('scheduled_for', nowIso).order('scheduled_for').limit(5)
  const { data: due } = await query

  const report: Record<string, unknown>[] = []
  for (const promo of due ?? []) {
    if (Date.now() > deadline) break

    // Take ownership of this promotion so two runs never work on it at once.
    let owned = false
    if (promo.status === 'scheduled') {
      const { data } = await supabase
        .from('promo_messages')
        .update({ status: 'sending', started_at: nowIso })
        .eq('id', promo.id)
        .eq('status', 'scheduled')
        .select('id')
      owned = !!data?.length
    } else if (promo.started_at && promo.started_at < staleIso) {
      const { data } = await supabase
        .from('promo_messages')
        .update({ started_at: nowIso })
        .eq('id', promo.id)
        .eq('status', 'sending')
        .eq('started_at', promo.started_at)
        .select('id')
      owned = !!data?.length
    }
    if (!owned) continue

    const { data: audience, error } = await supabase.rpc('push_promo_audience')
    if (error) {
      console.error('promo audience:', error.message)
      report.push({ id: promo.id, error: `audience lookup failed: ${error.message}` })
      continue
    }
    const eligible = (audience ?? []).filter((a) => !a.over_cap)
    const skippedCap = (audience ?? []).length - eligible.length

    const url = String(promo.url || '/').startsWith('/') ? String(promo.url) : '/'
    const items: Item[] = eligible.map((a) => ({
      userId: a.user_id,
      kind: 'promo',
      ref: promo.id,
      payload: { title: promo.title, body: promo.body, tag: `promo-${promo.id}`, url },
    }))

    const r = await deliver(items, 24 * 3600, deadline)
    const finished = Date.now() <= deadline

    if (finished) {
      const { count } = await supabase
        .from('push_log')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'promo')
        .eq('ref', promo.id)
      await supabase
        .from('promo_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), recipients: count ?? r.delivered, skipped_cap: skippedCap })
        .eq('id', promo.id)
    }
    report.push({ id: promo.id, ...r, audience: (audience ?? []).length, skippedCap, finished })
  }
  return report
}

// ---------------------------------------------------------------------------
// 4. Orders waiting for the owner
// ---------------------------------------------------------------------------
async function sendEmail(subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('OWNER_EMAIL')
  if (!key || !to) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Store Orders <onboarding@resend.dev>', to: [to], subject, html }),
  })
  if (!res.ok) console.error('Email failed:', res.status, await res.text())
  return res.ok
}

async function runOrderReminders(minutes: number): Promise<Record<string, unknown>> {
  const now = Date.now()
  const cutoff = new Date(now - minutes * 60_000).toISOString()
  const floor = new Date(now - 12 * 3600_000).toISOString() // never dig up old orders

  // Claim them first so the owner is nudged once per order, even if two runs overlap.
  const { data: waiting } = await supabase
    .from('orders')
    .update({ admin_reminded_at: new Date().toISOString() })
    .eq('status', 'placed')
    .is('admin_reminded_at', null)
    .lte('created_at', cutoff)
    .gte('created_at', floor)
    .select('id, order_number, total, payment_method, user_id, created_at')
  if (!waiting || waiting.length === 0) return { waiting: 0 }

  const ids = [...new Set(waiting.map((o) => o.user_id).filter(Boolean))]
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const nameOf = (uid: string) => people?.find((p) => p.id === uid)?.full_name || 'A customer'
  const minsAgo = (iso: string) => Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000))

  const payloads: Payload[] =
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

  const { data: devices } = await supabase.from('device_tokens').select('id, token')
  let pushed = 0
  for (const payload of payloads) {
    const results = await Promise.all(
      (devices ?? []).map(async (d) => {
        try {
          await webpush.sendNotification(JSON.parse(d.token), JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
          return true
        } catch (err) {
          const e = err as { statusCode?: number }
          if (e.statusCode === 404 || e.statusCode === 410) await supabase.from('device_tokens').delete().eq('id', d.id)
          return false
        }
      })
    )
    pushed += results.filter(Boolean).length
  }

  const rows = waiting
    .map(
      (o) =>
        `<li>Order #${o.order_number} · ${esc(nameOf(o.user_id))} · ${naira(o.total)} · ${o.payment_method === 'on_delivery' ? 'pay on delivery' : 'paid online'} · placed ${minsAgo(o.created_at)} min ago</li>`
    )
    .join('')
  const emailed = await sendEmail(
    waiting.length === 1 ? `Order #${waiting[0].order_number} is waiting for you` : `${waiting.length} orders are waiting for you`,
    `<h2>Not confirmed yet</h2><ul>${rows}</ul><p><a href="${esc(Deno.env.get('SITE_URL') ?? '')}/admin/orders">Open the orders page</a></p>`
  )

  // Nothing reached the owner at all: release the claim so the next run tries again.
  if (pushed === 0 && !emailed) {
    await supabase.from('orders').update({ admin_reminded_at: null }).in('id', waiting.map((o) => o.id))
    return { waiting: waiting.length, pushed: 0, emailed: false, retrying: true }
  }
  return { waiting: waiting.length, pushed, emailed }
}

// ---------------------------------------------------------------------------
// Who is calling?
// ---------------------------------------------------------------------------
async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !data?.user) return false
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.user.id).single()
  return !!profile?.is_admin
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const body = await req.json().catch(() => ({}))
  const secret = req.headers.get('x-webhook-secret')
  const fromTimer = !!secret && secret === Deno.env.get('WEBHOOK_SECRET')
  const fromAdmin = !fromTimer && (await isAdmin(req.headers.get('Authorization')))
  if (!fromTimer && !fromAdmin) return json({ error: 'unauthorized' }, 401)

  const setupProblem = await initPush()
  if (setupProblem) return json({ error: setupProblem }, 500)

  const { data: s } = await supabase.from('push_settings').select('*').eq('id', 1).single()
  if (!s) return json({ error: 'push_settings is missing. Run supabase/phase10_push_automation.sql first.' }, 500)

  const deadline = Date.now() + 100_000 // stay well inside the function's time limit
  const summary: Record<string, unknown> = {}

  // "Send now" from the admin page only needs the promotions.
  if (fromAdmin || body.task === 'promos') {
    const onlyId = fromAdmin && typeof body.promo_id === 'string' ? body.promo_id : undefined
    summary.promos = await runPromos(deadline, onlyId)
    return json(summary)
  }

  summary.promos = await runPromos(deadline)
  if (s.confirm_enabled) summary.orders = await runOrderReminders(s.confirm_after_min)

  if (isQuiet(s.quiet_start_hour, s.quiet_end_hour)) {
    summary.customerReminders = 'skipped: quiet hours'
  } else {
    summary.cart = await runCartReminders()
    summary.inactive = await runInactive()
  }
  return json(summary)
})
