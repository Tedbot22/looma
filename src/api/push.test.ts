import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import {
  cancelPromo, createPromo, detachThisDevice, fetchMarketingPref, fetchPromos, fetchPushActivity, fetchPushSettings, isDeviceSavedForCustomer,
  registerCustomerSubscription, removeCustomerSubscription, removeOwnerDevice, saveMarketingPref, saveOwnerDevice, savePushSettings,
  sendPromoNow, sendTestAlert,
} from './push'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
vi.mock('../lib/push', () => ({ isPushSupported: vi.fn(() => true), readyRegistration: vi.fn() }))
import { isPushSupported, readyRegistration } from '../lib/push'

const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => {
  fake.reset()
  vi.mocked(isPushSupported).mockReturnValue(true)
})

describe('a customer’s device', () => {
  it('knows whether this browser is saved under the account (a failed read counts as "no")', async () => {
    fake.respondWith(() => ({ data: { id: 'd1' } }))
    await expect(isDeviceSavedForCustomer('https://push/abc')).resolves.toBe(true)
    expect(steps(fake.calls[0])).toBe('select(id) > eq(endpoint, https://push/abc) > maybeSingle()')
    fake.respondWith(() => ({ data: null }))
    await expect(isDeviceSavedForCustomer('x')).resolves.toBe(false)
    fake.respondWith(() => ({ error: { message: 'down' } }))
    await expect(isDeviceSavedForCustomer('x')).resolves.toBe(false)
  })

  it('saves the browser through the database function, which sets the owner from the login', async () => {
    await registerCustomerSubscription({ endpoint: 'https://push/abc', keys: { p256dh: 'k', auth: 'a' } })
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'register_push_subscription' })
    expect(fake.calls[0].steps[0][1][0]).toEqual({ p_subscription: { endpoint: 'https://push/abc', keys: { p256dh: 'k', auth: 'a' } } })
  })

  it('stops order updates to a browser, and never fails the caller', async () => {
    fake.respondWith(() => ({ error: { message: 'down' } }))
    await expect(removeCustomerSubscription('https://push/abc')).resolves.toBeUndefined()
    expect(steps(fake.calls[0])).toBe('delete() > eq(endpoint, https://push/abc)')
  })
})

describe('detachThisDevice (logging out)', () => {
  it('removes this browser’s subscription so the next person doesn’t see the last customer’s updates', async () => {
    vi.mocked(readyRegistration).mockResolvedValue({ pushManager: { getSubscription: async () => ({ endpoint: 'https://push/me' }) } } as never)
    await detachThisDevice()
    expect(steps(fake.calls[0])).toBe('delete() > eq(endpoint, https://push/me)')
  })

  it('does nothing where push isn’t supported, or when there is no subscription', async () => {
    vi.mocked(isPushSupported).mockReturnValue(false)
    await detachThisDevice()
    vi.mocked(isPushSupported).mockReturnValue(true)
    vi.mocked(readyRegistration).mockResolvedValue({ pushManager: { getSubscription: async () => null } } as never)
    await detachThisDevice()
    vi.mocked(readyRegistration).mockResolvedValue(undefined as never)
    await detachThisDevice()
    expect(fake.calls).toHaveLength(0)
  })

  it('never stops a logout, whatever goes wrong', async () => {
    vi.mocked(readyRegistration).mockRejectedValue(new Error('service worker crashed'))
    await expect(detachThisDevice()).resolves.toBeUndefined()
  })
})

describe('what a customer agreed to receive', () => {
  it('assumes yes until they choose', async () => {
    fake.respondWith(() => ({ data: null }))
    await expect(fetchMarketingPref('u1')).resolves.toBe(true)
    fake.respondWith(() => ({ data: { marketing: false } }))
    await expect(fetchMarketingPref('u1')).resolves.toBe(false)
  })

  it('saves their choice with the time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    try {
      await saveMarketingPref('u1', false)
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[0])).toBe('upsert({"user_id":"u1","marketing":false,"updated_at":"2026-10-01T12:00:00.000Z"})')
  })
})

