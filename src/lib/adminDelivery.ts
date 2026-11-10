import { STORE_NAME } from '../config'

// Types, labels and helpers for the owner's delivery tools.

export type AssignmentStatus =
  | 'assigned'
  | 'out_for_delivery'
  | 'qr_verified'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'reassigned'

export interface DeliveryAssignment {
  id: string
  order_id: string
  rider_name: string
  rider_phone: string
  dispatch_company: string | null
  status: AssignmentStatus
  expires_at: string
  qr_verified_at: string | null
  completed_at: string | null
  closed_reason: string | null
  created_at: string
}

export interface DeliveryEvent {
  id: string
  event_type: string
  outcome: string | null
  actor: string
  detail: Record<string, unknown> | null
  created_at: string
}

// The result of assign / replace-link / reassign. The raw token exists ONLY here, once.
export interface LinkResult {
  assignment_id: string
  token: string
  expires_at: string
}

export const ACTIVE_STATUSES: AssignmentStatus[] = ['assigned', 'out_for_delivery', 'qr_verified']

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  assigned: 'Assigned',
  out_for_delivery: 'Out for delivery',
  qr_verified: 'QR verified',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  cancelled: 'Cancelled',
  reassigned: 'Reassigned',
}

export const ASSIGNMENT_STYLE: Record<AssignmentStatus, string> = {
  assigned: 'bg-amber-100 text-amber-800',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  qr_verified: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  reassigned: 'bg-gray-100 text-gray-600',
}

export const EVENT_LABEL: Record<string, string> = {
  rider_assigned: 'Rider assigned',
  link_generated: 'Delivery link created',
  link_revoked: 'Old delivery link revoked',
  rider_opened: 'Rider opened the link',
  delivery_started: 'Rider picked up the package',
  qr_generated: 'Customer showed a QR code',
  otp_requested: 'Rider asked for a 6-digit code by SMS',
  otp_sms_sent: 'Code texted to the customer',
  otp_sms_failed: 'Code text could not be sent',
  qr_verification_failed: 'Customer check rejected',
  qr_verified: 'Customer check accepted',
  verification_expired: 'Scan timed out before confirming',
  delivery_completed: 'Delivery completed',
  delivery_failed: 'Delivery failed',
  assignment_cancelled: 'Assignment cancelled',
  rider_reassigned: 'Rider reassigned',
  manual_override: 'Marked delivered by hand (no QR check)',
}

const FAIL_CODE_TEXT: Record<string, string> = {
  QR_INVALID: 'not a valid code',
  QR_USED: 'already used',
  QR_EXPIRED: 'expired',
  OTP_INVALID: 'wrong code',
  OTP_EXPIRED: 'code expired',
  OTP_LOCKED: 'code locked after too many wrong tries',
}

// A short extra detail for an event row, where there is one.
export function eventDetail(e: DeliveryEvent): string | null {
  const d = e.detail
  if (!d) return null
  const method = d.method === 'otp' ? '6-digit code' : d.method === 'qr' ? 'QR' : null
  if (typeof d.code === 'string') return [FAIL_CODE_TEXT[d.code] ?? d.code, method].filter(Boolean).join(', ')
  if (typeof d.reason === 'string' && d.reason) return d.reason.replace(/_/g, ' ')
  if (typeof d.phone_hint === 'string' && d.phone_hint) return d.phone_hint
  if (typeof d.rider_name === 'string') return `${d.rider_name}${d.rider_phone ? ` · ${d.rider_phone}` : ''}`
  if (method) return `by ${method}`
  return null
}

const ERROR_TEXT: Record<string, string> = {
  NOT_ADMIN: "You don't have permission to do that.",
  INVALID_RIDER_DETAILS: "Enter the rider's full name and a valid phone number.",
  ORDER_NOT_FOUND: "We couldn't find that order.",
  ORDER_NOT_ASSIGNABLE: "This order can't be assigned (it may be unpaid, delivered or cancelled).",
  ALREADY_ASSIGNED: 'This order already has a rider. Use Reassign to change them.',
  ASSIGNMENT_CLOSED: 'That assignment has already ended. Refresh the page.',
}

export function friendlyDeliveryError(message: string): string {
  const code = Object.keys(ERROR_TEXT).find((c) => message.includes(c))
  return code ? ERROR_TEXT[code] : 'Something went wrong. Please try again.'
}

// Same rule the database uses, so mistakes are caught before sending.
export const isValidRider = (name: string, phone: string) =>
  name.trim().length >= 2 && /^[0-9+() -]{7,20}$/.test(phone.trim())

// The link the rider opens. The token sits in the path, not a query string.
export const riderLink = (token: string) => `${window.location.origin}/rider/${token}`

// What the admin sends on WhatsApp. It carries the order number only: no customer details.
export function riderMessage(riderName: string, orderNumber: number, url: string): string {
  return (
    `Hi ${riderName.trim().split(' ')[0]}, this is ${STORE_NAME}. ` +
    `Here is your delivery link for order #${orderNumber}:\n\n${url}\n\n` +
    'Open it on your phone. Do not share it with anyone: it only works for you and stops working once the delivery is done.'
  )
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
