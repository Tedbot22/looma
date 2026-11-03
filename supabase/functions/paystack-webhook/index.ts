// Paystack calls this itself when a payment succeeds, even if the customer closed the tab.
// Deploy:  npx supabase functions deploy paystack-webhook --no-verify-jwt
// Then in the Paystack dashboard: Settings > API Keys & Webhooks > set the webhook URL to
//   https://YOUR-PROJECT-REF.supabase.co/functions/v1/paystack-webhook
// @ts-nocheck
import { json, verifyAndMarkPaid } from '../_shared/paystack.ts'

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// Compares two strings without leaking, through timing, how many characters matched.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

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

  if (event.event === 'charge.success') {
    const orderId = event.data?.metadata?.order_id
    const reference = event.data?.reference
    if (orderId && reference) {
      const result = await verifyAndMarkPaid(String(orderId), String(reference))
      console.log('Webhook result', orderId, result)
      // A 500 makes Paystack retry later. Worth it for a real failure; pointless for "already paid".
      if (result.status === 'error') return json({ error: result.message }, 500)
    }
  }

  return json({ received: true }) // always answer 200 for events we don't care about
})
