// What the owner does with orders and payment problems. Customers never call these.

import { supabase } from '../lib/supabase'
import type { DeliveryAssignment } from '../lib/adminDelivery'
import type { Order, OrderWithItems } from '../lib/types'
import { countOf, run, unwrap } from './db'

/* -------------------------------- orders -------------------------------- */

export type AdminOrder = OrderWithItems & {
  profiles: { full_name: string | null; phone: string | null } | null
  delivery_assignments: DeliveryAssignment[]
}

// The 100 most recent orders (newest first), for one status or all of them, with the customer and any rider.
export function fetchAdminOrders(status: Order['status'] | 'all'): Promise<AdminOrder[]> {
  let query = supabase
    .from('orders')
    .select(
      '*, order_items(*), profiles(full_name, phone), ' +
        'delivery_assignments(id, order_id, rider_name, rider_phone, dispatch_company, status, expires_at, qr_verified_at, completed_at, closed_reason, created_at)'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (status !== 'all') query = query.eq('status', status)
  return unwrap(query) as unknown as Promise<AdminOrder[]>
}

// Moves an order forward. The database checks the move is allowed (and logs it for the customer's timeline).
// The note is shown to the customer on their tracking page.
export const setOrderStatus = (orderId: string, status: 'confirmed' | 'out_for_delivery' | 'delivered', note?: string) =>
  run(supabase.rpc('set_order_status', { p_order_id: orderId, p_status: status, p_note: note ?? null }))

/* ---------------------------- menu badge counts ---------------------------- */

export const countNewOrders = () =>
  countOf(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'placed'))

export const countOpenPaymentIssues = () =>
  countOf(supabase.from('payment_issues').select('id', { count: 'exact', head: true }).is('resolved_at', null))

// Customers the AI has handed over who are still waiting for the owner.
export const countWaitingSupport = () =>
  countOf(supabase.from('support_conversations').select('id', { count: 'exact', head: true }).eq('status', 'escalated'))

/* ----------------------------- payment problems ----------------------------- */

export interface PaymentIssue {
  id: string
  order_id: string | null
  reference: string | null
  kind: 'refund_failed' | 'refund_needs_attention' | 'payment_mismatch' | 'dispute' | 'other'
  detail: string | null
  created_at: string
  orders: { order_number: number | string; phone: string | null; profiles: { full_name: string | null } | null } | null
}

// Problems still waiting for the owner, newest first.
export const fetchOpenPaymentIssues = (): Promise<PaymentIssue[]> =>
  unwrap(
    supabase
      .from('payment_issues')
      .select('*, orders(order_number, phone, profiles(full_name))')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
  ) as unknown as Promise<PaymentIssue[]>

// Marks a problem as dealt with, recording who did it and when.
export async function resolvePaymentIssue(issueId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  await run(
    supabase
      .from('payment_issues')
      .update({ resolved_at: new Date().toISOString(), resolved_by: auth.user?.id })
      .eq('id', issueId)
  )
}
