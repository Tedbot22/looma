import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { classifyPlaceOrderError, fetchMyOrders, fetchOrder, fetchOrderEvents, fetchPurchaseHistory, placeOrder } from './orders'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('placeOrder', () => {
  it('sends the database exactly what it expects, and hands back the new order id', async () => {
    fake.respondWith(() => ({ data: 'order-123' }))
    const id = await placeOrder({
      items: [{ variantId: 'v1', quantity: 2 }, { variantId: 'v2', quantity: 1 }],
      paymentMethod: 'online',
      zoneId: 'zone-1',
      phone: '08012345678',
      couponId: 'coupon-1',
      quoteId: 'quote-1',
    })
    expect(id).toBe('order-123')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'place_order' })
    expect(fake.calls[0].steps[0][1][0]).toEqual({
      p_items: [{ variant_id: 'v1', quantity: 2 }, { variant_id: 'v2', quantity: 1 }],
      p_payment_method: 'online',
      p_zone_id: 'zone-1',
      p_phone: '08012345678',
      p_coupon_id: 'coupon-1',
      p_quote_id: 'quote-1',
    })
  })

  it('sends no money amounts at all (the database works the total out itself)', async () => {
    fake.respondWith(() => ({ data: 'o' }))
    await placeOrder({ items: [{ variantId: 'v', quantity: 1 }], paymentMethod: 'on_delivery', zoneId: 'z', phone: '1', couponId: null, quoteId: null })
    const sent = JSON.stringify(fake.calls[0].steps[0][1][0])
    expect(sent).not.toMatch(/price|total|fee|amount|discount/i)
  })

  it('throws what the database said when it refuses', async () => {
    fake.respondWith(() => ({ error: { message: 'OUT_OF_STOCK: Black Tee' } }))
    await expect(
      placeOrder({ items: [], paymentMethod: 'online', zoneId: 'z', phone: '1', couponId: null, quoteId: null })
    ).rejects.toMatchObject({ message: 'OUT_OF_STOCK: Black Tee' })
  })
})

describe('classifyPlaceOrderError (what checkout tells the customer)', () => {
  const kind = (message: string) => classifyPlaceOrderError({ message })

  it('spots a sold-out or hidden item', () => {
    expect(kind('OUT_OF_STOCK: Black Tee')).toBe('out_of_stock')
    expect(kind('UNAVAILABLE: item was removed')).toBe('out_of_stock')
  })

  it('spots a voucher that can no longer be used', () => {
    for (const m of ['COUPON_USED', 'COUPON_EXPIRED', 'COUPON_MIN_ORDER', 'COUPON_NOT_FOUND']) expect(kind(m), m).toBe('coupon')
  })

  it('spots an expired delivery price and an unavailable delivery option', () => {
    expect(kind('QUOTE_EXPIRED')).toBe('quote')
    expect(kind('QUOTE_NOT_FOUND')).toBe('quote')
    expect(kind('INVALID_ZONE')).toBe('zone')
  })

  it('treats everything else as a general problem', () => {
    expect(kind('connection reset')).toBe('other')
    expect(classifyPlaceOrderError(new Error('boom'))).toBe('other')
    expect(classifyPlaceOrderError(null)).toBe('other')
    expect(classifyPlaceOrderError(undefined)).toBe('other')
  })

  it('finds the code anywhere in the message, as the database wraps it', () => {
    expect(kind('P0001: raise exception: OUT_OF_STOCK: Red Cap (variant 9)')).toBe('out_of_stock')
  })
})

describe('reading orders', () => {
  it('reads one order with its items (the database only returns your own)', async () => {
    fake.respondWith(() => ({ data: { id: 'o1', order_items: [] } }))
    await expect(fetchOrder('o1')).resolves.toMatchObject({ id: 'o1' })
    expect(steps(fake.calls[0])).toBe('select(*, order_items(*)) > eq(id, o1) > maybeSingle()')
  })

  it('reads an order’s history oldest first', async () => {
    await fetchOrderEvents('o1')
    expect(fake.calls[0].target).toBe('order_events')
    expect(steps(fake.calls[0])).toBe('select(*) > eq(order_id, o1) > order(created_at)')
  })

  it('reads this customer’s 50 latest orders, newest first', async () => {
    await fetchMyOrders('u1')
    expect(steps(fake.calls[0])).toBe('select(id, order_number, total, status, created_at) > eq(user_id, u1) > order(created_at, {"ascending":false}) > limit(50)')
  })
})

describe('fetchPurchaseHistory', () => {
  it('ignores cancelled orders and looks only at the latest 20', async () => {
    await fetchPurchaseHistory('u1')
    expect(steps(fake.calls[0])).toBe('select(created_at, order_items(product_variants(product_id))) > eq(user_id, u1) > neq(status, cancelled) > order(created_at, {"ascending":false}) > limit(20)')
  })

  it('lists each product bought with when, and skips lines whose product no longer exists', async () => {
    fake.respondWith(() => ({
      data: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          order_items: [{ product_variants: { product_id: 'p1' } }, { product_variants: null }, { product_variants: { product_id: 'p2' } }],
        },
      ],
    }))
    const at = new Date('2026-06-01T00:00:00.000Z').getTime()
    await expect(fetchPurchaseHistory('u1')).resolves.toEqual([{ productId: 'p1', at }, { productId: 'p2', at }])
  })
})
