import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase } from '../test/fakeSupabase'
import { makeProduct } from '../test/fixtures'
import { fetchActiveBanners, fetchCategories, fetchProduct, fetchProductPool, fetchProductsInOrder, fetchVariantInfo } from './catalog'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake

beforeEach(() => fake.reset())

describe('fetchCategories', () => {
  it('reads every category in the owner’s order', async () => {
    fake.respondWith(() => ({ data: [{ id: 'c1', name: 'Tops', sort_order: 0 }] }))
    await expect(fetchCategories()).resolves.toEqual([{ id: 'c1', name: 'Tops', sort_order: 0 }])
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].target).toBe('categories')
    expect(steps(fake.calls[0])).toBe('select(*) > order(sort_order)')
  })

  it('throws when the database refuses', async () => {
    fake.respondWith(() => ({ error: { message: 'denied', code: '42501' } }))
    await expect(fetchCategories()).rejects.toMatchObject({ message: 'denied' })
  })
})

describe('fetchActiveBanners', () => {
  it('asks only for banners that are switched on, in order, with just the columns customers need', async () => {
    await fetchActiveBanners()
    const [call] = fake.calls
    expect(call.target).toBe('hero_banners')
    expect(steps(call)).toBe('select(id, image_url, title, subtitle, button_label, link_url) > eq(is_active, true) > order(sort_order)')
  })
})

describe('fetchProduct', () => {
  it('asks for one visible product with its category name and every option', async () => {
    const product = makeProduct()
    fake.respondWith(() => ({ data: product }))
    await expect(fetchProduct('p1')).resolves.toEqual(product)
    expect(steps(fake.calls[0])).toBe('select(*, categories(name), product_variants(*)) > eq(id, p1) > eq(is_active, true) > maybeSingle()')
  })

  it('gives null when there is no such product', async () => {
    fake.respondWith(() => ({ data: null }))
    await expect(fetchProduct('missing')).resolves.toBeNull()
  })
})

describe('fetchProductsInOrder', () => {
  it('puts products back in the order requested and skips hidden or removed ones', async () => {
    const a = makeProduct({ name: 'A' })
    const b = makeProduct({ name: 'B' })
    const c = makeProduct({ name: 'C' })
    // The database answers in its own order and does not return the hidden product "gone".
    fake.respondWith(() => ({ data: [c, a, b] }))
    const result = await fetchProductsInOrder([b.id, 'gone', c.id, a.id])
    expect(result.map((p) => p.name)).toEqual(['B', 'C', 'A'])
    expect(steps(fake.calls[0])).toContain('in(id, ["' + b.id + '","gone","' + c.id + '","' + a.id + '"])')
    expect(steps(fake.calls[0])).toContain('eq(is_active, true)')
  })

  it('returns an empty list when nothing matches', async () => {
    fake.respondWith(() => ({ data: [] }))
    await expect(fetchProductsInOrder(['x'])).resolves.toEqual([])
  })
})

describe('fetchProductPool', () => {
  it('takes the newest 300 active products by default, and can be asked for fewer', async () => {
    await fetchProductPool()
    expect(steps(fake.calls[0])).toBe('select(*, product_variants(*)) > eq(is_active, true) > order(created_at, {"ascending":false}) > limit(300)')
    await fetchProductPool(50)
    expect(steps(fake.calls[1])).toMatch(/limit\(50\)$/)
  })
})

describe('fetchVariantInfo', () => {
  it('looks up live stock and price for exactly the options asked about', async () => {
    fake.respondWith(() => ({ data: [{ id: 'v1', stock: 2, is_active: true, products: { is_active: true, price: 5000 } }] }))
    const rows = await fetchVariantInfo(['v1', 'v2'])
    expect(rows).toHaveLength(1)
    expect(fake.calls[0].target).toBe('product_variants')
    expect(steps(fake.calls[0])).toBe('select(id, stock, is_active, products(is_active, price)) > in(id, ["v1","v2"])')
  })
})
