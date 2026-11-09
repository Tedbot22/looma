// Shared helpers for the Paystack functions.
// The IMPORTANT rule of online payments lives here, in one place:
//   never believe the browser about whether someone paid. Ask Paystack directly.
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

// Powerful key: stays on the server, never in the browser.
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Calls Paystack's API with our secret key.
export async function paystack(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  // deno-lint-ignore no-explicit-any
  const body: any = await res.json().catch(() => ({}))
  return { ok: res.ok && body.status === true, body }
}

// Who is calling? Reads the login token the browser sends.
export async function getUserFromRequest(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data?.user ?? null
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).single()
  return data?.is_admin === true
}

// ---------------------------------------------------------------------
// Owner alerts + the "Needs attention" queue
// ---------------------------------------------------------------------
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function alertOwner(subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('OWNER_EMAIL')
  if (!key || !to) return
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Store Orders <onboarding@resend.dev>', to: [to], subject, html }),
    })
    if (!res.ok) console.error('Owner alert email failed:', res.status, await res.text())
  } catch (err) {
    console.error('Owner alert email failed:', err)
  }
}

export type IssueKind = 'refund_failed' | 'refund_needs_attention' | 'payment_mismatch' | 'dispute' | 'other'

// Saves a problem the owner must look at, and emails them ONCE per open issue
// (webhook retries must not spam the owner).
export async function openIssue(i: {
  orderId?: string | null
  reference?: string | null
  kind: IssueKind
  detail: string
  raw?: unknown
}) {
  let existing = admin.from('payment_issues').select('id').eq('kind', i.kind).is('resolved_at', null)
  existing = i.reference ? existing.eq('reference', i.reference) : existing.is('reference', null)
  const { data: open } = await existing.limit(1)
  if (open && open.length > 0) return

  const { error } = await admin.from('payment_issues').insert({
    order_id: i.orderId ?? null,
    reference: i.reference ?? null,
    kind: i.kind,
    detail: i.detail,
    raw: i.raw ?? null,
  })
  if (error) console.error('Could not save payment issue:', error, i)

  await alertOwner(
    `Payment needs attention: ${i.kind.replace(/_/g, ' ')}`,
    `<p>${esc(i.detail)}</p><p>Paystack reference: <b>${esc(i.reference ?? 'n/a')}</b></p>` +
      `<p>Open the admin page, Payments tab, to deal with it.</p>`
  )
}

export async function resolveIssues(reference: string, kinds: IssueKind[]) {
  await admin
    .from('payment_issues')
    .update({ resolved_at: new Date().toISOString() })
    .eq('reference', reference)
    .in('kind', kinds)
    .is('resolved_at', null)
}

// ---------------------------------------------------------------------
// The payments audit trail
// ---------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
export async function recordCharge(orderId: string, tx: any) {
  const { error } = await admin.from('payments').upsert(
    {
      order_id: orderId,
      kind: 'charge',
      reference: tx.reference,
      amount_kobo: tx.amount,
      currency: tx.currency ?? 'NGN',
      status: tx.status,
      raw: tx,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'kind,reference' }
  )
  if (error) console.error('Could not record charge:', error)
}

// ---------------------------------------------------------------------
// Refunds. One function, used everywhere, safe to call twice.
// ---------------------------------------------------------------------
export type RefundOutcome = {
  status: 'initiated' | 'pending' | 'processing' | 'processed' | 'needs-attention' | 'failed'
  already?: boolean // true when a refund for this transaction already existed, so Paystack was NOT called again
  message?: string
}

const IN_FLIGHT_MS = 2 * 60_000

function normaliseRefundStatus(s: unknown): RefundOutcome['status'] {
  const v = String(s ?? 'pending').toLowerCase()
  if (v === 'processed' || v === 'processing' || v === 'needs-attention' || v === 'failed') return v
  return 'pending'
}

// deno-lint-ignore no-explicit-any
async function saveRefundResult(orderId: string, reference: string, data: any): Promise<RefundOutcome['status']> {
  const status = normaliseRefundStatus(data?.status)
  const { error } = await admin
    .from('payments')
    .update({
      status,
      paystack_refund_id: data?.id != null ? String(data.id) : null,
      amount_kobo: data?.amount ?? null,
      raw: data,
      updated_at: new Date().toISOString(),
    })
    .eq('kind', 'refund')
    .eq('reference', reference)
  if (error) console.error('Refund accepted by Paystack but could not be saved:', reference, error)

  // Never move an order backwards (e.g. a late "pending" after "processed").
  const orderStatus = status === 'processed' ? 'refunded' : status === 'failed' ? 'refund_failed' : 'refund_pending'
  const update = admin.from('orders').update({ payment_status: orderStatus }).eq('id', orderId)
  await (orderStatus === 'refund_pending' ? update.neq('payment_status', 'refunded') : update)
  if (status === 'processed') await resolveIssues(reference, ['refund_failed', 'refund_needs_attention'])
  return status
}

