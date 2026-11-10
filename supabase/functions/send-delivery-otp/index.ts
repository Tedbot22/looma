// Edge function: send-delivery-otp
//
// The rider taps "Send code by SMS" on their delivery page. This function:
//   1. asks the database for a fresh 6-digit code for that rider's delivery (service role only),
//   2. texts the code to the phone number on the ORDER, and
//   3. tells the database whether the text went out.
//
// The code is never returned to the browser: not to the rider, not to anyone. The rider only
// learns it when the customer reads it out. The secret rider link is the credential, and the
// database re-checks it, so this function needs no login (deploy with --no-verify-jwt).
//
// Secrets (supabase secrets set ...):
//   TERMII_API_KEY     your Termii API key
//   TERMII_SENDER_ID   your approved sender ID
//   TERMII_BASE_URL    optional; your account's base URL (default https://api.ng.termii.com)
//   TERMII_CHANNEL     optional; "dnd" (default, reaches all numbers) or "generic"
//   STORE_NAME         optional; shown at the start of the text (default LOOMA)
//   SMS_DRY_RUN        optional; "true" = don't send, print the text in the function logs (TESTING ONLY)
//supabase secrets set TERMII_API_KEY=tlv_gszDxtGXqitwZS4JBy0cQ8uuqacvCMSeSfaJrx1S3_M TERMII_SENDER_ID=your_sender TERMII_BASE_URL=https://v4.api.termii.com STORE_NAME=LOOMA
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Nigerian numbers only: 0803..., 803..., +234803..., 234803... -> 234803...
function toInternational(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('234')) return d
  if (d.length === 11 && d.startsWith('0')) return '234' + d.slice(1)
  if (d.length === 10 && /^[789]/.test(d)) return '234' + d
  return null
}

// One place talks to the SMS provider, so switching provider later means editing only this.
async function sendSms(to: string, text: string): Promise<boolean> {
  if (Deno.env.get('SMS_DRY_RUN') === 'true') {
    console.log(`[SMS DRY RUN] to=${to} text=${text}`) // testing only: this puts the code in your logs
    return true
  }
  const apiKey = Deno.env.get('TERMII_API_KEY')
  const sender = Deno.env.get('TERMII_SENDER_ID')
  if (!apiKey || !sender) {
    console.error('SMS is not configured: set TERMII_API_KEY and TERMII_SENDER_ID')
    return false
  }
  const base = (Deno.env.get('TERMII_BASE_URL') ?? 'https://api.ng.termii.com').replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${base}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        to,
        from: sender,
        sms: text,
        type: 'plain',
        channel: Deno.env.get('TERMII_CHANNEL') ?? 'dnd',
      }),
    })
    const body = await res.json().catch(() => ({}))
    const ok = res.ok && (body.code === 'ok' || !!body.message_id)
    if (!ok) console.error('SMS provider refused the message', res.status, body?.message ?? '') // never log the text
    return ok
  } catch (e) {
    console.error('SMS request failed', e instanceof Error ? e.name : 'error')
    return false
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, code: 'ERROR' }, 405)

  let token = ''
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token : ''
  } catch {
    /* fall through: empty token is rejected below */
  }
  if (token.length < 20 || token.length > 200) return json({ ok: false, code: 'LINK_INVALID' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // 1. The database checks the link and makes the code. Refusals (expired link, cool-down...) pass straight through.
  const { data, error } = await admin.rpc('rider_request_otp', { p_token: token })
  if (error || !data) {
    console.error('rider_request_otp failed', error?.message)
    return json({ ok: false, code: 'ERROR' }, 500)
  }
  if (!data.ok) return json(data)

  // 2. Text it to the customer's phone on the order.
  const to = toInternational(String(data.phone ?? ''))
  if (!to) {
    await admin.rpc('delivery_otp_sms_result', { p_otp_id: data.otp_id, p_ok: false, p_hint: 'bad_phone_format' })
    return json({ ok: false, code: 'NO_PHONE' })
  }

  const store = Deno.env.get('STORE_NAME') ?? 'LOOMA'
  const minutes = Math.round(Number(data.expires_in_seconds) / 60)
  const text =
    `${store}: your delivery code is ${data.otp}. Give it to your rider only when they are with you. ` +
    `It works for ${minutes} minutes.`

  const sent = await sendSms(to, text)

  // 3. Tell the database. If the text didn't leave, the code is deleted so the rider can try again.
  const hint = `ending ${to.slice(-3)}`
  await admin.rpc('delivery_otp_sms_result', {
    p_otp_id: data.otp_id,
    p_ok: sent,
    p_hint: sent ? hint : 'provider_error',
  })
  if (!sent) return json({ ok: false, code: 'SMS_FAILED' })

  // The code and the full phone number are deliberately NOT in this reply.
  return json({
    ok: true,
    code: 'OTP_SENT',
    phone_hint: hint,
    expires_in_seconds: data.expires_in_seconds,
    cooldown_seconds: data.cooldown_seconds,
  })
})
