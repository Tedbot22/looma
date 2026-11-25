import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVariantInfo } from '../api/catalog'
import { queryKeys } from '../api/queryKeys'

export interface VariantInfo {
  stock: number // 0 when the variant (or its product) is no longer available
  price: number // the CURRENT price, which can differ from what the cart saved earlier
}

// Looks up live stock and price for a list of variants.
// Variants the database no longer returns (deleted or hidden) are treated as unavailable by callers.
export function useVariantInfo(variantIds: string[]) {
  const key = [...variantIds].sort()

  const query = useQuery({
    queryKey: queryKeys.variantInfo.forIds(key),
    queryFn: () => fetchVariantInfo(key),
    enabled: key.length > 0,
    staleTime: 0, // stock changes fast, so always re-check when shown
  })

  const infoById = useMemo(() => {
    if (!query.data) return null // null = "not loaded yet"
    const map = new Map<string, VariantInfo>()
    for (const row of query.data) {
      const available = row.is_active && row.products?.is_active
      map.set(row.id, { stock: available ? row.stock : 0, price: row.products?.price ?? 0 })
    }
    return map
  }, [query.data])

  return { infoById, refetch: query.refetch }
}
