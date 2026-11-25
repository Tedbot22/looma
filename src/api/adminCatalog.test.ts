import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as supabaseModule from '../lib/supabase'
import { describe as steps, type FakeSupabase, type RecordedCall } from '../test/fakeSupabase'
import {
  addBanner,
  addCategory,
  createProduct,
  createVariant,
  deleteBanner,
  deleteCategory,
  deleteProduct,
  fetchAdminCategories,
  fetchAdminProduct,
  fetchAdminProducts,
  moveProductsToCategory,
  removeVariantOrHide,
  renameCategory,
  reorderBanners,
  setBannerActive,
  setCategoryOrder,
  setProductsActive,
  updateBanner,
  updateProduct,
  updateVariant,
  type ProductPayload,
  type VariantValues,
} from './adminCatalog'

vi.mock('../lib/supabase', async () => {
  const { fakeSupabase } = await import('../test/fakeSupabase')
  const fake = fakeSupabase()
  return { supabase: fake.client, fake }
})
const fake = (supabaseModule as unknown as { fake: FakeSupabase }).fake

beforeEach(() => fake.reset())

// "products: update({...}) > eq(id, x)" for every recorded call, in order.
const log = () => fake.calls.map((c: RecordedCall) => `${c.target}: ${steps(c)}`)

describe('categories', () => {
  it('counts the products in each category', async () => {
    fake.respondWith((call) =>
      call.target === 'categories'
        ? { data: [{ id: 'c1', name: 'Tops', sort_order: 0 }, { id: 'c2', name: 'Shoes', sort_order: 1 }, { id: 'c3', name: 'Empty', sort_order: 2 }] }
        : { data: [{ category_id: 'c1' }, { category_id: 'c1' }, { category_id: 'c2' }] }
    )
    const rows = await fetchAdminCategories()
    expect(rows.map((r) => [r.name, r.count])).toEqual([['Tops', 2], ['Shoes', 1], ['Empty', 0]])
  })

  it('fails the whole list if either read fails', async () => {
    fake.respondWith((call) => (call.target === 'products' ? { error: { message: 'no access' } } : { data: [] }))
    await expect(fetchAdminCategories()).rejects.toMatchObject({ message: 'no access' })
  })

  it('adds and renames', async () => {
    await addCategory('Hats', 4)
    await renameCategory('c1', 'Caps')
    expect(log()).toEqual([
      'categories: insert({"name":"Hats","sort_order":4})',
      'categories: update({"name":"Caps"}) > eq(id, c1)',
    ])
  })

  it('rewrites the order as 0..n, tries every one, and then reports the first failure', async () => {
    fake.respondWith((call) => (steps(call).includes('eq(id, b)') ? { error: { message: 'locked' } } : {}))
    await expect(setCategoryOrder(['a', 'b', 'c'])).rejects.toMatchObject({ message: 'locked' })
    expect(log()).toEqual([
      'categories: update({"sort_order":0}) > eq(id, a)',
      'categories: update({"sort_order":1}) > eq(id, b)',
      'categories: update({"sort_order":2}) > eq(id, c)',
    ])
  })

  it('moves the products out first, then deletes the category', async () => {
    await deleteCategory('old', 'new')
    expect(log()).toEqual([
      'products: update({"category_id":"new"}) > eq(category_id, old)',
      'categories: delete() > eq(id, old)',
    ])
  })

  it('just deletes an empty category', async () => {
    await deleteCategory('old', null)
    expect(log()).toEqual(['categories: delete() > eq(id, old)'])
  })

  it('does not delete the category if moving its products failed', async () => {
    fake.respondWith((call) => (call.target === 'products' ? { error: { message: 'cannot move' } } : {}))
    await expect(deleteCategory('old', 'new')).rejects.toMatchObject({ message: 'cannot move' })
    expect(fake.calls.map((c) => c.target)).toEqual(['products']) // the delete was never attempted
  })
})

describe('banners', () => {
  it('edits, shows/hides and deletes', async () => {
    await updateBanner('b1', { title: 'Sale', subtitle: null, button_label: 'Shop', link_url: '/shop' })
    await setBannerActive('b1', false)
    await deleteBanner('b1')
    expect(log()).toEqual([
      'hero_banners: update({"title":"Sale","subtitle":null,"button_label":"Shop","link_url":"/shop"}) > eq(id, b1)',
      'hero_banners: update({"is_active":false}) > eq(id, b1)',
      'hero_banners: delete() > eq(id, b1)',
    ])
  })

  it('adds a banner at the end', async () => {
    await addBanner('https://img/1.jpg', 3)
    expect(log()).toEqual(['hero_banners: insert({"image_url":"https://img/1.jpg","sort_order":3})'])
  })

  it('saves a new order, one position per banner, keeping the image', async () => {
    await reorderBanners([
      { id: 'b2', image_url: 'two.jpg' },
      { id: 'b1', image_url: 'one.jpg' },
    ])
    const [call] = fake.calls
    expect(call.steps[0]).toEqual([
      'upsert',
      [[{ id: 'b2', image_url: 'two.jpg', sort_order: 0 }, { id: 'b1', image_url: 'one.jpg', sort_order: 1 }], { onConflict: 'id' }],
    ])
  })
})

