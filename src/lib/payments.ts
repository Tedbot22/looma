import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Calls one of our payment functions and turns failures into readable messages.
export async function callFunction<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? `Payment service error (${error.context.status}).`)
    }
    throw error
  }
  return data as T
}

// Asks the server to start a Paystack payment. Returns the Paystack page to send the customer to.
// (The server decides the amount from the order, so nothing about money is sent from here.)
export async function startPayment(orderId: string): Promise<string> {
  const { authorization_url } = await callFunction<{ authorization_url: string }>('paystack-init', {
    order_id: orderId,
  })
  return authorization_url
}

export interface VerifyResult {
  status: 'paid' | 'already_paid' | 'not_paid' | 'refunded' | 'error'
  message?: string
}

// After the customer returns from Paystack: ask the server to confirm the payment.
export const verifyPayment = (orderId: string, reference: string) =>
  callFunction<VerifyResult>('paystack-verify', { order_id: orderId, reference })
