// The RIDER taps "Customer wants to pay by transfer" on their delivery page. This function asks
// Paystack for a temporary bank account tied to this one order (Paystack "Pay with Transfer").
// The customer transfers the exact total to it; Paystack tells us (webhook) and the order is marked paid.
// The money lands in YOUR Paystack balance, never with the rider.
//
// The rider has no login: the secret delivery link is the credential. We re-check it by calling the
// same database function the rider page uses (rider_get_delivery), so a dead/expired/reassigned link
// cannot generate an account.
//
// Deploy:  npx supabase functions deploy rider-payment-account --no-verify-jwt
// Needs:   Pay with Transfer enabled on your Paystack account (ask support@paystack.com).
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, corsHeaders, json, paystack, verifyAndMarkTransferPaid } from '../_shared/paystack.ts'

const ACCOUNT_MINUTES = 30 // Paystack allows 15 minutes to 8 hours
const MAX_ACCOUNTS_PER_ORDER = 5 // stops endless account creation from one link

const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)

const publicAccount = (row: Record<string, unknown>) => ({
  account_number: row.account_number,
  account_name: row.account_name,
  bank_name: row.bank_name,
  amount: Number(row.amount_kobo) / 100,
  expires_at: row.expires_at,
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'ERROR' }, 405)

  const { token, action } = await req.json().catch(() => ({}))
  if (!token || typeof token !== 'string') return json({ ok: false, code: 'LINK_INVALID' })

  // 1. Is this link valid right now? Same check as the rider's page.
  const { data: delivery, error: linkError } = await anon.rpc('rider_get_delivery', { p_token: token })
  if (linkError || !delivery || typeof delivery !== 'object') return json({ ok: false, code: 'NETWORK' })
  if (delivery.ok !== true) return json({ ok: false, code: String(delivery.code ?? 'LINK_INVALID') })

  const riderStatus: string = delivery.assignment?.status
  const orderNumber = delivery.order?.order_number
  if (!orderNumber) return json({ ok: false, code: 'ERROR' })

  // 2. The order behind it. The amount always comes from OUR database.
  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, total, status, payment_method, payment_status, order_number')
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (!order) return json({ ok: false, code: 'ERROR' })

  // Not a pay-on-delivery order: nothing for the rider's page to show.
  if (order.payment_method !== 'on_delivery') return json({ ok: true, code: 'OK', applicable: false })

  const paid = order.payment_status === 'paid'
  const nowIso = new Date().toISOString()

  const { data: live } = await admin
    .from('rider_transfer_accounts')
    .select('*')
    .eq('order_id', order.id)
    .eq('status', 'pending')
    .maybeSingle()

  // Close out a live account that ran out of time.
  if (live && live.expires_at <= nowIso) {
    await admin.from('rider_transfer_accounts').update({ status: 'expired' }).eq('id', live.id).eq('status', 'pending')
  }
  const active = live && live.expires_at > nowIso ? live : null

  // ---- status: also asks Paystack directly, so a missed webhook cannot leave the rider waiting ----
  if (action !== 'create') {
    if (!paid && active) {
      const result = await verifyAndMarkTransferPaid(order.id, active.reference)
      if (result.status === 'paid' || result.status === 'already_paid') {
        return json({ ok: true, code: 'OK', applicable: true, paid: true, account: null })
      }
    }
    return json({
      ok: true,
      code: 'OK',
      applicable: true,
      paid,
      account: !paid && active ? publicAccount(active) : null,
    })
  }

  // ---- create ----
  if (paid) return json({ ok: true, code: 'OK', applicable: true, paid: true, account: null })
  if (!['out_for_delivery', 'qr_verified'].includes(riderStatus)) {
    return json({ ok: false, code: 'NOT_STARTED', message: 'Tap "I\'ve picked up the package" first.' })
  }
  if (['cancelled', 'delivered'].includes(order.status) || order.payment_status !== 'pending') {
    return json({ ok: false, code: 'ORDER_CLOSED' })
  }

  // Already have a live account: hand back the same one (refresh / double tap).
  if (active) return json({ ok: true, code: 'OK', applicable: true, paid: false, account: publicAccount(active) })

  const { count } = await admin
    .from('rider_transfer_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id)
  if ((count ?? 0) >= MAX_ACCOUNTS_PER_ORDER) {
    return json({ ok: false, code: 'TRANSFER_LIMIT', message: 'Too many transfer accounts for this order. Contact LOOMA.' })
  }

  // Paystack wants an email for the customer.
  const { data: userData } = await admin.auth.admin.getUserById(order.user_id)
  const email = userData?.user?.email
  if (!email) return json({ ok: false, code: 'NO_EMAIL', message: 'This customer has no email on file. Collect cash or contact LOOMA.' })

  const reference = `cod-${order.id}-${Date.now()}`
  const amountKobo = Math.round(Number(order.total) * 100)
  const expiresAt = new Date(Date.now() + ACCOUNT_MINUTES * 60_000).toISOString()

  const { ok, body } = await paystack('/charge', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      bank_transfer: { account_expires_at: expiresAt },
      metadata: { order_id: order.id, order_number: order.order_number, kind: 'rider_transfer' },
    }),
  })

  const d = body?.data
  if (!ok || !d?.account_number) {
    console.error('Paystack Pay with Transfer failed:', body)
    return json({
      ok: false,
      code: 'TRANSFER_UNAVAILABLE',
      message: 'Transfer payment is not available right now. Collect cash or contact LOOMA.',
    })
  }

  const row = {
    order_id: order.id,
    reference,
    account_number: String(d.account_number),
    account_name: d.account_name ?? null,
    bank_name: d.bank?.name ?? null,
    amount_kobo: amountKobo,
    expires_at: d.account_expires_at ?? expiresAt,
  }
  const { error: insertError } = await admin.from('rider_transfer_accounts').insert(row)
  if (insertError) {
    // Lost a race with a double tap: the other request's account is the one to show.
    const { data: winner } = await admin
      .from('rider_transfer_accounts')
      .select('*')
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (winner) return json({ ok: true, code: 'OK', applicable: true, paid: false, account: publicAccount(winner) })
    console.error('Could not save the transfer account:', insertError)
    return json({ ok: false, code: 'ERROR' })
  }

  return json({ ok: true, code: 'OK', applicable: true, paid: false, account: publicAccount(row) })
})
