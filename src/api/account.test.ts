import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import {
  addAddress, classifyDeactivateError, deactivateMyAccount, deleteAddress, fetchAddresses, fetchMyCoupons, fetchProfile,
  fetchReferralProgress, makeAddressDefault, touchLastSeen, updateAddress, updateProfile, type AddressValues,
} from './account'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const values: AddressValues = { zoneId: 'z1', details: '  12 Palm Road  ', latitude: 4.8, longitude: 7.0, note: '  blue gate ' }

describe('profile', () => {
  it('reads only the fields the app needs, for this customer', async () => {
    fake.respondWith(() => ({ data: { id: 'u1', full_name: 'Ada', phone: '0801', referral_code: 'ADA1', is_admin: false } }))
    await expect(fetchProfile('u1')).resolves.toMatchObject({ referral_code: 'ADA1' })
    expect(steps(fake.calls[0])).toBe('select(id, full_name, phone, referral_code, is_admin) > eq(id, u1) > single()')
  })

  it('saves a name and phone number', async () => {
    await updateProfile('u1', { name: 'Ada', phone: '0801' })
    expect(steps(fake.calls[0])).toBe('update({"full_name":"Ada","phone":"0801"}) > eq(id, u1)')
  })

  it('"last seen" never throws, even if the call fails', async () => {
    fake.respondWith(() => ({ error: { message: 'offline' } }))
    expect(() => touchLastSeen()).not.toThrow()
    await Promise.resolve()
    expect(fake.calls[0].target).toBe('touch_last_seen')
  })
})

describe('deactivating an account', () => {
  it('asks the database, which decides if it is allowed', async () => {
    await deactivateMyAccount()
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'deactivate_my_account' })
  })

  it('tells apart "an order is in progress", "this is an owner account" and anything else', () => {
    expect(classifyDeactivateError({ message: 'P0001: ACTIVE_ORDERS' })).toBe('active_orders')
    expect(classifyDeactivateError({ message: 'ADMIN_ACCOUNT' })).toBe('admin_account')
    expect(classifyDeactivateError({ message: 'network' })).toBe('other')
    expect(classifyDeactivateError(null)).toBe('other')
  })
})

describe('addresses', () => {
  it('lists this customer’s addresses with the default first', async () => {
    await fetchAddresses('u1')
    expect(fake.calls[0].target).toBe('addresses')
    expect(steps(fake.calls[0])).toContain('eq(user_id, u1) > order(is_default, {"ascending":false}) > order(created_at)')
  })

  it('saves a new address tidied up, and returns its id', async () => {
    fake.respondWith(() => ({ data: { id: 'a9' } }))
    await expect(addAddress('u1', values)).resolves.toBe('a9')
    expect(steps(fake.calls[0])).toBe(
      'insert({"user_id":"u1","zone_id":"z1","details":"12 Palm Road","latitude":4.8,"longitude":7,"note":"blue gate","is_default":false}) > select(id) > single()'
    )
  })

  it('stores a blank note as nothing, not as an empty string', async () => {
    fake.respondWith(() => ({ data: { id: 'a9' } }))
    await addAddress('u1', { ...values, note: '   ' })
    expect(steps(fake.calls[0])).toContain('"note":null')
  })

  it('only sets "default" on an edit when asked to (an edit never un-defaults)', async () => {
    await updateAddress('a1', values)
    expect(steps(fake.calls[0])).not.toContain('is_default')
    await updateAddress('a1', { ...values, isDefault: true })
    expect(steps(fake.calls[1])).toContain('"is_default":true')
  })

  it('deletes, and makes one the default', async () => {
    await deleteAddress('a1')
    await makeAddressDefault('a2')
    expect(fake.calls.map((c) => steps(c))).toEqual(['delete() > eq(id, a1)', 'update({"is_default":true}) > eq(id, a2)'])
  })

  it('throws when a change is refused', async () => {
    fake.respondWith(() => ({ error: { message: 'address outside the delivery area' } }))
    await expect(addAddress('u1', values)).rejects.toMatchObject({ message: 'address outside the delivery area' })
  })
})

describe('vouchers and referrals', () => {
  it('lists this customer’s vouchers, soonest to expire first', async () => {
    await fetchMyCoupons('u1')
    expect(fake.calls[0].target).toBe('coupons')
    expect(steps(fake.calls[0])).toBe('select(*) > eq(user_id, u1) > order(expires_at)')
  })

  it('reads how many invited friends count towards the next voucher', async () => {
    fake.respondWith(() => ({ data: 3 }))
    await expect(fetchReferralProgress()).resolves.toBe(3)
    expect(fake.calls[0].target).toBe('my_referral_progress')
  })
})
