import { supabase } from './supabase'

// Everything the rider's page asks the database. The rider has no account: the secret
// link token is the credential, and the DATABASE decides whether each action is allowed.
// These functions never invent a success; they only pass on what the server said.

export type RiderStatus = 'assigned' | 'out_for_delivery' | 'qr_verified'

export interface RiderDelivery {
  assignment: {
    status: RiderStatus
    rider_name: string
    rider_phone: string
    dispatch_company: string | null
    link_expires_at: string
  }
  order: {
    order_number: number
    customer_name: string
    customer_phone: string
    delivery_zone: string | null
    delivery_address: string
    delivery_note: string | null
    delivery_lat: number | null
    delivery_lon: number | null
    amount_to_collect: number
  }
  items: { name: string; quantity: number }[]
}

// One reply shape for every rider action. NETWORK is made up here when the server can't be reached.
export interface Reply {
  ok: boolean
  code: string
  [key: string]: unknown
}

async function call(fn: string, args: Record<string, unknown>): Promise<Reply> {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error || !data || typeof data !== 'object') return { ok: false, code: 'NETWORK' }
    const reply = data as Record<string, unknown>
    return { ...reply, ok: reply.ok === true, code: String(reply.code ?? (reply.ok ? 'OK' : 'ERROR')) }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export type FailReason =
  | 'customer_unavailable'
  | 'customer_unreachable'
  | 'wrong_address'
  | 'customer_refused'
  | 'other'

