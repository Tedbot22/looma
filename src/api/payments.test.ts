import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import { callFunction } from './functions'
import { cancelOrder, retryRefund, startPayment, verifyPayment } from './payments'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError({ status, json: () => (body === undefined ? Promise.reject(new Error('no json')) : Promise.resolve(body)) } as unknown as Response)

describe('callFunction', () => {
  it('returns what the server answered', async () => {
    fake.onInvoke(async () => ({ data: { ok: true }, error: null }))
    await expect(callFunction('anything', { a: 1 })).resolves.toEqual({ ok: true })
    expect(fake.calls[0].steps[0][1][0]).toEqual({ a: 1 })
  })

  it('shows the server’s own explanation when it refuses', async () => {
    fake.onInvoke(async () => ({ data: null, error: httpError(400, { error: 'This order is already paid.' }) }))
    await expect(callFunction('paystack-init', {})).rejects.toThrow('This order is already paid.')
  })

  it('falls back to a plain message that includes the status when the server gave none', async () => {
    fake.onInvoke(async () => ({ data: null, error: httpError(502, undefined) }))
    await expect(callFunction('paystack-init', {})).rejects.toThrow('Payment service error (502).')
  })

  it('passes other failures (such as no connection) through unchanged', async () => {
    const offline = new Error('Failed to send a request')
    fake.onInvoke(async () => ({ data: null, error: offline }))
    await expect(callFunction('paystack-init', {})).rejects.toBe(offline)
  })
})

describe('payment actions', () => {
  it('start a payment from the order id alone, and return the Paystack page', async () => {
    fake.onInvoke(async () => ({ data: { authorization_url: 'https://paystack.test/pay/abc' }, error: null }))
    await expect(startPayment('o1')).resolves.toBe('https://paystack.test/pay/abc')
    expect(fake.calls[0].target).toBe('function:paystack-init')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ order_id: 'o1' }) // no amount: the server decides
  })

  it('verify a payment with the order and Paystack reference', async () => {
    fake.onInvoke(async () => ({ data: { status: 'paid' }, error: null }))
    await expect(verifyPayment('o1', 'ref-9')).resolves.toEqual({ status: 'paid' })
    expect(fake.calls[0].target).toBe('function:paystack-verify')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ order_id: 'o1', reference: 'ref-9' })
  })

  it('cancel an order on the server (which checks ownership, restocks and refunds)', async () => {
    fake.onInvoke(async () => ({ data: { cancelled: true, refund: 'initiated', message: 'Cancelled. Refund started.' }, error: null }))
    await expect(cancelOrder('o1', 'changed my mind')).resolves.toMatchObject({ cancelled: true, refund: 'initiated' })
    expect(fake.calls[0].target).toBe('function:cancel-order')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ order_id: 'o1', note: 'changed my mind' })
  })

  it('let the owner retry a failed refund', async () => {
    fake.onInvoke(async () => ({ data: { ok: true, message: 'Refund retried.' }, error: null }))
    await expect(retryRefund('issue-1')).resolves.toEqual({ ok: true, message: 'Refund retried.' })
    expect(fake.calls[0].target).toBe('function:retry-refund')
    expect(fake.calls[0].steps[0][1][0]).toEqual({ issue_id: 'issue-1' })
  })
})