describe('products', () => {
  const payload: ProductPayload = {
    name: 'Tee', description: null, details: null, category_id: 'c1', price: 5000,
    compare_at_price: null, images: [], size_guide: null, is_active: true,
  }
  const values: VariantValues = { color: 'Red', size: 'M', stock: 3, image: null, is_active: true }

  it('lists everything for the owner, hidden products included', async () => {
    await fetchAdminProducts()
    expect(steps(fake.calls[0])).toBe('select(*, categories(name), product_variants(stock, is_active)) > order(created_at, {"ascending":false})')
    expect(steps(fake.calls[0])).not.toContain('is_active, true') // no "only visible" filter
  })

  it('loads one product for editing without hiding inactive ones', async () => {
    await fetchAdminProduct('p1')
    expect(steps(fake.calls[0])).toBe('select(*, product_variants(*)) > eq(id, p1) > maybeSingle()')
  })

  it('shows/hides and re-categorises several products at once', async () => {
    await setProductsActive(['a', 'b'], false)
    await moveProductsToCategory(['a', 'b'], 'c9')
    expect(log()).toEqual([
      'products: update({"is_active":false}) > in(id, ["a","b"])',
      'products: update({"category_id":"c9"}) > in(id, ["a","b"])',
    ])
  })

  it('creates a product and hands back its new id', async () => {
    fake.respondWith(() => ({ data: { id: 'new-id' } }))
    await expect(createProduct(payload)).resolves.toBe('new-id')
    expect(steps(fake.calls[0])).toBe(`insert(${JSON.stringify(payload)}) > select(id) > single()`)
  })

  it('reports a failed create instead of returning a bad id', async () => {
    fake.respondWith(() => ({ error: { message: 'duplicate', code: '23505' } }))
    await expect(createProduct(payload)).rejects.toMatchObject({ code: '23505' })
  })

  it('updates a product, and updates or creates its options', async () => {
    await updateProduct('p1', payload)
    await updateVariant('v1', values)
    await createVariant('p1', values)
    expect(log()).toEqual([
      `products: update(${JSON.stringify(payload)}) > eq(id, p1)`,
      `product_variants: update(${JSON.stringify(values)}) > eq(id, v1)`,
      `product_variants: insert(${JSON.stringify({ ...values, product_id: 'p1' })})`,
    ])
  })
})

describe('removeVariantOrHide', () => {
  it('deletes an option nobody ordered', async () => {
    await removeVariantOrHide('v1')
    expect(log()).toEqual(['product_variants: delete() > eq(id, v1)'])
  })

  it('hides it with no stock when a past order still uses it (history is kept)', async () => {
    fake.respondWith((call) => (steps(call).startsWith('delete') ? { error: { message: 'still referenced', code: '23503' } } : {}))
    await removeVariantOrHide('v1')
    expect(log()).toEqual([
      'product_variants: delete() > eq(id, v1)',
      'product_variants: update({"is_active":false,"stock":0}) > eq(id, v1)',
    ])
  })

  it('does not hide anything for any other kind of failure', async () => {
    fake.respondWith(() => ({ error: { message: 'permission denied', code: '42501' } }))
    await expect(removeVariantOrHide('v1')).rejects.toMatchObject({ code: '42501' })
    expect(fake.calls).toHaveLength(1)
  })

  it('tells you if even hiding it failed, rather than leaving a live option behind', async () => {
    fake.respondWith((call) =>
      steps(call).startsWith('delete')
        ? { error: { message: 'still referenced', code: '23503' } }
        : { error: { message: 'could not hide' } }
    )
    await expect(removeVariantOrHide('v1')).rejects.toMatchObject({ message: 'could not hide' })
  })
})

describe('deleteProduct', () => {
  const photos = [
    'https://x.supabase.co/storage/v1/object/public/product-images/abc.jpg?v=2',
    'https://x.supabase.co/storage/v1/object/public/product-images/folder%20a/def.jpg',
    'https://elsewhere.com/not-ours.jpg',
  ]
  const storageCalls = () => fake.calls.filter((c) => c.kind === 'storage')

  it('asks the database to delete, and clears the photos when it really was deleted', async () => {
    fake.respondWith(() => ({ data: 'deleted' }))
    await expect(deleteProduct('p1', photos)).resolves.toBe('deleted')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', target: 'admin_delete_product' })
    expect(fake.calls[0].steps[0]).toEqual(['args', [{ p_product_id: 'p1' }]])
    expect(storageCalls()[0].steps[0]).toEqual(['remove', [['abc.jpg', 'folder a/def.jpg']]]) // only our own files
  })

  it('keeps the photos when the product was only archived (it is in past orders)', async () => {
    fake.respondWith(() => ({ data: 'archived' }))
    await expect(deleteProduct('p1', photos)).resolves.toBe('archived')
    expect(storageCalls()).toHaveLength(0)
  })

  it('still succeeds if cleaning up photos fails (a leftover photo is harmless)', async () => {
    fake.respondWith(() => ({ data: 'deleted' }))
    fake.failStorage()
    await expect(deleteProduct('p1', photos)).resolves.toBe('deleted')
  })

  it('does not touch storage at all if the delete itself failed', async () => {
    fake.respondWith(() => ({ error: { message: 'not allowed' } }))
    await expect(deleteProduct('p1', photos)).rejects.toMatchObject({ message: 'not allowed' })
    expect(storageCalls()).toHaveLength(0)
  })
})
