import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { VARIANT_FIELDS } from '../lib/variants'
import type { CartItem } from '../lib/types'
import { clearCart, fetchCart, mergeGuestCart, removeCartItem, removeCartItems, saveCartItem, setCartItemQuantity } from './cart'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake
beforeEach(() => fake.reset())

const variantRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, color: 'Black', size: 'M', stock: 4,
  products: { id: `p-${id}`, name: `Item ${id}`, price: 5000, images: ['a.jpg'], is_active: true },
  ...over,
})

const guestItem = (variantId: string, quantity: number, maxStock: number): CartItem => ({
  variantId, productId: 'p', name: 'x', variantLabel: 'Standard', price: 1000, image: null, quantity, maxStock,
})

describe('fetchCart', () => {
  it('reads this customer’s cart, oldest first, ignoring lines without an option', async () => {
    await fetchCart('u1')
    expect(fake.calls[0].target).toBe('cart_items')
    expect(steps(fake.calls[0])).toBe(`select(variant_id, quantity, product_variants(${VARIANT_FIELDS})) > eq(user_id, u1) > not(variant_id, is, null) > order(created_at)`)
  })

  it('turns rows into cart lines with live price and stock', async () => {
    fake.respondWith(() => ({ data: [{ variant_id: 'v1', quantity: 2, product_variants: variantRow('v1') }] }))
    await expect(fetchCart('u1')).resolves.toEqual([
      { variantId: 'v1', productId: 'p-v1', name: 'Item v1', variantLabel: 'Black / M', price: 5000, image: 'a.jpg', quantity: 2, maxStock: 4 },
    ])
  })

  it('drops lines whose product has been hidden or removed', async () => {
    fake.respondWith(() => ({
      data: [
        { variant_id: 'v1', quantity: 1, product_variants: variantRow('v1') },
        { variant_id: 'v2', quantity: 1, product_variants: null }, // product no longer visible
      ],
    }))
    const cart = await fetchCart('u1')
    expect(cart.map((l) => l.variantId)).toEqual(['v1'])
  })

  it('throws if the database refuses', async () => {
    fake.respondWith(() => ({ error: { message: 'denied' } }))
    await expect(fetchCart('u1')).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('changing the cart', () => {
  it('saves, changes, removes and clears, always for this customer only', async () => {
    await saveCartItem('u1', 'v1', 2)
    await setCartItemQuantity('u1', 'v1', 3)
    await removeCartItem('u1', 'v1')
    await removeCartItems('u1', ['v1', 'v2'])
    await clearCart('u1')
    expect(fake.calls.map((c) => `${c.target}: ${steps(c)}`)).toEqual([
      'cart_items: upsert({"user_id":"u1","variant_id":"v1","quantity":2}, {"onConflict":"user_id,variant_id"})',
      'cart_items: update({"quantity":3}) > eq(user_id, u1) > eq(variant_id, v1)',
      'cart_items: delete() > eq(user_id, u1) > eq(variant_id, v1)',
      'cart_items: delete() > eq(user_id, u1) > in(variant_id, ["v1","v2"])',
      'cart_items: delete() > eq(user_id, u1)',
    ])
  })

  it('throws when a change is refused, so the screen can put things right', async () => {
    fake.respondWith(() => ({ error: { message: 'out of stock', code: 'P0001' } }))
    await expect(saveCartItem('u1', 'v1', 9)).rejects.toMatchObject({ code: 'P0001' })
  })
})

describe('mergeGuestCart', () => {
  const upserts = () => fake.calls.filter((c) => steps(c).startsWith('upsert')).map((c) => c.steps[0][1][0])

  it('keeps the larger quantity instead of adding, so running it twice never doubles anything', async () => {
    fake.respondWith(() => ({ data: [{ variant_id: 'v1', quantity: 3 }] }))
    await mergeGuestCart('u1', [guestItem('v1', 2, 10), guestItem('v2', 1, 10)])
    expect(upserts()).toEqual([
      { user_id: 'u1', variant_id: 'v1', quantity: 3 }, // already 3 in the account, guest had 2
      { user_id: 'u1', variant_id: 'v2', quantity: 1 },
    ])
  })

  it('never goes past the stock the guest saw', async () => {
    fake.respondWith(() => ({ data: [{ variant_id: 'v1', quantity: 5 }] }))
    await mergeGuestCart('u1', [guestItem('v1', 2, 3)])
    expect(upserts()).toEqual([{ user_id: 'u1', variant_id: 'v1', quantity: 3 }])
  })

  it('skips sold-out items (nothing in stock, nothing in the account)', async () => {
    await mergeGuestCart('u1', [guestItem('v1', 2, 0)])
    expect(upserts()).toEqual([])
  })

  it('does not write anything if the existing cart cannot be read', async () => {
    fake.respondWith(() => ({ error: { message: 'denied' } }))
    await expect(mergeGuestCart('u1', [guestItem('v1', 1, 5)])).rejects.toMatchObject({ message: 'denied' })
    expect(upserts()).toEqual([])
  })

  it('tries every item even if one of them fails', async () => {
    fake.respondWith((call) => (steps(call).includes('"v1"') && steps(call).startsWith('upsert') ? { error: { message: 'deleted item' } } : { data: [] }))
    await expect(mergeGuestCart('u1', [guestItem('v1', 1, 5), guestItem('v2', 1, 5)])).resolves.toBeUndefined()
    expect(upserts()).toHaveLength(2)
  })
})
