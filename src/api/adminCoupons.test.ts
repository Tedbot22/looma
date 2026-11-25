import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { deleteTemplate, fetchCouponStats, fetchIssuedCoupons, fetchReferredPeople, fetchTemplates, saveTemplate, setTemplateActive } from './adminCoupons'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const row = { name: 'Free delivery', kind: 'free_delivery' as const, value: 0, max_discount: 1500, min_order: 0, weight: 5 }

describe('reward pool', () => {
  it('lists rewards oldest first', async () => {
    await fetchTemplates()
    expect(fake.calls[0].target).toBe('coupon_templates')
    expect(steps(fake.calls[0])).toBe('select(*) > order(created_at)')
  })

  it('adds a new reward when no id is given, and changes the existing one when it is', async () => {
    await saveTemplate(row)
    await saveTemplate(row, 't1')
    expect(fake.calls.map((c) => steps(c))).toEqual([`insert(${JSON.stringify(row)})`, `update(${JSON.stringify(row)}) > eq(id, t1)`])
  })

  it('switches a reward on or off, and deletes one', async () => {
    await setTemplateActive('t1', false)
    await deleteTemplate('t1')
    expect(fake.calls.map((c) => steps(c))).toEqual(['update({"is_active":false}) > eq(id, t1)', 'delete() > eq(id, t1)'])
  })
})

describe('vouchers given out', () => {
  it('lists the 100 latest with who holds them', async () => {
    await fetchIssuedCoupons()
    expect(steps(fake.calls[0])).toBe('select(*, profiles(full_name, phone)) > order(issued_at, {"ascending":false}) > limit(100)')
  })

  it('works out how many were given, how many used, and what they really cost', async () => {
    fake.respondWith(() => ({
      data: [
        { used_at: '2026-06-01', discount_applied: 1000 },
        { used_at: '2026-06-02', discount_applied: '500' }, // numbers may arrive as text
        { used_at: null, discount_applied: 9999 }, // never used: costs nothing
        { used_at: '2026-06-03', discount_applied: null },
      ],
    }))
    await expect(fetchCouponStats()).resolves.toEqual({ issued: 4, used: 3, cost: 1500 })
    expect(steps(fake.calls[0])).toBe('select(used_at, discount_applied) > limit(5000)')
  })

  it('reports zeros when no vouchers exist', async () => {
    await expect(fetchCouponStats()).resolves.toEqual({ issued: 0, used: 0, cost: 0 })
  })
})

describe('referrals', () => {
  it('lists the friends one customer invited, with their orders', async () => {
    await fetchReferredPeople('u1')
    expect(steps(fake.calls[0])).toBe('select(id, full_name, phone, orders(order_number, subtotal, status, delivery_address)) > eq(referred_by, u1)')
  })
})
