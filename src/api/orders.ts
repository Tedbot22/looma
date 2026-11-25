// A customer's orders: placing one, and reading their own.

import { supabase } from '../lib/supabase'
import type { Order, OrderEvent, OrderWithItems } from '../lib/types'
import { errorMessage, unwrap } from './db'

/* ------------------------------ placing an order ------------------------------ */

export interface PlaceOrderInput {
  items: { variantId: string; quantity: number }[] // only what can actually be fulfilled
  paymentMethod: Order['payment_method']
  zoneId: string
  phone: string
  couponId: string | null
  quoteId: string | null // home delivery only: the server reads the fee and address from this saved quote
}

// Places the order in ONE step in the database: stock, coupon, delivery fee and total are all checked and
// written together, so it either works completely or nothing happens. Returns the new order's id.
export const placeOrder = (input: PlaceOrderInput): Promise<string> =>
  unwrap<string>(
    supabase.rpc('place_order', {
      p_items: input.items.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      p_payment_method: input.paymentMethod,
      p_zone_id: input.zoneId,
      p_phone: input.phone,
      p_coupon_id: input.couponId,
      p_quote_id: input.quoteId,
    })
  )

// Why placing an order was refused, so checkout can say the right thing:
//   out_of_stock  an item sold out (or was hidden) while the customer was deciding
//   coupon        the voucher was used elsewhere, expired, or the order no longer meets its minimum
//   quote         the delivery price expired
//   zone          the delivery option is no longer available
//   other         anything else
export type PlaceOrderProblem = 'out_of_stock' | 'coupon' | 'quote' | 'zone' | 'other'

export function classifyPlaceOrderError(err: unknown): PlaceOrderProblem {
  const message = errorMessage(err)
  if (message.includes('OUT_OF_STOCK') || message.includes('UNAVAILABLE')) return 'out_of_stock'
  if (message.includes('COUPON_')) return 'coupon'
  if (message.includes('QUOTE_')) return 'quote'
  if (message.includes('INVALID_ZONE')) return 'zone'
  return 'other'
}

/* ------------------------------ reading orders ------------------------------ */

// One order with its items. The database only lets you read your own (the owner can read all).
export const fetchOrder = (orderId: string): Promise<OrderWithItems | null> =>
  unwrap(supabase.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle())

// The steps of an order's history, oldest first (what the tracking timeline is built from).
export const fetchOrderEvents = (orderId: string): Promise<OrderEvent[]> =>
  unwrap(supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at'))

export type MyOrder = Pick<Order, 'id' | 'order_number' | 'total' | 'status' | 'created_at'>

// This customer's 50 most recent orders, newest first.
export const fetchMyOrders = (userId: string): Promise<MyOrder[]> =>
  unwrap(
    supabase
      .from('orders')
      .select('id, order_number, total, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
  )

export interface Purchase {
  productId: string
  at: number // when it was bought (milliseconds)
}

// What this customer has actually bought (cancelled orders don't count), from their 20 latest orders.
export async function fetchPurchaseHistory(userId: string): Promise<Purchase[]> {
  const rows = (await unwrap<unknown>(
    supabase
      .from('orders')
      .select('created_at, order_items(product_variants(product_id))')
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(20)
  )) as { created_at: string; order_items: { product_variants: { product_id: string } | null }[] }[]
  return rows.flatMap((order) =>
    order.order_items.flatMap((line) =>
      line.product_variants?.product_id
        ? [{ productId: line.product_variants.product_id, at: new Date(order.created_at).getTime() }]
        : []
    )
  )
}
