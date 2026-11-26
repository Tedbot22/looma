import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import {
  attachReviewMedia, classifyReviewError, createReview, fetchAdminReviews, fetchOrderReview, fetchOrderToReview, fetchProductReviews,
  fetchRecentDeliveredOrders, fetchReviewMedia, fetchReviewProducts, fetchReviewStats, fetchReviewedOrderIds, fetchStoreReviews, setReviewVisible,
} from './reviews'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('reading public reviews', () => {
  it('reads the totals from the database', async () => {
    fake.respondWith(() => ({ data: { count: 12, average: 4.6 } }))
    await expect(fetchReviewStats()).resolves.toEqual({ count: 12, average: 4.6 })
    expect(fake.calls[0].target).toBe('store_review_stats')
  })

  it('lists the 100 newest reviews, with no filter by default', async () => {
    await fetchStoreReviews({ rating: null, withComments: false, sort: 'newest' })
    expect(fake.calls[0].target).toBe('public_store_reviews')
    expect(steps(fake.calls[0])).toBe('select(*) > limit(100) > order(created_at, {"ascending":false})')
  })

  it('narrows by stars and by "has a comment", and sorts best or worst first, newest within a rating', async () => {
    await fetchStoreReviews({ rating: 2, withComments: true, sort: 'lowest' })
    expect(steps(fake.calls[0])).toBe(
      'select(*) > limit(100) > eq(rating, 2) > not(message, is, null) > order(rating, {"ascending":true}) > order(created_at, {"ascending":false})'
    )
    await fetchStoreReviews({ rating: null, withComments: false, sort: 'highest' })
    expect(steps(fake.calls[1])).toContain('order(rating, {"ascending":false}) > order(created_at')
  })

  it('combines a product’s reviews with its average and count (numbers may arrive as text)', async () => {
    fake.respondWith((call) =>
      call.target === 'public_product_reviews' ? { data: [{ id: 'r1' }] } : { data: { count: '3', average: '4.33' } }
    )
    await expect(fetchProductReviews('p1')).resolves.toEqual({ reviews: [{ id: 'r1' }], count: 3, average: 4.33 })
  })

  it('shows zeros for a product nobody has reviewed', async () => {
    fake.respondWith((call) => (call.target === 'public_product_reviews' ? { data: [] } : { data: null }))
    await expect(fetchProductReviews('p1')).resolves.toEqual({ reviews: [], count: 0, average: 0 })
  })

  it('groups bought-products and media by review', async () => {
    fake.respondWith((call) =>
      call.target === 'public_review_products'
        ? { data: [{ review_id: 'r1', product_id: 'p1', product_name: 'Tee' }, { review_id: 'r1', product_id: 'p2', product_name: 'Cap' }, { review_id: 'r2', product_id: 'p1', product_name: 'Tee' }] }
        : { data: [{ id: 'm1', review_id: 'r1', kind: 'image', url: 'u' }] }
    )
    const products = await fetchReviewProducts(['r1', 'r2'])
    expect(Object.keys(products)).toEqual(['r1', 'r2'])
    expect(products.r1).toHaveLength(2)
    await expect(fetchReviewMedia(['r1'])).resolves.toEqual({ r1: [{ id: 'm1', review_id: 'r1', kind: 'image', url: 'u' }] })
  })

  it('still shows reviews (without media) when the media can’t be read', async () => {
    fake.respondWith(() => ({ error: { message: 'relation does not exist' } }))
    await expect(fetchReviewMedia(['r1'])).resolves.toEqual({})
  })
})

describe('a customer’s own reviews', () => {
  it('lists the orders they already reviewed', async () => {
    fake.respondWith(() => ({ data: [{ order_id: 'o1' }, { order_id: 'o2' }] }))
    await expect(fetchReviewedOrderIds('u1')).resolves.toEqual(['o1', 'o2'])
    expect(steps(fake.calls[0])).toBe('select(order_id) > eq(user_id, u1)')
  })

  it('finds delivered orders from the recent window, newest first, 10 at most', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'))
    try {
      await fetchRecentDeliveredOrders('u1', 45)
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[0])).toBe(
      'select(id, order_number) > eq(user_id, u1) > eq(status, delivered) > gte(created_at, 2026-05-16T00:00:00.000Z) > order(created_at, {"ascending":false}) > limit(10)'
    )
  })

  it('reads one order’s review and the order being reviewed', async () => {
    await fetchOrderReview('o1')
    await fetchOrderToReview('o1')
    expect(fake.calls.map((c) => `${c.target}: ${steps(c)}`)).toEqual([
      'store_reviews: select(id, rating) > eq(order_id, o1) > maybeSingle()',
      'orders: select(id, order_number, status, order_items(name)) > eq(id, o1) > maybeSingle()',
    ])
  })
})

describe('writing a review', () => {
  it('saves it and returns its id', async () => {
    fake.respondWith(() => ({ data: { id: 'r9' } }))
    await expect(createReview({ orderId: 'o1', userId: 'u1', rating: 5, itemCondition: 'great', delivery: null, message: 'Lovely' })).resolves.toBe('r9')
    expect(steps(fake.calls[0])).toBe(
      'insert({"order_id":"o1","user_id":"u1","rating":5,"item_condition":"great","delivery":null,"message":"Lovely"}) > select(id) > single()'
    )
  })

  it('tells apart "already reviewed" and "not delivered yet" from the database’s codes', async () => {
    expect(classifyReviewError({ code: '23505', message: 'duplicate' })).toBe('already_reviewed')
    expect(classifyReviewError({ code: '42501', message: 'row-level security' })).toBe('not_delivered')
    expect(classifyReviewError({ code: '08006' })).toBe('other')
    expect(classifyReviewError(new Error('offline'))).toBe('other')
  })

  it('refuses with the database’s code intact', async () => {
    fake.respondWith(() => ({ error: { message: 'duplicate key', code: '23505' } }))
    await expect(createReview({ orderId: 'o1', userId: 'u1', rating: 5, itemCondition: null, delivery: null, message: null })).rejects.toMatchObject({ code: '23505' })
  })

  it('attaches uploaded files to the review for this customer', async () => {
    await attachReviewMedia('r9', 'u1', [{ kind: 'image', url: 'a.jpg' }, { kind: 'video', url: 'b.mp4' }])
    expect(fake.calls[0].target).toBe('review_media')
    expect(fake.calls[0].steps[0][1][0]).toEqual([
      { review_id: 'r9', user_id: 'u1', kind: 'image', url: 'a.jpg' },
      { review_id: 'r9', user_id: 'u1', kind: 'video', url: 'b.mp4' },
    ])
  })
})

describe('moderation', () => {
  it('reads the 200 latest reviews with the customer and media, hidden ones included', async () => {
    await fetchAdminReviews()
    expect(steps(fake.calls[0])).toBe('select(*, orders(order_number), profiles(full_name), review_media(id, kind, url)) > order(created_at, {"ascending":false}) > limit(200)')
    expect(steps(fake.calls[0])).not.toContain('is_visible')
  })

  it('hides or shows a review', async () => {
    await setReviewVisible('r1', false)
    expect(steps(fake.calls[0])).toBe('update({"is_visible":false}) > eq(id, r1)')
  })
})
