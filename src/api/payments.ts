// Payments, refunds and cancelling. All of it is decided by the server: nothing about money is sent from here.

import { callFunction } from './functions'

// Asks the server to start a Paystack payment. Returns the Paystack page to send the customer to.
// (The server decides the amount from the order, so nothing about money is sent from here.)
export async function startPayment(orderId: string): Promise<string> {
  const { authorization_url } = await callFunction<{ authorization_url: string }>('paystack-init', {
    order_id: orderId,
  })
  return authorization_url
}

export interface VerifyResult {
  status:
    | 'paid'
    | 'already_paid'
    | 'not_paid'
    | 'refunded'
    | 'duplicate_refunded'
    | 'mismatch'
    | 'refund_failed'
    | 'error'
  message?: string
}

// After the customer returns from Paystack: ask the server to confirm the payment.
export const verifyPayment = (orderId: string, reference: string) =>
  callFunction<VerifyResult>('paystack-verify', { order_id: orderId, reference })

export interface CancelResult {
  cancelled: boolean
  refund: 'none' | 'failed' | 'initiated' | 'pending' | 'processing' | 'processed' | 'needs-attention'
  message: string
}

// Cancels an order. The SERVER checks the order is yours (or that you are the owner), that it is
// early enough to cancel, puts the items back in stock, and refunds if it was paid online.
export const cancelOrder = (orderId: string, note?: string) =>
  callFunction<CancelResult>('cancel-order', { order_id: orderId, note })

// Owner only: try a failed refund again.
export const retryRefund = (issueId: string) =>
  callFunction<{ ok: boolean; message: string }>('retry-refund', { issue_id: issueId })