export async function refundTransaction(opts: {
  orderId: string
  reference: string // the Paystack reference of the payment being refunded
  reason: string // for the audit trail
  customerNote: string // Paystack shows this to the customer
  merchantNote: string // shows on your Paystack dashboard
}): Promise<RefundOutcome> {
  const { orderId, reference } = opts
  const now = () => new Date().toISOString()

  // 1. Record the refund BEFORE calling Paystack. unique(kind, reference) means only one
  //    caller can create the row; everyone else sees what already happened.
  const { error: insertError } = await admin.from('payments').insert({
    order_id: orderId,
    kind: 'refund',
    reference,
    status: 'initiated',
    reason: opts.reason,
  })

  if (insertError) {
    const { data: existing } = await admin
      .from('payments')
      .select('status, updated_at')
      .eq('kind', 'refund')
      .eq('reference', reference)
      .single()
    if (!existing) {
      console.error('Could not record refund:', insertError)
      return { status: 'failed', message: 'Could not record the refund' }
    }

    if (['pending', 'processing', 'processed', 'needs-attention'].includes(existing.status)) {
      return { status: existing.status as RefundOutcome['status'], already: true }
    }

    if (existing.status === 'initiated') {
      // Either another request is in the middle of it, or an earlier one crashed after calling
      // Paystack but before saving the answer. Ask Paystack whether the refund exists.
      // [verify] the list-refunds filter name against Paystack's docs.
      const found = await paystack(`/refund?reference=${encodeURIComponent(reference)}`)
      const hit = found.ok && Array.isArray(found.body.data) ? found.body.data[0] : null
      if (hit) {
        const status = await saveRefundResult(orderId, reference, hit)
        return { status, already: true }
      }
      if (Date.now() - new Date(existing.updated_at).getTime() < IN_FLIGHT_MS) {
        return { status: 'initiated', already: true } // another request is working on it right now
      }
    }
    // existing.status === 'failed' (or a stale 'initiated' with no Paystack refund): try again.
    await admin.from('payments').update({ status: 'initiated', updated_at: now() }).eq('kind', 'refund').eq('reference', reference)
  }

  // 2. Ask Paystack to refund the full amount.
  const res = await paystack('/refund', {
    method: 'POST',
    body: JSON.stringify({
      transaction: reference,
      customer_note: opts.customerNote,
      merchant_note: opts.merchantNote,
    }),
  })

  // 3a. Paystack said no: keep the evidence, flag the order, tell the owner.
  if (!res.ok) {
    const message = res.body?.message ?? 'Paystack rejected the refund'
    console.error('REFUND FAILED:', reference, res.body)
    await admin.from('payments').update({ status: 'failed', raw: res.body, updated_at: now() }).eq('kind', 'refund').eq('reference', reference)
    await admin.from('orders').update({ payment_status: 'refund_failed' }).eq('id', orderId)
    await openIssue({
      orderId,
      reference,
      kind: 'refund_failed',
      detail: `Refund failed: ${message}. Reason for the refund: ${opts.reason}.`,
      raw: res.body,
    })
    return { status: 'failed', message }
  }

  // 3b. Paystack accepted it. That is NOT the same as "money returned": it starts as pending/processing.
  const status = await saveRefundResult(orderId, reference, res.body.data)
  return { status }
}

// Used by the webhook for refund.* events (also covers refunds made from the Paystack dashboard).
// [verify] the exact payload field names against a real refund.processed event.
// deno-lint-ignore no-explicit-any
export async function applyRefundEvent(eventName: string, data: any) {
  const reference: string | undefined = data?.transaction_reference ?? data?.transaction?.reference
  if (!reference) return
  const status = normaliseRefundStatus(eventName.replace('refund.', ''))

  const { data: row } = await admin.from('payments').select('order_id').eq('kind', 'refund').eq('reference', reference).maybeSingle()
  let orderId: string | null = row?.order_id ?? null

  if (!row) {
    // A refund we did not start (made in the Paystack dashboard). Our references look like ord-<order id>-<time>.
    orderId = reference.match(/^ord-([0-9a-f-]{36})-\d+$/)?.[1] ?? null
    await admin.from('payments').insert({ order_id: orderId, kind: 'refund', reference, status, reason: 'Started outside the app', raw: data })
  } else {
    await admin
      .from('payments')
      .update({
        status,
        paystack_refund_id: data?.id != null ? String(data.id) : null,
        raw: data,
        updated_at: new Date().toISOString(),
      })
      .eq('kind', 'refund')
      .eq('reference', reference)
  }
  if (!orderId) return

  if (status === 'processed') {
    await admin.from('orders').update({ payment_status: 'refunded' }).eq('id', orderId)
    await resolveIssues(reference, ['refund_failed', 'refund_needs_attention'])
  } else if (status === 'failed') {
    await admin.from('orders').update({ payment_status: 'refund_failed' }).eq('id', orderId)
    await openIssue({ orderId, reference, kind: 'refund_failed', detail: 'Paystack reported that the refund failed.', raw: data })
  } else {
    await admin.from('orders').update({ payment_status: 'refund_pending' }).eq('id', orderId).neq('payment_status', 'refunded')
    if (status === 'needs-attention') {
      await openIssue({
        orderId,
        reference,
        kind: 'refund_needs_attention',
        detail: 'Paystack needs the customer’s bank details to finish this refund (common with bank transfers).',
        raw: data,
      })
    }
  }
}

