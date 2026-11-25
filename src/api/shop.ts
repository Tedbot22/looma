// Shop data access: the only place that knows how the storefront asks the database for products.
// Keeping it here means pages never build product queries themselves, and a change to the database
// side (see supabase/migrations/0005_shop_search_rpcs.sql) only touches this file.

import { supabase } from '../lib/supabase'
import { normalize, queryAlternatives } from '../lib/search'
import type { ProductWithVariants } from '../lib/types'

export const SHOP_PAGE_SIZE = 24

// The most candidates a search brings back. If a search matches more than this, the shop says so.
export const SEARCH_CANDIDATE_LIMIT = 120

export interface ShopFilters {
  categoryId?: string | null
  min?: number | null
  max?: number | null
}

export interface ShopPage {
  total: number // every item matching the filters, not just this page
  items: ProductWithVariants[]
}

// One page of the shop in its usual shuffled order. The same seed gives the same order, page after page.
export async function fetchShopPage(
  seed: number,
  filters: ShopFilters,
  offset: number,
  limit = SHOP_PAGE_SIZE
): Promise<ShopPage> {
  const { data, error } = await supabase.rpc('browse_products', {
    p_seed: seed,
    p_category: filters.categoryId ?? null,
    p_min: filters.min ?? null,
    p_max: filters.max ?? null,
    p_offset: offset,
    p_limit: limit,
  })
  if (error) throw error
  return data as unknown as ShopPage
}

// Products that could match the typed words. The caller ranks them with searchProducts() from
// lib/search.ts, which is what decides the final matches and their order.
export async function fetchSearchCandidates(
  term: string,
  filters: ShopFilters = {},
  limit = SEARCH_CANDIDATE_LIMIT
): Promise<ProductWithVariants[]> {
  const alternatives = queryAlternatives(term)
  if (alternatives.length === 0) return []

  const { data, error } = await supabase.rpc('search_products', {
    p_terms: alternatives,
    p_phrase: normalize(term),
    p_category: filters.categoryId ?? null,
    p_min: filters.min ?? null,
    p_max: filters.max ?? null,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as unknown as ProductWithVariants[]
}
