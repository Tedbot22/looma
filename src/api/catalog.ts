// What the storefront reads about the catalogue: categories, banners, products and live stock.
// (The shop's paged list and search live in ./shop.ts. Owner-only changes live in ./adminCatalog.ts.)

import { supabase } from '../lib/supabase'
import type { Banner, Category, ProductWithVariants } from '../lib/types'
import { unwrap } from './db'

// Shop categories, in the order the owner set.
export const fetchCategories = (): Promise<Category[]> =>
  unwrap(supabase.from('categories').select('*').order('sort_order'))

// The banners showing on the home page (hidden ones are left out), in the owner's order.
export const fetchActiveBanners = (): Promise<Banner[]> =>
  unwrap(
    supabase
      .from('hero_banners')
      .select('id, image_url, title, subtitle, button_label, link_url')
      .eq('is_active', true)
      .order('sort_order')
  )

// One product with its category name and every option. Null when it doesn't exist or is hidden.
export const fetchProduct = (productId: string): Promise<ProductWithVariants | null> =>
  unwrap(
    supabase
      .from('products')
      .select('*, categories(name), product_variants(*)')
      .eq('id', productId)
      .eq('is_active', true)
      .maybeSingle()
  )

// These products, in the order the ids were given. Hidden or removed ones are skipped.
export async function fetchProductsInOrder(ids: string[]): Promise<ProductWithVariants[]> {
  const rows = await unwrap<ProductWithVariants[]>(
    supabase.from('products').select('*, product_variants(*)').in('id', ids).eq('is_active', true)
  )
  const byId = new Map(rows.map((p) => [p.id, p]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

// The newest active products with all their options. A small store's catalogue easily fits in one request;
// it feeds the recommendations and today's deals.
export const fetchProductPool = (limit = 300): Promise<ProductWithVariants[]> =>
  unwrap(
    supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit)
  )

// Live stock and price for some options (the cart uses it to check what is still available).
export interface VariantInfoRow {
  id: string
  stock: number
  is_active: boolean
  products: { is_active: boolean; price: number } | null
}

export const fetchVariantInfo = (variantIds: string[]): Promise<VariantInfoRow[]> =>
  unwrap(
    supabase
      .from('product_variants')
      .select('id, stock, is_active, products(is_active, price)')
      .in('id', variantIds)
  ) as unknown as Promise<VariantInfoRow[]>
