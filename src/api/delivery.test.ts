import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import {
  addCampusZone, createDeliveryQr, fetchActiveZones, fetchAllZones, fetchDeliveryEvents, fetchMyDelivery, requestQuote, runDeliveryAction,
  setZoneActive, updateZone,
} from './delivery'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('customer delivery', () => {
  it('reads who is delivering, or null when nobody is assigned', async () => {
    fake.respondWith(() => ({ data: { status: 'assigned', rider_name: 'Musa', rider_phone: '0801', dispatch_company: null, active: true, qr_verified: false } }))
    await expect(fetchMyDelivery('o1')).resolves.toMatchObject({ rider_name: 'Musa' })
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'my_delivery' })
    expect(fake.calls[0].steps[0][1][0]).toEqual({ p_order_id: 'o1' })

    fake.respondWith(() => ({ data: undefined }))
    await expect(fetchMyDelivery('o1')).resolves.toBeNull()
  })

  it('makes a code for the rider to scan', async () => {
    fake.respondWith(() => ({ data: { token: 'abc', expires_in_seconds: 120 } }))
    await expect(createDeliveryQr('o1')).resolves.toEqual({ token: 'abc', expires_in_seconds: 120 })
    expect(fake.calls[0].target).toBe('create_delivery_qr')
  })

  it('throws with the database’s code so the screen can explain (e.g. NO_ACTIVE_DELIVERY)', async () => {
    fake.respondWith(() => ({ error: { message: 'NO_ACTIVE_DELIVERY' } }))
    await expect(createDeliveryQr('o1')).rejects.toMatchObject({ message: 'NO_ACTIVE_DELIVERY' })
  })
})

describe('owner delivery tools', () => {
  it('reads an order’s delivery history oldest first', async () => {
    await fetchDeliveryEvents('o1')
    expect(fake.calls[0].target).toBe('delivery_events')
    expect(steps(fake.calls[0])).toBe('select(id, event_type, outcome, actor, detail, created_at) > eq(order_id, o1) > order(created_at)')
  })

  it('runs only the named rider actions and gives back what the database returned', async () => {
    fake.respondWith(() => ({ data: { assignment_id: 'a1', token: 't', expires_at: 'x' } }))
    await expect(runDeliveryAction('assign_rider', { p_order_id: 'o1', p_name: 'Musa' })).resolves.toMatchObject({ assignment_id: 'a1' })
    await runDeliveryAction('cancel_assignment', { p_assignment_id: 'a1', p_reason: 'no longer available' })
    expect(fake.calls.map((c) => c.target)).toEqual(['assign_rider', 'cancel_assignment'])
  })
})

describe('requestQuote', () => {
  it('asks the server to price one address', async () => {
    fake.onInvoke(async () => ({ data: { quote_id: 'q1', fee: 1500, distance_m: 4200, expires_at: 'x', address: 'a', note: null }, error: null }))
    await expect(requestQuote({ lat: 4.8, lon: 7.0, address: '12 Road', note: 'gate' })).resolves.toMatchObject({ quote_id: 'q1', fee: 1500 })
    expect(fake.calls[0].target).toBe('function:delivery-quote')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ lat: 4.8, lon: 7.0, address: '12 Road', note: 'gate' })
  })
})

describe('delivery options', () => {
  it('shows customers only the switched-on options, in the owner’s order', async () => {
    await fetchActiveZones()
    expect(fake.calls[0].target).toBe('delivery_zones')
    expect(steps(fake.calls[0])).toBe('select(*) > eq(is_active, true) > order(sort_order)')
  })

  it('shows the owner every option, switched-off ones too', async () => {
    await fetchAllZones()
    expect(steps(fake.calls[0])).toBe('select(*) > order(sort_order)')
  })

  it('renames or re-prices an option, and switches it on or off', async () => {
    await updateZone('z1', { name: 'Main campus', fee: 700, latitude: 4.9, longitude: 6.9 })
    await updateZone('z2', { name: 'Home delivery' }) // the Home option has no fee or location of its own
    await setZoneActive('z1', false)
    expect(fake.calls.map((c) => steps(c))).toEqual([
      'update({"name":"Main campus","fee":700,"latitude":4.9,"longitude":6.9}) > eq(id, z1)',
      'update({"name":"Home delivery"}) > eq(id, z2)',
      'update({"is_active":false}) > eq(id, z1)',
    ])
  })

  it('adds a campus at the end of the list', async () => {
    await addCampusZone({ name: 'North gate', fee: 500, sortOrder: 4, latitude: null, longitude: null })
    expect(steps(fake.calls[0])).toBe('insert({"name":"North gate","fee":500,"kind":"campus","sort_order":4,"latitude":null,"longitude":null})')
  })

  it('throws the database’s code so the screen can say "that name already exists"', async () => {
    fake.respondWith(() => ({ error: { message: 'duplicate key', code: '23505' } }))
    await expect(addCampusZone({ name: 'X', fee: 1, sortOrder: 1, latitude: null, longitude: null })).rejects.toMatchObject({ code: '23505' })
  })
})
