import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import type { FakeSupabase } from '../test/fakeSupabase'
import { callFunction, callFunctionWithDetails } from './functions'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const httpError = (status: number, over: { json?: unknown; text?: string } = {}) =>
  new FunctionsHttpError({
    status,
    json: () => (over.json === undefined ? Promise.reject(new Error('no json')) : Promise.resolve(over.json)),
    text: () => (over.text === undefined ? Promise.reject(new Error('no text')) : Promise.resolve(over.text)),
  } as unknown as Response)

describe('callFunction with its own "unavailable" wording', () => {
  it('uses it only when the server gave no explanation', async () => {
    const wording = (status: number) => `Customer care is unavailable right now (${status}).`
    fake.onInvoke(async () => ({ data: null, error: httpError(503) }))
    await expect(callFunction('support-chat', {}, wording)).rejects.toThrow('Customer care is unavailable right now (503).')

    fake.onInvoke(async () => ({ data: null, error: httpError(400, { json: { error: 'Message too long.' } }) }))
    await expect(callFunction('support-chat', {}, wording)).rejects.toThrow('Message too long.')
  })
})

describe('callFunctionWithDetails (owner tools)', () => {
  it('returns the answer on success', async () => {
    fake.onInvoke(async () => ({ data: { sent: 2 }, error: null }))
    await expect(callFunctionWithDetails('notify-order', { test: true })).resolves.toEqual({ sent: 2 })
  })

  it('shows the status and the server’s exact words when it refuses', async () => {
    fake.onInvoke(async () => ({ data: null, error: httpError(401, { text: 'Missing secret' }) }))
    await expect(callFunctionWithDetails('push-scheduler', {})).rejects.toThrow('401: Missing secret')
  })

  it('says "no details" when the body is empty or unreadable', async () => {
    fake.onInvoke(async () => ({ data: null, error: httpError(500) }))
    await expect(callFunctionWithDetails('push-scheduler', {})).rejects.toThrow('500: no details')
  })

  it('passes other failures through unchanged', async () => {
    const offline = new Error('Failed to send a request')
    fake.onInvoke(async () => ({ data: null, error: offline }))
    await expect(callFunctionWithDetails('notify-order', {})).rejects.toBe(offline)
  })
})
