import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import { cancelJob, fetchJobOverview, requeueJob } from './jobs'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('reminder queue (owner)', () => {
  it('reads the health summary from the database', async () => {
    const overview = { enabled: true, counts: [{ kind: 'push.customer', status: 'queued', n: 3 }], oldest_waiting_seconds: 40, dead: [] }
    fake.respondWith(() => ({ data: overview }))
    await expect(fetchJobOverview()).resolves.toEqual(overview)
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'admin_job_overview' })
  })

  it('throws when someone who is not the owner asks (the database refuses)', async () => {
    fake.respondWith(() => ({ error: { message: 'NOT_ADMIN', code: '42501' } }))
    await expect(fetchJobOverview()).rejects.toMatchObject({ message: 'NOT_ADMIN' })
  })

  it('gives a failed job another go, by id', async () => {
    fake.respondWith(() => ({ data: true }))
    await expect(requeueJob(41)).resolves.toBe(true)
    expect(fake.calls[0].target).toBe('admin_requeue_job')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ p_id: 41 })
  })

  it('reports false when the job is not in a state that can be requeued', async () => {
    fake.respondWith(() => ({ data: false }))
    await expect(requeueJob(41)).resolves.toBe(false)
  })

  it('takes a waiting job off the queue', async () => {
    fake.respondWith(() => ({ data: true }))
    await expect(cancelJob(9)).resolves.toBe(true)
    expect(fake.calls[0].target).toBe('admin_cancel_job')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ p_id: 9 })
  })
})
