// Everything the rider's page asks the server. The rider has no account: the secret link token is the
// credential, and the DATABASE decides whether each action is allowed. These functions never invent a
// success; they only pass on what the server said. (Wording, codes and shapes live in lib/rider.ts.)

import { supabase } from '../lib/supabase'
import type { FailReason, Reply } from '../lib/rider'

// Turns a server answer into the one reply shape the page understands. A missing or odd answer means we
// could not really reach the server, so NETWORK is made up here (and only here).
function toReply(data: unknown, error: unknown, fallbackCode: string): Reply {
  if (error || !data || typeof data !== 'object') return { ok: false, code: 'NETWORK' }
  const reply = data as Record<string, unknown>
  return { ...reply, ok: reply.ok === true, code: String(reply.code ?? fallbackCode) }
}

async function rpcCall(fn: string, args: Record<string, unknown>): Promise<Reply> {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    return toReply(data, error, (data as { ok?: boolean } | null)?.ok ? 'OK' : 'ERROR')
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

async function functionCall(name: string, body: object): Promise<Reply> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body })
    return toReply(data, error, 'ERROR')
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export const getDelivery = (token: string) => rpcCall('rider_get_delivery', { p_token: token })
export const startDelivery = (token: string) => rpcCall('rider_start_delivery', { p_token: token })
export const verifyQr = (token: string, qr: string) => rpcCall('rider_verify_qr', { p_token: token, p_qr: qr })

// Asks the server to TEXT a 6-digit code to the customer's phone. The code never comes back here.
export const requestOtpSms = (token: string) => functionCall('send-delivery-otp', { token })

export const verifyOtp = (token: string, code: string) => rpcCall('rider_verify_otp', { p_token: token, p_code: code })
export const completeDelivery = (token: string) => rpcCall('rider_complete_delivery', { p_token: token })
export const reportFailed = (token: string, reason: FailReason, note: string) =>
  rpcCall('rider_report_failed', { p_token: token, p_reason: reason, p_note: note || null })

// Pay-by-transfer: the rider asks for a temporary bank account tied to this order. The customer transfers the
// exact total to it; the server confirms with Paystack. This page never decides whether money arrived.
export const getTransferState = (token: string) => functionCall('rider-payment-account', { token, action: 'status' })
export const createTransferAccount = (token: string) => functionCall('rider-payment-account', { token, action: 'create' })
