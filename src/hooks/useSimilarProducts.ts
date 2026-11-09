import { useMemo, useState } from 'react'
import { getSessionSeed, similarTo } from '../lib/recommend'
import { useProductPool } from './useRecommendations'
import type { ProductWithVariants } from '../lib/types'

// Items similar to the given product, for the "You may also like" row on its page.
export function useSimilarProducts(product: ProductWithVariants, limit: number) {
  const pool = useProductPool()
  // Read once, so the random fill doesn't reshuffle while someone is on the page.
  const [seed] = useState(getSessionSeed)

  const items = useMemo(
    () => (pool.data ? similarTo(pool.data, product, { limit, seed }) : []),
    [pool.data, product, limit, seed]
  )

  return { items, isLoading: pool.isLoading }
}
