// Supabase Edge Function: notify-order
//
// Two ways to call it:
//   1. The database (a trigger) calls it when an order is ready, with a secret header.
//      -> sends a push notification AND an email to the owner.
//   2. The logged-in admin presses "Send test" in the admin page.
//      -> sends a test push to that admin's devices.
//
// Deploy with:  npx supabase functions deploy notify-order --no-verify-jwt
// (--no-verify-jwt because the database trigger has no user login. We check access ourselves below.)
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // powerful key: stays on the server, never in the browser
)

// The push library is loaded lazily so that a setup problem (missing secret, bad key,
// library trouble) comes back as a readable error message instead of crashing the whole function.
// deno-lint-ignore no-explicit-any
let webpush: any = null

async function initPush(): Promise<string | null> {
  if (webpush) return null

  const settings: [string, string | undefined][] = [
    ['VAPID_SUBJECT', Deno.env.get('VAPID_SUBJECT')],
    ['VAPID_PUBLIC_KEY', Deno.env.get('VAPID_PUBLIC_KEY')],
    ['VAPID_PRIVATE_KEY', Deno.env.get('VAPID_PRIVATE_KEY')],
  ]
  const missing = settings.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length > 0) return `Missing secrets: ${missing.join(', ')}`

  try {
    const mod = await import('npm:web-push@3.6.7')
    const lib = mod.default ?? mod
    // VAPID_SUBJECT must look like  mailto:you@example.com  (or an https:// address)
    lib.setVapidDetails(settings[0][1]!, settings[1][1]!, settings[2][1]!)
    webpush = lib
    return null
  } catch (err) {
    return `Push setup failed: ${(err as Error).message}`
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`

// Customer-typed text goes into an HTML email, so it must be escaped.
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

interface DeviceRow {
  id: string
  token: string
}

// Sends one payload to every saved device. Devices that no longer exist are cleaned up.
// Returns how many succeeded AND why the others failed, so problems are never silent.
async function pushToDevices(
  devices: DeviceRow[],
  payload: object
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = []

  const results = await Promise.allSettled(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(JSON.parse(d.token), JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string }
        errors.push(`${e.statusCode ?? 'error'}: ${e.body || e.message || 'unknown'}`.slice(0, 300))
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from('device_tokens').delete().eq('id', d.id) // phone unsubscribed or app removed
        }
        throw err
      }
    })
  )
  return { sent: results.filter((r) => r.status === 'fulfilled').length, errors }
}

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

async function notifyOrder(orderId: string): Promise<Response> {
  // Claim the order first. If two requests arrive at once, only one gets through,
  // so the owner is never alerted twice for the same order.
  const { data: claimed } = await supabase
    .from('orders')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('notified_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) return json({ skipped: 'already notified or not found' })

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, total, delivery_fee, delivery_zone, delivery_note, delivery_lat, delivery_lon, delivery_distance_m, origin_lat, origin_lon, payment_method, delivery_address, phone, profiles(full_name), order_items(name, quantity, unit_price, product_variants(product_id))'
    )
    .eq('id', orderId)
    .single()

  if (error || !data) {
    await supabase.from('orders').update({ notified_at: null }).eq('id', orderId)
    return json({ error: 'order not found' }, 404)
  }

  // deno-lint-ignore no-explicit-any
  const order = data as any
  const customer: string = order.profiles?.full_name || 'A customer'
  const items = (order.order_items ?? []).map(
    (i: { name: string; quantity: number; unit_price: number; product_variants: { product_id: string } | null }) => ({
      text: `${i.name} ×${i.quantity}`,
      productId: i.product_variants?.product_id ?? '',
      price: i.unit_price * i.quantity,
    })
  )

  // ----- Push: short, readable on a lock screen -----
  const firstTwo = items.slice(0, 2).map((i: { text: string }) => i.text).join(', ')
  const more = items.length > 2 ? ` +${items.length - 2} more` : ''
  const shortId = String(order.id).slice(0, 8)
  const payload = {
    title: `New order #${order.order_number} · ${naira(order.total)}`,
    body: `${customer}${order.delivery_zone ? ` · ${order.delivery_zone}` : ''}: ${firstTwo}${more}\nOrder ID: ${shortId}`,
    tag: `order-${order.id}`,
    url: '/admin',
  }

  const { data: devices } = await supabase.from('device_tokens').select('id, token')
  const { sent: pushed, errors: pushErrors } = await pushToDevices(devices ?? [], payload)
  if (pushErrors.length > 0) console.error('Push errors:', pushErrors)

  // ----- Email backup: the full details, including the complete IDs -----
  const rows = items
    .map(
      (i: { text: string; productId: string; price: number }) =>
        `<tr><td style="padding:4px 12px 4px 0">${esc(i.text)}</td><td style="padding:4px 12px 4px 0;color:#666">Product ID: ${esc(i.productId)}</td><td>${naira(i.price)}</td></tr>`
    )
    .join('')

  // A Google Maps link from the store to the customer, when the order has an exact location.
  const routeLink =
    order.delivery_lat != null && order.origin_lat != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${order.origin_lat},${order.origin_lon}` +
        `&destination=${order.delivery_lat},${order.delivery_lon}&travelmode=driving`
      : null
  const distance = order.delivery_distance_m != null ? `${(order.delivery_distance_m / 1000).toFixed(1)} km` : null

  const html = `
    <h2>New order #${order.order_number}</h2>
    <p><b>Order ID:</b> ${esc(order.id)}<br>
       <b>Total:</b> ${naira(order.total)} (${order.payment_method === 'on_delivery' ? 'pay on delivery' : 'paid online'})</p>
    <table>${rows}</table>
    <p><b>Customer:</b> ${esc(customer)}<br>
       <b>Phone:</b> ${esc(order.phone)}<br>
       <b>Deliver to:</b> ${esc([order.delivery_zone, order.delivery_address].filter(Boolean).join(': '))}<br>
       ${order.delivery_note ? `<b>Note:</b> ${esc(order.delivery_note)}<br>` : ''}
       ${order.delivery_lat != null ? `<b>Location:</b> ${order.delivery_lat}, ${order.delivery_lon}<br>` : ''}
       ${distance ? `<b>Distance:</b> ${distance}<br>` : ''}
       <b>Delivery fee included:</b> ${naira(order.delivery_fee ?? 0)}</p>
    ${routeLink ? `<p><a href="${esc(routeLink)}">View route on Google Maps</a></p>` : ''}
    <p><a href="${esc(Deno.env.get('SITE_URL') ?? '')}/admin">Open the admin</a></p>`

  const emailed = await sendEmail(`New order #${order.order_number} · ${naira(order.total)}`, html)

  // If NOTHING got through, release the claim so the order can be retried.
  if (pushed === 0 && !emailed) {
    await supabase.from('orders').update({ notified_at: null }).eq('id', orderId)
    return json({ error: 'no notification could be delivered' }, 502)
  }
  return json({ pushed, emailed })
}

