import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { escalateSupportChat, fetchSupportChats, fetchSupportMessages, openSupportChat, resolveSupportChat, sendSupportMessage } from './support'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('customer chat', () => {
  it('opens, sends and escalates through the one support function', async () => {
    fake.onInvoke(async () => ({ data: { conversation: { id: 'c1', status: 'ai' }, messages: [] }, error: null }))
    await openSupportChat()
    await sendSupportMessage('Where is my order?')
    await escalateSupportChat()
    expect(fake.calls.map((c) => [c.target, c.steps[0][1][0]])).toEqual([
      ['function:support-chat', { action: 'open' }],
      ['function:support-chat', { action: 'send', message: 'Where is my order?' }],
      ['function:support-chat', { action: 'escalate' }],
    ])
  })

  it('says customer care is unavailable (not "payment service") when the server fails without explanation', async () => {
    const failing = new FunctionsHttpError({ status: 503, json: () => Promise.reject(new Error('x')) } as unknown as Response)
    fake.onInvoke(async () => ({ data: null, error: failing }))
    await expect(openSupportChat()).rejects.toThrow('Customer care is unavailable right now (503).')
  })
})

describe('owner inbox', () => {
  it('lists the 100 latest chats in one state, most recently active first', async () => {
    await fetchSupportChats('escalated')
    expect(fake.calls[0].target).toBe('support_conversations')
    expect(steps(fake.calls[0])).toContain('eq(status, escalated) > order(last_message_at, {"ascending":false}) > limit(100)')
  })

  it('marks a chat resolved with the time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T08:00:00.000Z'))
    try {
      await resolveSupportChat('c1')
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[0])).toBe('update({"status":"resolved","resolved_at":"2026-09-01T08:00:00.000Z"}) > eq(id, c1)')
  })

  it('reads one chat’s messages oldest first, up to 300', async () => {
    await fetchSupportMessages('c1')
    expect(fake.calls[0].target).toBe('support_messages')
    expect(steps(fake.calls[0])).toBe('select(id, role, content, created_at) > eq(conversation_id, c1) > order(created_at, {"ascending":true}) > limit(300)')
  })
})
