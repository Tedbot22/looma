import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecentIds } from '../lib/recentlyViewed'
import { fetchProductsInOrder } from '../api/catalog'
import { queryKeys } from '../api/queryKeys'

// The products this device looked at most recently, newest first (hidden or removed ones are skipped).
export function useRecentlyViewedProducts(limit: number) {
  const [ids] = useState(() => getRecentIds().slice(0, limit))

  const query = useQuery({
    // Starts with "products" so live stock updates refresh it too.
    queryKey: queryKeys.products.recent(ids),
    enabled: ids.length > 0,
    queryFn: () => fetchProductsInOrder(ids), // back into "most recent first"
  })

  return { hasAny: ids.length > 0, products: query.data ?? [], isLoading: query.isLoading }
}
