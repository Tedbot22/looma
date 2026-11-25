import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { fetchEditableSitePages, fetchSitePage, saveSitePage } from './content'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

describe('site pages', () => {
  it('reads one page by its address, and gives null when there is none', async () => {
    fake.respondWith(() => ({ data: { slug: 'faq', title: 'FAQ', content: '...', updated_at: 'x' } }))
    await expect(fetchSitePage('faq')).resolves.toMatchObject({ title: 'FAQ' })
    expect(steps(fake.calls[0])).toBe('select(*) > eq(slug, faq) > maybeSingle()')
    fake.respondWith(() => ({ data: null }))
    await expect(fetchSitePage('nope')).resolves.toBeNull()
  })

  it('lists the pages the owner can edit, without their dates', async () => {
    await fetchEditableSitePages()
    expect(steps(fake.calls[0])).toBe('select(slug, title, content)')
  })

  it('saves a page and stamps when it was last updated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T10:00:00.000Z'))
    try {
      await saveSitePage('about', { title: 'About us', content: 'Hello' })
    } finally {
      vi.useRealTimers()
    }
    expect(steps(fake.calls[0])).toBe('update({"title":"About us","content":"Hello","updated_at":"2026-08-01T10:00:00.000Z"}) > eq(slug, about)')
  })
})
