import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProductPool } from '../hooks/useRecommendations'
import { dailyDealsList } from '../lib/dailyDeals'
import ProductCard from '../components/ProductCard'
import { ProductGridSkeleton } from '../components/Skeleton'

// Everything behind the home page's "Daily deals" row: the newest items first, then a daily mix of
// recent and older stock.
export default function DailyDeals() {
  const pool = useProductPool()
  const items = useMemo(() => (pool.data ? dailyDealsList(pool.data) : []), [pool.data])

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Home
      </Link>
      <h1 className="text-2xl font-bold">Daily deals</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">Fresh arrivals first, then a daily mix of newer and older finds.</p>

      {pool.isLoading && <ProductGridSkeleton count={10} />}
      {pool.error && <p className="text-red-600">Couldn't load the deals.</p>}
      {!pool.isLoading && items.length === 0 && <p className="text-gray-500">Nothing in stock right now. Check back soon!</p>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}
