import { useState } from 'react'
import { ProductGridSkeleton } from '../../components/Skeleton'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clearRecentIds, getRecentIds } from '../../lib/recentlyViewed'
import ProductCard from '../../components/ProductCard'
import { fetchProductsInOrder } from '../../api/catalog'
import { queryKeys } from '../../api/queryKeys'

export default function RecentlyViewed() {
  const [ids, setIds] = useState<string[]>(getRecentIds)

  const { data: products, isLoading } = useQuery({
    // Starts with "products" so live stock updates refresh this list too.
    queryKey: queryKeys.products.recent(ids),
    enabled: ids.length > 0,
    queryFn: () => fetchProductsInOrder(ids), // the database returns them in any order; this puts them back in "most recent first"
  })

  function clear() {
    clearRecentIds()
    setIds([])
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recently viewed</h1>
        {ids.length > 0 && (
          <button onClick={clear} className="text-sm font-medium text-gray-500 hover:text-sale">
            Clear
          </button>
        )}
      </div>

      {ids.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-400">Items you look at will appear here.</p>
          <Link to="/shop" className="mt-3 inline-block font-medium text-brand underline">
            Browse the shop
          </Link>
        </div>
      )}

      {isLoading && <ProductGridSkeleton count={4} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {products?.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}
