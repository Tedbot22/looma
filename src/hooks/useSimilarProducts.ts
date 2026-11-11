import { useMemo, useState } from 'react'
import { getSessionSeed, similarTo } from '../lib/recommend'
import { useCustomerInteractions, useProductPool } from './useRecommendations'
import type { ProductWithVariants } from '../lib/types'

// The "You may also like" row on a product page: items like this product, tuned to what this customer
// has viewed, wishlisted, carted and bought.
export function useSimilarProducts(product: ProductWithVariants, limit: number) {
  const pool = useProductPool()
  const interactions = useCustomerInteractions()
  // Read once, so the random fill doesn't reshuffle while someone is on the page.
  const [seed] = useState(getSessionSeed)

  const items = useMemo(
    () => (pool.data ? similarTo(pool.data, product, { limit, seed, interactions }) : []),
    [pool.data, product, limit, seed, interactions]
  )

  return { items, isLoading: pool.isLoading }
}
