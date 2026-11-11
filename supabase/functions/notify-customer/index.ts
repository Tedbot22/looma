// Supabase Edge Function: notify-customer
//
// Sends order-update push notifications to CUSTOMERS (the owner's alerts are notify-order).
//
// Two ways to call it:
//   1. The database trigger `order_customer_notify` (see supabase/customer-push.sql) with the secret header.
//      -> when an order's status changes (or a refund completes), the customer is notified.
//   2. A logged-in customer pressing "Test" on their account page.
//      -> sends a test notification to their own devices.
//
// Deploy with:  npx supabase functions deploy notify-customer --no-verify-jwt
// (--no-verify-jwt because the webhook has no user login. We check access ourselves below.)
// Uses the same secrets as notify-order: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, WEBHOOK_SECRET.
//@ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// deno-lint-ignore no-explicit-any
let webpush: any = null

// Loaded lazily so a setup problem comes back as a readable error instead of crashing the function.
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

interface SubRow {
  id: string
  subscription: unknown
}

// Sends one payload to each saved device. Devices that no longer exist are cleaned up.
async function pushTo(subs: SubRow[], payload: object): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = []
  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 86400, urgency: 'high' })
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string }
        errors.push(`${e.statusCode ?? 'error'}: ${e.body || e.message || 'unknown'}`.slice(0, 300))
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase.from('customer_push_subscriptions').delete().eq('id', s.id)
        }
        throw err
      }
    })
  )
  return { sent: results.filter((r) => r.status === 'fulfilled').length, errors }
}

// What to tell the customer, or null when this change isn't worth a notification.
// deno-lint-ignore no-explicit-any
function messageFor(rec: any, old: any): { title: string; body: string } | null {
  const n = `#${rec.order_number}`

  if (old && rec.status !== old.status) {
    switch (rec.status) {
      case 'placed':
        // Only when a payment just went through. Pay-on-delivery orders start as "placed" (an insert).
        return old.status === 'pending_payment'
          ? { title: 'Payment received', body: `Thank you! We've received your order ${n} and will confirm it shortly.` }
          : null
      case 'confirmed':
        return { title: `Order ${n} confirmed`, body: "We're getting your order ready for delivery." }
      case 'out_for_delivery':
        return {
          title: `Order ${n} is on the way`,
          body: 'Your rider is on the way. Please keep your phone nearby and have your delivery QR code or OTP ready for verification..',
        }
      case 'delivered':
        return { title: `Order ${n} delivered`, body: ' Your order has been delivered successfully. Thank you for choosing Looma' }
      case 'cancelled': {
        // An unpaid checkout that was abandoned or expired isn't worth a notification.
        if (old.status === 'pending_payment') return null
        const paidOnline =
          rec.payment_method === 'online' && ['paid', 'refund_pending', 'refunded'].includes(rec.payment_status)
        return {
          title: `Order ${n} cancelled`,
          body: paidOnline ? 'Your refund is being processed.' : 'This order was cancelled.',
        }
      }
      default:
        return null
    }
  }

  if (old && rec.payment_status !== old.payment_status && rec.payment_status === 'refunded') {
    return {
      title: `Refund sent for order ${n}`,
      body: '`Your refund has been processed successfully. Please allow a few business days for the funds to reflect in your bank account.`',
    }
  }
  return null
}

async function handleWebhook(body: Record<string, unknown>): Promise<Response> {
  if (body.table !== 'orders' || body.type !== 'UPDATE') return json({ skipped: 'not an order update' })

  // deno-lint-ignore no-explicit-any
  const rec = body.record as any
  // deno-lint-ignore no-explicit-any
  const old = body.old_record as any
  if (!rec?.id || !rec?.user_id) return json({ skipped: 'no customer on this order' })

  const msg = messageFor(rec, old)
  if (!msg) return json({ skipped: 'nothing to announce' })

  const { data: subs } = await supabase
    .from('customer_push_subscriptions')
    .select('id, subscription')
    .eq('user_id', rec.user_id)
  if (!subs || subs.length === 0) return json({ sent: 0, registered: 0 })

  const { sent, errors } = await pushTo(subs, {
    ...msg,
    tag: `order-${rec.id}`, // one notification per order: a newer update replaces the older one
    url: `/order/${rec.id}`,
  })
  if (errors.length > 0) console.error('Customer push errors:', errors)
  return json({ sent, registered: subs.length })
}

async function handleTest(authHeader: string | null): Promise<Response> {
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7))
  if (error || !data?.user) return json({ error: 'unauthorized' }, 401)

  const { data: subs } = await supabase
    .from('customer_push_subscriptions')
    .select('id, subscription')
    .eq('user_id', data.user.id)
  const { sent, errors } = await pushTo(subs ?? [], {
    title: 'Notifications are working',
    body: "You'll get updates here as your orders move.",
    tag: 'test',
    url: '/account/orders',
  })
  return json({ sent, registered: (subs ?? []).length, errors })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const setupProblem = await initPush()
  if (setupProblem) return json({ error: setupProblem }, 500)

  const body = await req.json().catch(() => ({}))

  const secret = req.headers.get('x-webhook-secret')
  if (secret && secret === Deno.env.get('WEBHOOK_SECRET')) return await handleWebhook(body)

  if (body.test) return await handleTest(req.headers.get('Authorization'))

  return json({ error: 'unauthorized' }, 401)
})
