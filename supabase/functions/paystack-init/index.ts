// Starts a Paystack payment for an order and returns the page to send the customer to.
// Deploy:  npx supabase functions deploy paystack-init --no-verify-jwt
// (We check the login ourselves below.)
// @ts-nocheck
import { admin, corsHeaders, getUserFromRequest, json, paystack } from '../_shared/paystack.ts'

const HOLD_MINUTES = 30 // keep the items reserved while the customer is paying

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUserFromRequest(req)
  if (!user || !user.email) return json({ error: 'Please log in again.' }, 401)

  const { order_id } = await req.json().catch(() => ({}))
  if (!order_id) return json({ error: 'Missing order' }, 400)

  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, total, status, payment_method, order_number')
    .eq('id', order_id)
    .single()

  // Same message for "not yours" and "doesn't exist", so nobody can probe for other people's orders.
  if (!order || order.user_id !== user.id) return json({ error: 'Order not found.' }, 404)
  if (order.payment_method !== 'online' || order.status !== 'pending_payment') {
    return json({ error: 'This order is not waiting for payment. It may have expired.' }, 409)
  }

  // The customer is committed to paying now, so keep their items reserved a while longer.
  await admin
    .from('orders')
    .update({ expires_at: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() })
    .eq('id', order.id)

  // Each attempt needs a unique reference (letters, numbers and dashes only).
  const reference = `ord-${order.id}-${Date.now()}`
  const siteUrl = Deno.env.get('SITE_URL') ?? ''

  const { ok, body } = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      amount: Math.round(Number(order.total) * 100), // the amount comes from OUR database, never the browser
      currency: 'NGN',
      reference,
      callback_url: `${siteUrl}/order/${order.id}`,
      metadata: { order_id: order.id, order_number: order.order_number },
    }),
  })

  if (!ok) {
    console.error('Paystack initialize failed:', body)
    return json({ error: body?.message ?? 'Could not start the payment.' }, 502)
  }

  return json({ authorization_url: body.data.authorization_url, reference })
})
