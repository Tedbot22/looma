// What the owner changes about the catalogue in the admin: categories, home page banners, products and
// their options. Customers never call these. (The database's access rules also stop anyone but the owner.)
//
// Every function here throws if the database refuses, so a screen can show the message and carry on.

import { supabase } from '../lib/supabase'
import type { BannerRow, Category, Product, ProductWithVariants } from '../lib/types'
import { errorCode, run, unwrap } from './db'

/* ------------------------------ categories ------------------------------ */

export type CategoryRow = Category & { count: number } // count = how many products are in it

export async function fetchAdminCategories(): Promise<CategoryRow[]> {
  const [categories, products] = await Promise.all([
    unwrap<Category[]>(supabase.from('categories').select('*').order('sort_order')),
    unwrap<{ category_id: string }[]>(supabase.from('products').select('category_id')),
  ])
  const counts = new Map<string, number>()
  for (const p of products) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
  return categories.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
}

export const addCategory = (name: string, sortOrder: number) =>
  run(supabase.from('categories').insert({ name, sort_order: sortOrder }))

export const renameCategory = (id: string, name: string) =>
  run(supabase.from('categories').update({ name }).eq('id', id))

// Rewrites every position as 0..n, so the order is always clean even if it had gaps or ties.
// All the changes are attempted; if any failed, the first problem is thrown afterwards.
export async function setCategoryOrder(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, position) => supabase.from('categories').update({ sort_order: position }).eq('id', id))
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// Deletes a category. If it still has products, they are moved to `moveProductsTo` first (pass null if empty).
export async function deleteCategory(id: string, moveProductsTo: string | null): Promise<void> {
  if (moveProductsTo) {
    await run(supabase.from('products').update({ category_id: moveProductsTo }).eq('category_id', id))
  }
  await run(supabase.from('categories').delete().eq('id', id))
}

/* -------------------------------- banners -------------------------------- */

// The admin's access rules let the owner see hidden banners too.
export const fetchAdminBanners = (): Promise<BannerRow[]> =>
  unwrap(supabase.from('hero_banners').select('*').order('sort_order'))

export interface BannerText {
  title: string | null
  subtitle: string | null
  button_label: string | null
  link_url: string | null
}

export const updateBanner = (id: string, text: BannerText) =>
  run(supabase.from('hero_banners').update(text).eq('id', id))

export const setBannerActive = (id: string, active: boolean) =>
  run(supabase.from('hero_banners').update({ is_active: active }).eq('id', id))

export const deleteBanner = (id: string) => run(supabase.from('hero_banners').delete().eq('id', id))

export const addBanner = (imageUrl: string, sortOrder: number) =>
  run(supabase.from('hero_banners').insert({ image_url: imageUrl, sort_order: sortOrder }))

// Saves a new order: each banner's position becomes its place in this list.
export const reorderBanners = (banners: Pick<BannerRow, 'id' | 'image_url'>[]) =>
  run(
    supabase
      .from('hero_banners')
      .upsert(banners.map((b, position) => ({ id: b.id, image_url: b.image_url, sort_order: position })), {
        onConflict: 'id',
      })
  )

/* -------------------------------- products -------------------------------- */

export type AdminProduct = Product & {
  categories: { name: string } | null
  product_variants: { stock: number; is_active: boolean }[]
}

// The admin's access rules let the owner see hidden products too.
export const fetchAdminProducts = (): Promise<AdminProduct[]> =>
  unwrap(
    supabase
      .from('products')
      .select('*, categories(name), product_variants(stock, is_active)')
      .order('created_at', { ascending: false })
  ) as unknown as Promise<AdminProduct[]>

// One product with every option, hidden or not, for the edit form.
export const fetchAdminProduct = (productId: string): Promise<ProductWithVariants | null> =>
  unwrap(supabase.from('products').select('*, product_variants(*)').eq('id', productId).maybeSingle())

export const setProductsActive = (ids: string[], active: boolean) =>
  run(supabase.from('products').update({ is_active: active }).in('id', ids))

export const moveProductsToCategory = (ids: string[], categoryId: string) =>
  run(supabase.from('products').update({ category_id: categoryId }).in('id', ids))

export interface ProductPayload {
  name: string
  description: string | null
  details: string | null
  category_id: string
  price: number
  compare_at_price: number | null
  images: string[]
  size_guide: string | null
  is_active: boolean
}

export const updateProduct = (id: string, payload: ProductPayload) =>
  run(supabase.from('products').update(payload).eq('id', id))

// Adds a product and returns its new id.
export async function createProduct(payload: ProductPayload): Promise<string> {
  const row = await unwrap<{ id: string }>(supabase.from('products').insert(payload).select('id').single())
  return row.id
}

export interface VariantValues {
  color: string | null
  size: string | null
  stock: number
  image: string | null
  is_active: boolean
}

export const updateVariant = (id: string, values: VariantValues) =>
  run(supabase.from('product_variants').update(values).eq('id', id))

export const createVariant = (productId: string, values: VariantValues) =>
  run(supabase.from('product_variants').insert({ ...values, product_id: productId }))

// Removes an option. If a past order uses it (database code 23503), the history is kept and the option is
// hidden with no stock instead.
export async function removeVariantOrHide(id: string): Promise<void> {
  try {
    await run(supabase.from('product_variants').delete().eq('id', id))
  } catch (err) {
    if (errorCode(err) !== '23503') throw err
    await run(supabase.from('product_variants').update({ is_active: false, stock: 0 }).eq('id', id))
  }
}

export type DeleteOutcome = 'deleted' | 'archived'

// The storage file name is the last part of the public photo URL.
function imagePath(url: string): string | null {
  const marker = '/product-images/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

// Deletes a product through the database function.
// 'deleted'  = gone for good.
// 'archived' = it's part of past orders, so it was hidden instead (history stays intact).
export async function deleteProduct(id: string, images: string[]): Promise<DeleteOutcome> {
  const outcome = await unwrap<DeleteOutcome>(supabase.rpc('admin_delete_product', { p_product_id: id }))

  if (outcome === 'deleted') {
    const paths = images.map(imagePath).filter((p): p is string => !!p)
    // Best effort: a leftover photo is harmless, so never fail the delete over it.
    if (paths.length > 0) await supabase.storage.from('product-images').remove(paths).catch(() => {})
  }
  return outcome
}