// ---------------------------------------------------------------------
// Confirming a payment
// ---------------------------------------------------------------------
export type VerifyResult = {
  status:
    | 'paid'
    | 'already_paid'
    | 'not_paid'
    | 'refunded' // paid after the order was cancelled/expired: refund started
    | 'duplicate_refunded' // paid twice: the extra payment is being refunded
    | 'mismatch' // wrong amount/currency: refund started and the owner flagged
    | 'refund_failed' // we tried to refund and Paystack said no: queued for the owner
    | 'error'
  message?: string
}

// Confirms with Paystack that a payment really happened, for the right amount and the right order,
// and only then marks the order paid. Safe to run more than once (the webhook and the
// customer's return to the site can both call it).
export async function verifyAndMarkPaid(orderId: string, reference: string): Promise<VerifyResult> {
  // Our references are always ord-<order id>-<time>. Refusing anything else stops a customer from
  // pointing their order at somebody else's payment (which we might then refund by mistake).
  if (!reference.startsWith(`ord-${orderId}-`)) {
    return { status: 'error', message: 'That payment does not belong to this order' }
  }

  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, total, status, payment_status, payment_reference')
    .eq('id', orderId)
    .single()
  if (!order) return { status: 'error', message: 'Order not found' }

  // Cheap exit for the common repeat call (webhook after the customer's return).
  if (order.payment_status === 'paid' && order.payment_reference === reference) return { status: 'already_paid' }

  const { ok, body } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
  if (!ok) return { status: 'error', message: body?.message ?? 'Could not verify the payment' }

  const tx = body.data
  if (tx.status !== 'success') return { status: 'not_paid' }
  await recordCharge(orderId, tx)

  const refund = (reason: string) =>
    refundTransaction({
      orderId,
      reference,
      reason,
      customerNote: `Refund for order #${order.order_number}: ${reason}`,
      merchantNote: `Order #${order.order_number} (${orderId}): ${reason}`,
    })
  const failed = (r: { status: string }) => r.status === 'failed'

  // A DIFFERENT successful payment for an order that is already paid = the customer paid twice.
  if (order.payment_status === 'paid') {
    const r = await refund('duplicate payment')
    return failed(r)
      ? { status: 'refund_failed', message: 'Duplicate payment; the refund is queued for the store.' }
      : { status: 'duplicate_refunded' }
  }

  // Amounts are in kobo (1 naira = 100 kobo). Compare against OUR total, not anything the browser said.
  const expected = Math.round(Number(order.total) * 100)
  if (tx.amount !== expected || tx.currency !== 'NGN' || tx.metadata?.order_id !== orderId) {
    console.error('Payment mismatch', { orderId, reference, paid: tx.amount, expected, currency: tx.currency })
    await openIssue({
      orderId,
      reference,
      kind: 'payment_mismatch',
      detail: `Paid ${tx.amount} ${tx.currency} (kobo) but the order expects ${expected} NGN. The payment is being refunded automatically.`,
      raw: tx,
    })
    const r = await refund('the payment did not match the order amount')
    return failed(r)
      ? { status: 'refund_failed', message: 'Payment mismatch; the refund is queued for the store.' }
      : { status: 'mismatch', message: 'The amount paid did not match your order, so it is being refunded.' }
  }

  const { data: marked } = await admin.rpc('mark_order_paid', { p_order_id: orderId, p_reference: reference })
  if (marked) return { status: 'paid' }

  // Not marked: either someone else already did it, or the order was cancelled / the stock hold expired.
  const { data: fresh } = await admin.from('orders').select('status, payment_status, payment_reference').eq('id', orderId).single()

  if (fresh?.payment_status === 'paid') {
    if (fresh.payment_reference === reference) return { status: 'already_paid' }
    const r = await refund('duplicate payment') // two payments raced; the other one won
    return failed(r)
      ? { status: 'refund_failed', message: 'Duplicate payment; the refund is queued for the store.' }
      : { status: 'duplicate_refunded' }
  }

  if (fresh?.status === 'cancelled') {
    // The customer paid for an order whose items were already released. Give the money back.
    const r = await refund('the order was cancelled before the payment arrived')
    return failed(r)
      ? { status: 'refund_failed', message: 'Paid after the order was cancelled. The store will refund you.' }
      : { status: 'refunded' }
  }

  return { status: 'error', message: 'Could not update the order' }
}
