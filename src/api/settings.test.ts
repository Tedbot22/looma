import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { fetchAppSettings, saveAppSettings, updateAppSettings } from './settings'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('fetchAppSettings', () => {
  it('turns the rows into a simple { key: value } lookup', async () => {
    fake.respondWith(() => ({ data: [{ key: 'store_phone', value: '0801' }, { key: 'coupon_valid_days', value: '14' }] }))
    await expect(fetchAppSettings()).resolves.toEqual({ store_phone: '0801', coupon_valid_days: '14' })
    expect(fake.calls[0].target).toBe('app_settings')
    expect(steps(fake.calls[0])).toBe('select(key, value)')
  })

  it('gives an empty lookup when nothing is set yet', async () => {
    await expect(fetchAppSettings()).resolves.toEqual({})
  })
})

describe('saveAppSettings', () => {
  it('creates or replaces each setting by its key', async () => {
    await saveAppSettings([{ key: 'delivery_base_fee', value: '500' }, { key: 'delivery_round_to', value: '50' }])
    expect(fake.calls[0].steps[0]).toEqual([
      'upsert',
      [[{ key: 'delivery_base_fee', value: '500' }, { key: 'delivery_round_to', value: '50' }], { onConflict: 'key' }],
    ])
  })

  it('throws when the owner’s change is refused', async () => {
    fake.respondWith(() => ({ error: { message: 'permission denied' } }))
    await expect(saveAppSettings([{ key: 'a', value: 'b' }])).rejects.toMatchObject({ message: 'permission denied' })
  })
})

describe('updateAppSettings', () => {
  it('changes each existing setting separately', async () => {
    await updateAppSettings({ coupon_max_cost: '2000', coupon_valid_days: '30' })
    expect(fake.calls.map((c) => `${c.target}: ${steps(c)}`)).toEqual([
      'app_settings: update({"value":"2000"}) > eq(key, coupon_max_cost)',
      'app_settings: update({"value":"30"}) > eq(key, coupon_valid_days)',
    ])
  })

  it('attempts every change and then reports the first failure', async () => {
    fake.respondWith((call) => (steps(call).includes('coupon_max_cost') ? { error: { message: 'locked' } } : {}))
    await expect(updateAppSettings({ coupon_max_cost: '1', coupon_valid_days: '2' })).rejects.toMatchObject({ message: 'locked' })
    expect(fake.calls).toHaveLength(2)
  })
})
