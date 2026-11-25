import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { VARIANT_FIELDS } from '../lib/variants'
import type { WishlistItem } from '../lib/types'
import { fetchWishlist, mergeGuestWishlist, removeWishlistItem, saveWishlistItem } from './wishlist'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const variantRow = (id: string) => ({
  id, color: null, size: null, stock: 0,
  products: { id: `p-${id}`, name: `Item ${id}`, price: 3000, images: [], is_active: true },
})

describe('fetchWishlist', () => {
  it('reads this customer’s saved items, newest first', async () => {
    await fetchWishlist('u1')
    expect(fake.calls[0].target).toBe('wishlist_items')
    expect(steps(fake.calls[0])).toBe(`select(auto_moved_at, product_variants(${VARIANT_FIELDS})) > eq(user_id, u1) > order(created_at, {"ascending":false})`)
  })

  it('marks items the system moved over from a cart because they sold out', async () => {
    fake.respondWith(() => ({
      data: [
        { auto_moved_at: '2026-11-01T10:00:00Z', product_variants: variantRow('v1') },
        { auto_moved_at: null, product_variants: variantRow('v2') },
      ],
    }))
    const list = await fetchWishlist('u1')
    expect(list.map((i) => [i.variantId, i.autoMoved])).toEqual([['v1', true], ['v2', false]])
    expect(list[0]).toMatchObject({ variantLabel: 'Standard', image: null, price: 3000 })
  })

  it('leaves out items whose product is gone', async () => {
    fake.respondWith(() => ({ data: [{ auto_moved_at: null, product_variants: null }] }))
    await expect(fetchWishlist('u1')).resolves.toEqual([])
  })
})

describe('changing the wishlist', () => {
  it('saves an item once (saving it twice is harmless) and removes it', async () => {
    await saveWishlistItem('u1', 'v1')
    await removeWishlistItem('u1', 'v1')
    expect(fake.calls.map((c) => `${c.target}: ${steps(c)}`)).toEqual([
      'wishlist_items: upsert({"user_id":"u1","variant_id":"v1"}, {"onConflict":"user_id,variant_id","ignoreDuplicates":true})',
      'wishlist_items: delete() > eq(user_id, u1) > eq(variant_id, v1)',
    ])
  })
})

describe('mergeGuestWishlist', () => {
  const item = (variantId: string): WishlistItem => ({ variantId, productId: 'p', name: 'x', variantLabel: 'Standard', price: 1, image: null })

  it('saves every guest item, even if one of them fails', async () => {
    fake.respondWith((call) => (steps(call).includes('"v1"') ? { error: { message: 'gone' } } : {}))
    await expect(mergeGuestWishlist('u1', [item('v1'), item('v2')])).resolves.toBeUndefined()
    expect(fake.calls).toHaveLength(2)
  })
})
