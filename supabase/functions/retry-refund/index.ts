// Owner-only: retry a refund that failed (from the "Payments" page).
// Deploy:  npx supabase functions deploy retry-refund --no-verify-jwt
// (We check the login and admin rights ourselves below.)
// @ts-nocheck
import { admin, corsHeaders, getUserFromRequest, isAdminUser, json, refundTransaction } from '../_shared/paystack.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUserFromRequest(req)
  if (!user || !(await isAdminUser(user.id))) return json({ error: 'Not allowed.' }, 403)

  const { issue_id } = await req.json().catch(() => ({}))
  if (!issue_id) return json({ error: 'Missing issue' }, 400)

  const { data: issue } = await admin
    .from('payment_issues')
    .select('id, order_id, reference, kind, resolved_at')
    .eq('id', issue_id)
    .single()
  if (!issue || issue.resolved_at) return json({ error: 'Issue not found or already resolved.' }, 404)
  if (issue.kind !== 'refund_failed' || !issue.order_id || !issue.reference) {
    return json({ error: 'Only failed refunds can be retried here.' }, 400)
  }

  const { data: order } = await admin.from('orders').select('order_number').eq('id', issue.order_id).single()

  const outcome = await refundTransaction({
    orderId: issue.order_id,
    reference: issue.reference,
    reason: 'refund retried by the store',
    customerNote: `Refund for order #${order?.order_number ?? ''}.`,
    merchantNote: `Retry by the store for order ${issue.order_id}`,
  })

  if (outcome.status === 'failed') return json({ ok: false, message: outcome.message ?? 'Paystack rejected the refund again.' })

  await admin.from('payment_issues').update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).eq('id', issue.id)
  return json({ ok: true, message: 'Refund started.' })
})
