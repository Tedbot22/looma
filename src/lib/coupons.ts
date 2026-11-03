import { formatNaira } from './format'

export type CouponKind = 'free_delivery' | 'fixed_off' | 'percent_checkout' | 'percent_item'

// A coupon a customer holds. Its terms were copied from the reward pool when it was issued.
export interface Coupon {
  id: string
  code: string
  name: string
  kind: CouponKind
  value: number
  max_discount: number // the most this coupon can ever cost the store
  min_order: number
  source: string
  issued_at: string
  expires_at: string
  used_at: string | null
  used_order_id: string | null
  discount_applied: number | null
}

export type CouponStatus = 'active' | 'used' | 'expired'

export function couponStatus(c: Pick<Coupon, 'used_at' | 'expires_at'>): CouponStatus {
  if (c.used_at) return 'used'
  return new Date(c.expires_at).getTime() < Date.now() ? 'expired' : 'active'
}

// Plain-language description, e.g. "30% off one item (up to ₦1,500)".
export function describeCoupon(c: Pick<Coupon, 'kind' | 'value' | 'max_discount'>): string {
  switch (c.kind) {
    case 'free_delivery':
      return `Free delivery (up to ${formatNaira(c.max_discount)})`
    case 'fixed_off':
      return `${formatNaira(c.value)} off your order`
    case 'percent_checkout':
      return `${c.value}% off your order (up to ${formatNaira(c.max_discount)})`
    case 'percent_item':
      return `${c.value}% off one item (up to ${formatNaira(c.max_discount)})`
  }
}

export interface DiscountContext {
  subtotal: number // the items total
  deliveryFee: number
  maxUnitPrice: number // the price of the priciest single item in the order
}

// What this coupon takes off an order. This mirrors the calculation inside the database's
// place_order(), so the customer sees the right number BEFORE ordering. The database still
// does its own calculation and is the one that counts.
export function couponDiscount(c: Coupon, ctx: DiscountContext): number {
  if (ctx.subtotal < c.min_order) return 0

  switch (c.kind) {
    case 'free_delivery':
      return Math.min(ctx.deliveryFee, c.max_discount)
    case 'fixed_off':
      return Math.min(c.value, c.max_discount, ctx.subtotal)
    case 'percent_checkout':
      return Math.min(Math.round((ctx.subtotal * c.value) / 100), c.max_discount)
    case 'percent_item':
      return Math.min(Math.round((ctx.maxUnitPrice * c.value) / 100), c.max_discount)
  }
}

export function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
}
