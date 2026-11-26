import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import {
  completeDelivery, createTransferAccount, getDelivery, getTransferState, reportFailed, requestOtpSms, startDelivery, verifyOtp, verifyQr,
} from './rider'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('rider actions send the secret link token and nothing about money or status', () => {
  it('uses the right database function with the right arguments', async () => {
    fake.respondWith(() => ({ data: { ok: true } }))
    await getDelivery('tok')
    await startDelivery('tok')
    await verifyQr('tok', 'qr-data')
    await verifyOtp('tok', '123456')
    await completeDelivery('tok')
    await reportFailed('tok', 'customer_unreachable', 'phone off')
    await reportFailed('tok', 'wrong_address', '')
    expect(fake.calls.map((c) => [c.target, c.steps[0][1][0]])).toEqual([
      ['rider_get_delivery', { p_token: 'tok' }],
      ['rider_start_delivery', { p_token: 'tok' }],
      ['rider_verify_qr', { p_token: 'tok', p_qr: 'qr-data' }],
      ['rider_verify_otp', { p_token: 'tok', p_code: '123456' }],
      ['rider_complete_delivery', { p_token: 'tok' }],
      ['rider_report_failed', { p_token: 'tok', p_reason: 'customer_unreachable', p_note: 'phone off' }],
      ['rider_report_failed', { p_token: 'tok', p_reason: 'wrong_address', p_note: null }], // empty note = none
    ])
  })

  it('asks the server to text the code (and the code never comes back to the page)', async () => {
    fake.onInvoke(async () => ({ data: { ok: true, code: 'OTP_SENT' }, error: null }))
    const reply = await requestOtpSms('tok')
    expect(fake.calls[0].target).toBe('function:send-delivery-otp')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ token: 'tok' })
    expect(reply).toEqual({ ok: true, code: 'OTP_SENT' })
  })

  it('asks for the pay-by-transfer account status or creation', async () => {
    fake.onInvoke(async () => ({ data: { ok: true, state: 'none' }, error: null }))
    await getTransferState('tok')
    await createTransferAccount('tok')
    expect(fake.calls.map((c) => c.steps[0][1][0])).toEqual([{ token: 'tok', action: 'status' }, { token: 'tok', action: 'create' }])
  })
})

describe('turning the server’s answer into a reply', () => {
  it('passes the server’s own result and code through', async () => {
    fake.respondWith(() => ({ data: { ok: false, code: 'LINK_EXPIRED' } }))
    await expect(getDelivery('tok')).resolves.toEqual({ ok: false, code: 'LINK_EXPIRED' })
  })

  it('supplies "OK" or "ERROR" only when the server sent no code', async () => {
    fake.respondWith(() => ({ data: { ok: true } }))
    await expect(completeDelivery('tok')).resolves.toMatchObject({ ok: true, code: 'OK' })
    fake.respondWith(() => ({ data: { ok: false } }))
    await expect(completeDelivery('tok')).resolves.toMatchObject({ ok: false, code: 'ERROR' })
  })

  it('never claims success unless the server said ok:true exactly', async () => {
    for (const data of [{ ok: 'yes' }, { ok: 1 }, { success: true }]) {
      fake.respondWith(() => ({ data }))
      expect((await completeDelivery('tok')).ok).toBe(false)
    }
  })

  it('reports NETWORK when there was no usable answer', async () => {
    fake.respondWith(() => ({ error: { message: 'offline' } }))
    await expect(getDelivery('tok')).resolves.toEqual({ ok: false, code: 'NETWORK' })
    fake.respondWith(() => ({ data: null }))
    await expect(getDelivery('tok')).resolves.toEqual({ ok: false, code: 'NETWORK' })
    fake.respondWith(() => ({ data: 'not an object' }))
    await expect(getDelivery('tok')).resolves.toEqual({ ok: false, code: 'NETWORK' })
  })

  it('reports NETWORK instead of throwing when the call itself blows up', async () => {
    fake.respondWith(() => {
      throw new Error('fetch failed')
    })
    await expect(verifyQr('tok', 'x')).resolves.toEqual({ ok: false, code: 'NETWORK' })
    fake.onInvoke(async () => {
      throw new Error('fetch failed')
    })
    await expect(requestOtpSms('tok')).resolves.toEqual({ ok: false, code: 'NETWORK' })
  })
})
