import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { couponDiscount, couponStatus, daysLeft, describeCoupon, type Coupon } from './coupons'

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: 'c1',
  code: 'TEST',
  name: 'Test',
  kind: 'fixed_off',
  value: 1000,
  max_discount: 1000,
  min_order: 0,
  source: 'test',
  issued_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-12-31T00:00:00Z',
  used_at: null,
  used_order_id: null,
  discount_applied: null,
  ...over,
})

const order = { subtotal: 10_000, deliveryFee: 1_500, maxUnitPrice: 6_000 }

describe('couponDiscount', () => {
  it('gives nothing when the order is below the minimum', () => {
    expect(couponDiscount(coupon({ min_order: 20_000 }), order)).toBe(0)
  })

  it('applies a minimum that is exactly met', () => {
    expect(couponDiscount(coupon({ min_order: 10_000 }), order)).toBe(1000)
  })

  it('free delivery covers the fee, up to its cap', () => {
    expect(couponDiscount(coupon({ kind: 'free_delivery', max_discount: 2000 }), order)).toBe(1500)
    expect(couponDiscount(coupon({ kind: 'free_delivery', max_discount: 1000 }), order)).toBe(1000)
  })

  it('fixed amount never exceeds the cap or the items total', () => {
    expect(couponDiscount(coupon({ kind: 'fixed_off', value: 3000, max_discount: 2000 }), order)).toBe(2000)
    expect(couponDiscount(coupon({ kind: 'fixed_off', value: 50_000, max_discount: 50_000 }), order)).toBe(10_000)
  })

  it('percent of the order is rounded and capped', () => {
    expect(couponDiscount(coupon({ kind: 'percent_checkout', value: 10, max_discount: 5000 }), order)).toBe(1000)
    expect(couponDiscount(coupon({ kind: 'percent_checkout', value: 50, max_discount: 2500 }), order)).toBe(2500)
    expect(couponDiscount(coupon({ kind: 'percent_checkout', value: 15, max_discount: 5000 }), { ...order, subtotal: 3333 })).toBe(500)
  })

  it('percent off one item uses the priciest single item', () => {
    expect(couponDiscount(coupon({ kind: 'percent_item', value: 30, max_discount: 5000 }), order)).toBe(1800)
    expect(couponDiscount(coupon({ kind: 'percent_item', value: 30, max_discount: 1000 }), order)).toBe(1000)
  })
})

describe('couponStatus / daysLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('is active before expiry, expired after, and used wins over both', () => {
    expect(couponStatus({ used_at: null, expires_at: '2026-07-01T00:00:00Z' })).toBe('active')
    expect(couponStatus({ used_at: null, expires_at: '2026-06-01T00:00:00Z' })).toBe('expired')
    expect(couponStatus({ used_at: '2026-06-10T00:00:00Z', expires_at: '2026-06-01T00:00:00Z' })).toBe('used')
  })

  it('counts whole days left and never goes negative', () => {
    expect(daysLeft('2026-06-18T12:00:00Z')).toBe(3)
    expect(daysLeft('2026-06-15T13:00:00Z')).toBe(1) // part of a day counts as a day
    expect(daysLeft('2026-06-01T00:00:00Z')).toBe(0)
  })
})

describe('describeCoupon', () => {
  it('describes each kind in plain words', () => {
    expect(describeCoupon({ kind: 'free_delivery', value: 0, max_discount: 1500 })).toBe('Free delivery (up to ₦1,500)')
    expect(describeCoupon({ kind: 'fixed_off', value: 1000, max_discount: 1000 })).toBe('₦1,000 off your order')
    expect(describeCoupon({ kind: 'percent_checkout', value: 10, max_discount: 2000 })).toBe('10% off your order (up to ₦2,000)')
    expect(describeCoupon({ kind: 'percent_item', value: 30, max_discount: 1500 })).toBe('30% off one item (up to ₦1,500)')
  })
})
