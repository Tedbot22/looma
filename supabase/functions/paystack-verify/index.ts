// Called by the website when the customer comes back from Paystack,
// so the order updates immediately instead of waiting for the webhook.
// Deploy:  npx supabase functions deploy paystack-verify --no-verify-jwt
// @ts-nocheck
import { admin, corsHeaders, getUserFromRequest, json, verifyAndMarkPaid } from '../_shared/paystack.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)

  const { order_id, reference } = await req.json().catch(() => ({}))
  if (!order_id || !reference) return json({ error: 'Missing details' }, 400)

  const { data: order } = await admin.from('orders').select('user_id').eq('id', order_id).single()
  if (!order || order.user_id !== user.id) return json({ error: 'Order not found.' }, 404)

  return json(await verifyAndMarkPaid(String(order_id), String(reference)))
})