describe('the owner’s devices', () => {
  it('saves a browser as an alert device, once per browser', async () => {
    const subscription = { endpoint: 'https://push/owner', keys: {} }
    await saveOwnerDevice('owner-1', subscription)
    expect(fake.calls[0].target).toBe('device_tokens')
    expect(fake.calls[0].steps[0]).toEqual(['upsert', [{ user_id: 'owner-1', token: JSON.stringify(subscription), platform: 'web' }, { onConflict: 'token' }]])
  })

  it('removes only the device with this browser’s address, ignoring damaged rows', async () => {
    fake.respondWith((call) =>
      steps(call).startsWith('select')
        ? { data: [{ id: 'd1', token: JSON.stringify({ endpoint: 'https://push/me' }) }, { id: 'd2', token: JSON.stringify({ endpoint: 'https://push/other' }) }, { id: 'd3', token: 'not json' }] }
        : {}
    )
    await removeOwnerDevice('owner-1', 'https://push/me')
    expect(steps(fake.calls[1])).toBe('delete() > in(id, ["d1"])')
  })

  it('deletes nothing when no saved device matches', async () => {
    fake.respondWith(() => ({ data: [{ id: 'd2', token: JSON.stringify({ endpoint: 'https://push/other' }) }] }))
    await removeOwnerDevice('owner-1', 'https://push/me')
    expect(fake.calls).toHaveLength(1)
  })

  it('sends a test alert, showing the server’s exact reply if it is refused', async () => {
    fake.onInvoke(async () => ({ data: { sent: 1, registered: 1 }, error: null }))
    await expect(sendTestAlert()).resolves.toEqual({ sent: 1, registered: 1 })
    expect(fake.calls[0].steps[0][1][0]).toEqual({ test: true })

    const refused = new FunctionsHttpError({ status: 401, text: () => Promise.resolve('Missing secret') } as unknown as Response)
    fake.onInvoke(async () => ({ data: null, error: refused }))
    await expect(sendTestAlert()).rejects.toThrow('401: Missing secret')
  })
})

describe('reminders and promotions', () => {
  it('reads and saves the one settings row', async () => {
    await fetchPushSettings()
    expect(steps(fake.calls[0])).toBe('select(*) > eq(id, 1) > single()')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    try {
      await savePushSettings({ cart_enabled: false, quiet_start_hour: 22 })
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[1])).toBe('update({"cart_enabled":false,"quiet_start_hour":22,"updated_at":"2026-10-01T12:00:00.000Z"}) > eq(id, 1)')
  })

  it('lists the 20 latest promotions', async () => {
    await fetchPromos()
    expect(steps(fake.calls[0])).toBe('select(id, title, body, url, scheduled_for, status, recipients, skipped_cap) > order(scheduled_for, {"ascending":false}) > limit(20)')
  })

  it('saves a promotion for a set time, recording who created it', async () => {
    fake.respondWith(() => ({ data: { id: 'promo-1' } }))
    const id = await createPromo({ title: 'Sale', body: 'Half price', url: '/shop', scheduledFor: new Date('2026-12-01T09:00:00.000Z') })
    expect(id).toBe('promo-1')
    expect(steps(fake.calls[0])).toBe(
      'insert({"title":"Sale","body":"Half price","url":"/shop","scheduled_for":"2026-12-01T09:00:00.000Z","created_by":"owner-1"}) > select(id) > single()'
    )
  })

  it('only cancels a promotion that has not started sending', async () => {
    await cancelPromo('promo-1')
    expect(steps(fake.calls[0])).toBe('update({"status":"cancelled"}) > eq(id, promo-1) > eq(status, scheduled)')
  })

  it('asks the scheduler to send exactly one promotion now', async () => {
    fake.onInvoke(async () => ({ data: { promos: [{ id: 'promo-1', delivered: 12 }] }, error: null }))
    await expect(sendPromoNow('promo-1')).resolves.toEqual({ promos: [{ id: 'promo-1', delivered: 12 }] })
    expect(fake.calls[0].target).toBe('function:push-scheduler')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ task: 'promos', promo_id: 'promo-1' })
  })

  it('counts what went out in the last 7 days by kind', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'))
    fake.respondWith(() => ({ data: [{ kind: 'cart_1' }, { kind: 'cart_2' }, { kind: 'promo' }, { kind: 'inactive' }, { kind: 'inactive' }, { kind: 'order_update' }] }))
    try {
      await expect(fetchPushActivity()).resolves.toEqual({ cart: 2, promo: 1, inactive: 2 })
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[0])).toBe('select(kind) > gte(sent_at, 2026-10-01T00:00:00.000Z) > limit(10000)')
  })
})
