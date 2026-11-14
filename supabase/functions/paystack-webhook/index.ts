// Paystack calls this itself when something happens to a payment, even if the customer closed the tab.
// Deploy:  npx supabase functions deploy paystack-webhook --no-verify-jwt
// Then in the Paystack dashboard: Settings > API Keys & Webhooks > set the webhook URL to
//   https://YOUR-PROJECT-REF.supabase.co/functions/v1/paystack-webhook
// @ts-nocheck
import { admin, applyRefundEvent, json, openIssue, resolveIssues, verifyAndMarkPaid, verifyAndMarkTransferPaid } from '../_shared/paystack.ts'

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// Compares two strings without leaking, through timing, how many characters matched.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const REFUND_EVENTS = ['refund.pending', 'refund.processing', 'refund.processed', 'refund.failed', 'refund.needs-attention']

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Anyone on the internet can POST here, so first prove the message really came from Paystack:
  // they sign the exact body with our secret key.
  const raw = await req.text()
  const signature = req.headers.get('x-paystack-signature') ?? ''

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const expected = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  if (!signature || !safeEqual(signature, expected)) return json({ error: 'Invalid signature' }, 401)

  const event = JSON.parse(raw)

  try {
    if (event.event === 'charge.success') {
      const orderId = event.data?.metadata?.order_id
      const reference = event.data?.reference
      if (orderId && reference) {
        // cod-... = a pay-on-delivery order paid by transfer to a rider-generated account.
        const result = String(reference).startsWith('cod-')
          ? await verifyAndMarkTransferPaid(String(orderId), String(reference))
          : await verifyAndMarkPaid(String(orderId), String(reference))
        console.log('Webhook result', orderId, result)
        // A 500 makes Paystack retry later. Worth it for a transient failure (we could not reach Paystack,
        // the database hiccupped). Mismatches and failed refunds are already saved for the owner, so
        // those answer 200: retrying cannot fix them.
        if (result.status === 'error') return json({ error: result.message }, 500)
      }
    } else if (event.event === 'bank.transfer.rejected') {
      // The customer sent the wrong amount or was flagged: the rider's account will not accept it.
      // [verify] payload shape against a real rejected-transfer event.
      const reference = event.data?.reference ?? event.data?.transaction?.reference ?? null
      if (reference && String(reference).startsWith('cod-')) {
        await admin.from('rider_transfer_accounts').update({ status: 'rejected' }).eq('reference', String(reference)).eq('status', 'pending')
        await openIssue({
          orderId: event.data?.metadata?.order_id ?? null,
          reference: String(reference),
          kind: 'other',
          detail: 'A bank transfer to a rider-generated account was rejected (wrong amount or flagged). The rider may need to generate a new account or take cash.',
          raw: event.data,
        })
      }
    } else if (REFUND_EVENTS.includes(event.event)) {
      await applyRefundEvent(event.event, event.data)
    } else if (event.event === 'charge.dispute.create') {
      // [verify] payload shape against a real dispute event.
      const reference = event.data?.transaction?.reference ?? event.data?.transaction_reference ?? null
      await openIssue({
        orderId: event.data?.transaction?.metadata?.order_id ?? null,
        reference,
        kind: 'dispute',
        detail: 'A customer opened a dispute (chargeback) on this payment. Respond in the Paystack dashboard before the deadline.',
        raw: event.data,
      })
    } else if (event.event === 'charge.dispute.resolve') {
      const reference = event.data?.transaction?.reference ?? event.data?.transaction_reference
      if (reference) await resolveIssues(String(reference), ['dispute'])
    }
  } catch (err) {
    console.error('Webhook handler crashed', event.event, err)
    return json({ error: 'Handler failed' }, 500) // let Paystack retry
  }

  return json({ received: true }) // always answer 200 for events we don't care about
})
