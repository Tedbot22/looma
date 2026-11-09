// The ONE way an order gets cancelled, for customers and for the owner.
//   1. Cancel first (the database restores the stock in the same transaction).
//   2. Then refund, but only if the order was paid online.
// Deploy:  npx supabase functions deploy cancel-order --no-verify-jwt
// (We check the login ourselves below.)
// @ts-nocheck
import { corsHeaders, getUserFromRequest, isAdminUser, json, openIssue, admin, refundTransaction } from '../_shared/paystack.ts'

const ERRORS: Record<string, [number, string]> = {
  ORDER_NOT_FOUND: [404, 'Order not found.'],
  ORDER_CLOSED: [409, 'This order is already delivered or cancelled.'],
  TOO_LATE: [409, 'This order is already out for delivery, so it can no longer be cancelled here. Please contact customer care.'],
}

// Tells the owner (push + email) that an order was cancelled. Best effort: never blocks the cancel.
async function tellOwner(orderId: string, refund: string, byCustomer: boolean) {
  const secret = Deno.env.get('WEBHOOK_SECRET')
  if (!secret) return
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({ order_id: orderId, kind: 'cancelled', refund, by_customer: byCustomer }),
    })
    if (!res.ok) console.error('Cancel alert failed:', res.status, await res.text())
  } catch (err) {
    console.error('Cancel alert failed:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)

  const { order_id, note } = await req.json().catch(() => ({}))
  if (!order_id) return json({ error: 'Missing order' }, 400)

  const asAdmin = await isAdminUser(user.id)
  const cleanNote = String(note ?? '').trim().slice(0, 300)
  // This text appears on the customer's tracking timeline.
  const timelineNote = asAdmin ? cleanNote || 'Cancelled by the store' : cleanNote ? `Cancelled by you: ${cleanNote}` : 'Cancelled by you'

  // 1. Cancel (ownership, allowed statuses and stock are all enforced inside the database function).
  const { data, error } = await admin.rpc('cancel_order', {
    p_order_id: String(order_id),
    p_actor: user.id,
    p_as_admin: asAdmin,
    p_note: timelineNote,
  })
  if (error) {
    const code = Object.keys(ERRORS).find((c) => error.message.includes(c))
    if (code) return json({ error: ERRORS[code][1] }, ERRORS[code][0])
    console.error('cancel_order failed', error)
    return json({ error: 'Could not cancel the order.' }, 500)
  }

  const order = data as {
    order_id: string
    order_number: number | string
    payment_method: string
    payment_status: string
    payment_reference: string | null
  }

  // 2. Refund only what was actually paid online. Pay-on-delivery and unpaid orders: nothing to refund.
  if (order.payment_method !== 'online' || order.payment_status !== 'paid') {
    if (!asAdmin) await tellOwner(order.order_id, 'none', true)
    return json({ cancelled: true, refund: 'none', message: 'Order cancelled.' })
  }

  if (!order.payment_reference) {
    await openIssue({
      orderId: order.order_id,
      kind: 'other',
      detail: `Order #${order.order_number} was cancelled but it is marked paid with no Paystack reference. Refund it manually.`,
    })
    if (!asAdmin) await tellOwner(order.order_id, 'failed', true)
    return json({ cancelled: true, refund: 'failed', message: 'Order cancelled. The store will arrange your refund.' })
  }

  const who = asAdmin ? 'the store' : 'the customer'
  const outcome = await refundTransaction({
    orderId: order.order_id,
    reference: order.payment_reference,
    reason: `order cancelled by ${who}`,
    customerNote: `Refund for order #${order.order_number}, which was cancelled.`,
    merchantNote: `Order #${order.order_number} (${order.order_id}) cancelled by ${who}`,
  })

  if (!asAdmin) await tellOwner(order.order_id, outcome.status === 'failed' ? 'failed' : outcome.status, true)

  if (outcome.status === 'failed') {
    return json({ cancelled: true, refund: 'failed', message: 'Order cancelled. The refund could not start automatically; the store has been alerted and will sort it out.' })
  }
  return json({
    cancelled: true,
    refund: outcome.status,
    message: 'Order cancelled. Your refund has been started and can take a few business days to reach your account.',
  })
})