// Tells the owner an order was cancelled, so nobody prepares or delivers it.
// Not "claimed" like new orders: every cancellation is announced once, by cancel-order.
async function notifyCancelled(orderId: string, refund: string, byCustomer: boolean): Promise<Response> {
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, total, payment_method, payment_status, phone, profiles(full_name)')
    .eq('id', orderId)
    .single()
  if (!data) return json({ error: 'order not found' }, 404)

  // deno-lint-ignore no-explicit-any
  const order = data as any
  const customer: string = order.profiles?.full_name || 'A customer'
  const who = byCustomer ? `${customer} cancelled` : 'You cancelled'
  const refundLine =
    order.payment_method !== 'online' || refund === 'none'
      ? 'Nothing to refund (not paid online).'
      : refund === 'failed'
        ? 'REFUND FAILED. Open Payments in the admin to retry.'
        : 'Refund started automatically.'

  const payload = {
    title: `Order #${order.order_number} cancelled`,
    body: `${who} ${naira(order.total)}. ${refundLine}`,
    tag: `cancel-${order.id}`,
    url: '/admin',
  }
  const { data: devices } = await supabase.from('device_tokens').select('id, token')
  const { sent: pushed } = await pushToDevices(devices ?? [], payload)

  const emailed = await sendEmail(
    `Order #${order.order_number} cancelled`,
    `<h2>Order #${order.order_number} cancelled</h2>
     <p>${esc(who)} this order (${naira(order.total)}, ${order.payment_method === 'on_delivery' ? 'pay on delivery' : 'online'}).</p>
     <p><b>${esc(refundLine)}</b></p>
     <p><b>Customer:</b> ${esc(customer)}<br><b>Phone:</b> ${esc(order.phone)}</p>
     <p><a href="${esc(Deno.env.get('SITE_URL') ?? '')}/admin">Open the admin</a></p>`
  )
  return json({ pushed, emailed })
}

async function sendTest(authHeader: string | null): Promise<Response> {
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized', reason: 'No login token was sent. Log out and log in again.' }, 401)
  }
  const token = authHeader.slice(7)
  const reasons: string[] = []
  let userId: string | null = null

  // Check 1: ask Supabase Auth who owns this token, using a client that carries the caller's token.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (anonKey) {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data, error } = await userClient.auth.getUser()
    if (data?.user) userId = data.user.id
    else reasons.push(`user-token check: ${error?.message ?? 'no user returned'}`)
  } else {
    reasons.push('SUPABASE_ANON_KEY is not available inside the function')
  }

  // Check 2 (fallback): the same question, asked with the server's own key.
  if (!userId) {
    const { data, error } = await supabase.auth.getUser(token)
    if (data?.user) userId = data.user.id
    else reasons.push(`service-key check: ${error?.message ?? 'no user returned'}`)
  }

  if (!userId) return json({ error: 'unauthorized', reason: reasons.join(' | ') }, 401)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  if (profileError) return json({ error: 'profile lookup failed', reason: profileError.message }, 500)
  if (!profile?.is_admin) return json({ error: 'forbidden', reason: 'This account is not an admin.' }, 403)

  const { data: devices } = await supabase.from('device_tokens').select('id, token').eq('user_id', userId)
  const { sent, errors } = await pushToDevices(devices ?? [], {
    title: 'Test notification',
    body: 'Order alerts are working on this device.',
    tag: 'test',
    url: '/admin',
  })
  return json({ sent, registered: (devices ?? []).length, errors })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const setupProblem = await initPush()
  if (setupProblem) return json({ error: setupProblem }, 500)

  const body = await req.json().catch(() => ({}))

  // Path 1: the database trigger, proven by a shared secret.
  const secret = req.headers.get('x-webhook-secret')
  if (secret && secret === Deno.env.get('WEBHOOK_SECRET') && body.order_id) {
    if (body.kind === 'cancelled') {
      return await notifyCancelled(String(body.order_id), String(body.refund ?? 'none'), body.by_customer === true)
    }
    return await notifyOrder(String(body.order_id))
  }

  // Path 2: the admin pressing "Send test".
  if (body.test) return await sendTest(req.headers.get('Authorization'))

  return json(
    { error: 'unauthorized', reason: body.test ? 'bad test request' : 'missing test flag or valid webhook secret' },
    401
  )
})