export const getDelivery = (token: string) => call('rider_get_delivery', { p_token: token })
export const startDelivery = (token: string) => call('rider_start_delivery', { p_token: token })
export const verifyQr = (token: string, qr: string) => call('rider_verify_qr', { p_token: token, p_qr: qr })
// Asks the server to TEXT a 6-digit code to the customer's phone. The code never comes back here.
export async function requestOtpSms(token: string): Promise<Reply> {
  try {
    const { data, error } = await supabase.functions.invoke('send-delivery-otp', { body: { token } })
    if (error || !data || typeof data !== 'object') return { ok: false, code: 'NETWORK' }
    const reply = data as Record<string, unknown>
    return { ...reply, ok: reply.ok === true, code: String(reply.code ?? 'ERROR') }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export const verifyOtp = (token: string, code: string) => call('rider_verify_otp', { p_token: token, p_code: code })
export const completeDelivery = (token: string) => call('rider_complete_delivery', { p_token: token })
export const reportFailed = (token: string, reason: FailReason, note: string) =>
  call('rider_report_failed', { p_token: token, p_reason: reason, p_note: note || null })

export const FAIL_REASONS: { value: FailReason; label: string }[] = [
  { value: 'customer_unavailable', label: 'Customer is not at the location' },
  { value: 'customer_unreachable', label: "Can't reach the customer by phone" },
  { value: 'wrong_address', label: "Can't find the address" },
  { value: 'customer_refused', label: 'Customer refused the order' },
  { value: 'other', label: 'Something else' },
]

// Codes that mean "this link is finished": the page stops offering any action.
export const DEAD_LINK_CODES = [
  'LINK_INVALID',
  'LINK_REVOKED',
  'LINK_EXPIRED',
  'CANCELLED',
  'REASSIGNED',
  'DELIVERY_FAILED',
  'ALREADY_DELIVERED',
]

// Plain-language messages for every code the server can send back.
export const MESSAGES: Record<string, { title: string; text: string }> = {
  LINK_INVALID: {
    title: 'This link is not valid',
    text: 'Check that you opened the full link you were sent. If it still fails, ask LOOMA for a new one.',
  },
  LINK_REVOKED: {
    title: 'This link has been cancelled',
    text: 'LOOMA has replaced or withdrawn it. Ask them for your current link.',
  },
  LINK_EXPIRED: {
    title: 'This link has expired',
    text: 'Ask LOOMA to send you a new link for this delivery.',
  },
  CANCELLED: {
    title: 'This delivery was cancelled',
    text: 'You do not need to deliver this order. Contact LOOMA if you think this is a mistake.',
  },
  REASSIGNED: {
    title: 'This delivery was given to another rider',
    text: 'This link no longer works. Contact LOOMA if you were not expecting this.',
  },
  DELIVERY_FAILED: {
    title: 'Delivery attempt recorded as failed',
    text: 'This link is closed. LOOMA will arrange the next step.',
  },
  ALREADY_DELIVERED: {
    title: 'This order has already been delivered',
    text: 'Nothing more to do. Thank you!',
  },
  NETWORK: {
    title: 'No connection',
    text: 'We could not reach the server, so nothing was changed. Check your data or Wi-Fi and try again.',
  },
  QR_INVALID: {
    title: 'That is not a valid delivery code',
    text: 'Ask the customer to open this order in their LOOMA account and tap "Show Delivery QR", then scan again.',
  },
  QR_EXPIRED: {
    title: 'That code has expired',
    text: 'Ask the customer to tap "Show Delivery QR" again for a fresh code.',
  },
  QR_USED: {
    title: 'That code was already used',
    text: 'Ask the customer to tap "Show Delivery QR" again for a fresh code.',
  },
  TOO_MANY_ATTEMPTS: {
    title: 'Too many wrong scans',
    text: 'Please wait about 10 minutes, then try again.',
  },
  OTP_INVALID: {
    title: 'That code is not correct',
    text: 'Check the 6 digits with the customer and try again. If they have not asked for a code yet, ask them to tap "Can\'t use the QR?" in their account.',
  },
  OTP_EXPIRED: {
    title: 'That code has expired',
    text: 'Ask the customer to get a new 6-digit code in their account.',
  },
  OTP_LOCKED: {
    title: 'That code is now locked',
    text: 'Too many wrong tries. Ask the customer to get a new 6-digit code, then enter the new one.',
  },
  OTP_COOLDOWN: {
    title: 'A code was just sent',
    text: 'Wait a moment before asking for another. Ask the customer to check their text messages.',
  },
  OTP_LIMIT: {
    title: 'Too many codes requested',
    text: 'No more codes can be sent for this delivery. Contact LOOMA so they can help verify it.',
  },
  SMS_FAILED: {
    title: "The text couldn't be sent",
    text: 'Check that the customer can receive text messages and try again. If it keeps failing, contact LOOMA.',
  },
  NO_PHONE: {
    title: 'No usable phone number on this order',
    text: 'We cannot text this customer. Contact LOOMA so they can help verify the delivery.',
  },
  ALREADY_VERIFIED: {
    title: 'The customer is already verified',
    text: 'Tap Confirm delivery to finish.',
  },
  OTP_FORMAT: {
    title: 'Enter all 6 digits',
    text: 'The code is 6 numbers long.',
  },
  NOT_VERIFIED: {
    title: "The customer's code has not been scanned yet",
    text: "Scan the customer's QR code first.",
  },
  VERIFICATION_EXPIRED: {
    title: 'The scan timed out',
    text: 'Too much time passed after scanning. Ask the customer for a fresh code and scan again.',
  },
  ORDER_CLOSED: {
    title: 'This order can no longer be delivered',
    text: 'It was cancelled or closed. Contact LOOMA.',
  },
  INVALID_REASON: {
    title: 'Choose a reason',
    text: 'Pick one of the reasons in the list.',
  },
  ERROR: {
    title: 'Something went wrong',
    text: 'Please try again. If it keeps happening, contact LOOMA.',
  },
}

export const messageFor = (code: string) => MESSAGES[code] ?? MESSAGES.ERROR

// ---------- Pay by transfer (pay-on-delivery orders) ----------
// The rider asks for a temporary bank account tied to this order. The customer transfers the exact
// total to it; the server confirms with Paystack. This page never decides whether money arrived.
export interface TransferAccount {
  account_number: string
  account_name: string | null
  bank_name: string | null
  amount: number
  expires_at: string
}

async function transferCall(token: string, action: 'status' | 'create'): Promise<Reply> {
  try {
    const { data, error } = await supabase.functions.invoke('rider-payment-account', { body: { token, action } })
    if (error || !data || typeof data !== 'object') return { ok: false, code: 'NETWORK' }
    const reply = data as Record<string, unknown>
    return { ...reply, ok: reply.ok === true, code: String(reply.code ?? 'ERROR') }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export const getTransferState = (token: string) => transferCall(token, 'status')
export const createTransferAccount = (token: string) => transferCall(token, 'create')
