// Safety net: finds payments Paystack received that our database never processed
// (the webhook failed AND the customer never came back to the site), and fixes them.
// Everything it does goes through the same functions the webhook uses, so it is safe to run as often as you like.
//
// Runs every 15 minutes (see reconcile_cron.sql). Can also be run by hand:
//   curl -X POST "https://YOUR-REF.supabase.co/functions/v1/reconcile-payments" \
//        -H "x-webhook-secret: YOUR_SECRET" -H "Content-Type: application/json" -d '{"hours": 72}'
// Deploy:  npx supabase functions deploy reconcile-payments --no-verify-jwt
// @ts-nocheck
import { admin, json, openIssue, paystack, refundTransaction, verifyAndMarkPaid } from '../_shared/paystack.ts'

const MAX_PAGES = 10 // x 100 transactions per page
const MAX_FIXES_PER_RUN = 50
const PAID_LIKE = ['paid', 'refund_pending', 'refunded', 'refund_failed']

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Our references look like ord-<order id>-<time>.
const orderIdFromReference = (ref: string) => ref.match(/^ord-([0-9a-f-]{36})-\d+$/)?.[1] ?? null

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('WEBHOOK_SECRET') ?? ''
  const given = req.headers.get('x-webhook-secret') ?? ''
  if (!secret || !safeEqual(given, secret)) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 168)
  const from = new Date(Date.now() - hours * 3_600_000).toISOString()
  const to = new Date().toISOString()

  const summary = { checked: 0, fixed: 0, errors: 0, results: {} as Record<string, number>, stuckRefunds: 0, listFailed: false }

  // ---------------------------------------------------------------
  // 1. Every successful Paystack payment in the window must be accounted for.
  // ---------------------------------------------------------------
  // deno-lint-ignore no-explicit-any
  const candidates: { orderId: string; reference: string }[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await paystack(`/transaction?status=success&perPage=100&page=${page}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    if (!res.ok) {
      console.error('Reconcile: could not list transactions', res.body)
      summary.listFailed = true
      break
    }
    // deno-lint-ignore no-explicit-any
    const txs: any[] = res.body.data ?? []

    // deno-lint-ignore no-explicit-any
    const ours = txs
      .map((t) => ({ reference: String(t.reference ?? ''), orderId: orderIdFromReference(String(t.reference ?? '')) }))
      .filter((t): t is { reference: string; orderId: string } => !!t.orderId) // ignore payments that are not for orders
    summary.checked += ours.length

    if (ours.length > 0) {
      const refs = ours.map((t) => t.reference)
      const ids = [...new Set(ours.map((t) => t.orderId))]
      const [{ data: orders }, { data: refunds }] = await Promise.all([
        admin.from('orders').select('id, payment_status, payment_reference').in('id', ids),
        admin.from('payments').select('reference').eq('kind', 'refund').in('reference', refs),
      ])
      const orderById = new Map((orders ?? []).map((o) => [o.id, o]))
      const refunded = new Set((refunds ?? []).map((r) => r.reference))

      for (const t of ours) {
        const o = orderById.get(t.orderId)
        const accountedFor =
          refunded.has(t.reference) || (o && o.payment_reference === t.reference && PAID_LIKE.includes(o.payment_status))
        if (!accountedFor) candidates.push(t)
      }
    }

    const pageCount = res.body.meta?.pageCount ?? 1
    if (page >= pageCount) break
  }

  // verifyAndMarkPaid decides what each one is: a missed payment (mark paid), a duplicate (refund),
  // a wrong amount (refund + flag), or a payment for a cancelled order (refund).
  for (const c of candidates.slice(0, MAX_FIXES_PER_RUN)) {
    const result = await verifyAndMarkPaid(c.orderId, c.reference)
    summary.results[result.status] = (summary.results[result.status] ?? 0) + 1
    if (result.status === 'error') {
      summary.errors++
      console.error('Reconcile error', c, result.message)
    } else {
      summary.fixed++
      console.log('Reconciled', c.orderId, c.reference, result.status)
    }
  }

  // ---------------------------------------------------------------
  // 2. Refunds that got stuck.
  // ---------------------------------------------------------------
  // 2a. "initiated" for over 10 minutes = we crashed around the Paystack call. Running the refund again
  //     first asks Paystack whether it exists, so it can never refund twice.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: stuck } = await admin
    .from('payments')
    .select('order_id, reference, reason')
    .eq('kind', 'refund')
    .eq('status', 'initiated')
    .lt('updated_at', tenMinutesAgo)
    .limit(20)

  for (const r of stuck ?? []) {
    if (!r.order_id) continue
    const { data: order } = await admin.from('orders').select('order_number').eq('id', r.order_id).single()
    await refundTransaction({
      orderId: r.order_id,
      reference: r.reference,
      reason: r.reason ?? 'refund recovered by reconciliation',
      customerNote: `Refund for order #${order?.order_number ?? ''}.`,
      merchantNote: `Recovered by reconciliation for order ${r.order_id}`,
    })
    summary.stuckRefunds++
  }

  // 2b. Pending/processing for over 7 days is not normal. Tell the owner.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()
  const { data: slow } = await admin
    .from('payments')
    .select('order_id, reference')
    .eq('kind', 'refund')
    .in('status', ['pending', 'processing'])
    .lt('created_at', sevenDaysAgo)
    .limit(20)

  for (const r of slow ?? []) {
    await openIssue({
      orderId: r.order_id,
      reference: r.reference,
      kind: 'other',
      detail: 'This refund has been pending for more than 7 days. Check its status on the Paystack dashboard.',
    })
  }

  console.log('Reconcile summary', summary)
  return json(summary)
})
