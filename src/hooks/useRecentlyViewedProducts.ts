import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getRecentIds } from '../lib/recentlyViewed'
import type { ProductWithVariants } from '../lib/types'

// The products this device looked at most recently, newest first (hidden or removed ones are skipped).
export function useRecentlyViewedProducts(limit: number) {
  const [ids] = useState(() => getRecentIds().slice(0, limit))

  const query = useQuery({
    // Starts with "products" so live stock updates refresh it too.
    queryKey: ['products', 'recent', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ProductWithVariants[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants(*)')
        .in('id', ids)
        .eq('is_active', true)
      if (error) throw error
      const byId = new Map((data as ProductWithVariants[]).map((p) => [p.id, p]))
      return ids.flatMap((id) => byId.get(id) ?? []) // back into "most recent first"
    },
  })

  return { hasAny: ids.length > 0, products: query.data ?? [], isLoading: query.isLoading }
}
