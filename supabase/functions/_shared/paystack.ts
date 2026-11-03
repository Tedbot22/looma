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

export type VerifyResult = {
  status: 'paid' | 'already_paid' | 'not_paid' | 'refunded' | 'error'
  message?: string
}

// Confirms with Paystack that a payment really happened, for the right amount and the right order,
// and only then marks the order paid. Safe to run more than once (the webhook and the
// customer's return to the site can both call it).
export async function verifyAndMarkPaid(orderId: string, reference: string): Promise<VerifyResult> {
  const { data: order } = await admin.from('orders').select('id, total, status, payment_status').eq('id', orderId).single()
  if (!order) return { status: 'error', message: 'Order not found' }
  if (order.payment_status === 'paid') return { status: 'already_paid' }

  const { ok, body } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
  if (!ok) return { status: 'error', message: body?.message ?? 'Could not verify the payment' }

  const tx = body.data
  if (tx.status !== 'success') return { status: 'not_paid' }

  // Amounts are in kobo (1 naira = 100 kobo). Compare against OUR total, not anything the browser said.
  const expected = Math.round(Number(order.total) * 100)
  if (tx.amount !== expected || tx.currency !== 'NGN' || tx.metadata?.order_id !== orderId) {
    console.error('Payment mismatch', { orderId, reference, paid: tx.amount, expected, currency: tx.currency })
    return { status: 'error', message: 'Payment did not match this order' }
  }

  const { data: marked } = await admin.rpc('mark_order_paid', { p_order_id: orderId, p_reference: reference })
  if (marked) return { status: 'paid' }

  // Not marked: either someone else already did it, or the stock hold expired and the order was cancelled.
  const { data: fresh } = await admin.from('orders').select('status, payment_status').eq('id', orderId).single()
  if (fresh?.payment_status === 'paid') return { status: 'already_paid' }

  if (fresh?.status === 'cancelled') {
    // The customer paid for an order whose items were already released. Give the money back.
    const refund = await paystack('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) })
    if (refund.ok) {
      await admin.from('orders').update({ payment_status: 'refunded', payment_reference: reference }).eq('id', orderId)
      return { status: 'refunded' }
    }
    console.error('REFUND FAILED. Refund this payment manually in Paystack:', reference, refund.body)
    return { status: 'error', message: 'Paid after the order expired and the automatic refund failed. The store will refund you.' }
  }

  return { status: 'error', message: 'Could not update the order' }
}
