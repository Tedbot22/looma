import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import {
  countNewOrders, countOpenPaymentIssues, countWaitingSupport, fetchAdminOrders, fetchOpenPaymentIssues, resolvePaymentIssue, setOrderStatus,
} from './adminOrders'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('fetchAdminOrders', () => {
  it('filters by one status, newest first, 100 at most', async () => {
    await fetchAdminOrders('placed')
    const text = steps(fake.calls[0])
    expect(fake.calls[0].target).toBe('orders')
    expect(text).toContain('order_items(*), profiles(full_name, phone), delivery_assignments(')
    expect(text).toContain('order(created_at, {"ascending":false}) > limit(100) > eq(status, placed)')
  })

  it('shows every status for "all" (no status filter at all)', async () => {
    await fetchAdminOrders('all')
    expect(steps(fake.calls[0])).not.toContain('eq(status')
  })

  it('throws when the database refuses', async () => {
    fake.respondWith(() => ({ error: { message: 'not the owner' } }))
    await expect(fetchAdminOrders('all')).rejects.toMatchObject({ message: 'not the owner' })
  })
})

describe('setOrderStatus', () => {
  it('asks the database to move the order, with the note for the customer (or none)', async () => {
    await setOrderStatus('o1', 'out_for_delivery', 'Rider: Musa, 0801...')
    await setOrderStatus('o1', 'delivered')
    expect(fake.calls.map((c) => [c.target, c.steps[0][1][0]])).toEqual([
      ['set_order_status', { p_order_id: 'o1', p_status: 'out_for_delivery', p_note: 'Rider: Musa, 0801...' }],
      ['set_order_status', { p_order_id: 'o1', p_status: 'delivered', p_note: null }],
    ])
  })

  it('throws when the move is not allowed, so the screen can explain it', async () => {
    fake.respondWith(() => ({ error: { message: 'INVALID_TRANSITION' } }))
    await expect(setOrderStatus('o1', 'delivered')).rejects.toMatchObject({ message: 'INVALID_TRANSITION' })
  })
})

describe('menu badge counts', () => {
  it('count only what is waiting', async () => {
    fake.respondWith(() => ({ count: 4 } as never))
    await expect(countNewOrders()).resolves.toBe(4)
    await expect(countOpenPaymentIssues()).resolves.toBe(4)
    await expect(countWaitingSupport()).resolves.toBe(4)
    expect(fake.calls.map((c) => `${c.target}: ${steps(c)}`)).toEqual([
      'orders: select(id, {"count":"exact","head":true}) > eq(status, placed)',
      'payment_issues: select(id, {"count":"exact","head":true}) > is(resolved_at, null)',
      'support_conversations: select(id, {"count":"exact","head":true}) > eq(status, escalated)',
    ])
  })

  it('show 0 instead of breaking the page when a count can’t be read', async () => {
    fake.respondWith(() => ({ error: { message: 'down' } }))
    await expect(countNewOrders()).resolves.toBe(0)
  })
})

describe('payment problems', () => {
  it('lists only unresolved problems, newest first, with the order and customer name', async () => {
    await fetchOpenPaymentIssues()
    expect(steps(fake.calls[0])).toBe('select(*, orders(order_number, phone, profiles(full_name))) > is(resolved_at, null) > order(created_at, {"ascending":false})')
  })

  it('marks a problem resolved, recording who did it and when', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T09:30:00.000Z'))
    try {
      await resolvePaymentIssue('issue-1')
    } finally {
      vi.useRealTimers()
    }
    expect(fake.calls[0].target).toBe('payment_issues')
    expect(steps(fake.calls[0])).toBe('update({"resolved_at":"2026-07-01T09:30:00.000Z","resolved_by":"owner-1"}) > eq(id, issue-1)')
  })
})
