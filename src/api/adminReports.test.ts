import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import { fetchAdminCustomers, fetchAdminDashboard } from './adminReports'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('reports', () => {
  it('asks the database for the dashboard numbers over a number of days', async () => {
    fake.respondWith(() => ({ data: { days: 30, revenue: 100000 } }))
    await expect(fetchAdminDashboard(30)).resolves.toMatchObject({ revenue: 100000 })
    expect(fake.calls[0].target).toBe('admin_dashboard')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ p_days: 30 })
  })

  it('asks for one page of customers, treating an empty search as "everyone"', async () => {
    fake.respondWith(() => ({ data: { total: 60, rows: [] } }))
    await fetchAdminCustomers('', 25, 50)
    await fetchAdminCustomers('ada', 25, 0)
    expect(fake.calls.map((c) => [c.target, c.steps[0][1][0]])).toEqual([
      ['admin_customers', { p_search: null, p_limit: 25, p_offset: 50 }],
      ['admin_customers', { p_search: 'ada', p_limit: 25, p_offset: 0 }],
    ])
  })

  it('throws when someone who is not the owner asks', async () => {
    fake.respondWith(() => ({ error: { message: 'not authorized' } }))
    await expect(fetchAdminDashboard(7)).rejects.toMatchObject({ message: 'not authorized' })
  })
})
