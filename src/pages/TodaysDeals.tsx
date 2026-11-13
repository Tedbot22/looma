import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProductPool } from '../hooks/useRecommendations'
import { todaysDealsList } from '../lib/todaysDeals'
import ProductCard from '../components/ProductCard'
import { PRODUCT_GRID } from '../lib/layout'
import { ProductGridSkeleton } from '../components/Skeleton'

// Everything behind the home page's "Today's deals" row: a lead mix of fresh arrivals, big markdowns and
// random picks, then a daily mix of recent and older stock.
export default function TodaysDeals() {
  const pool = useProductPool()
  const items = useMemo(() => (pool.data ? todaysDealsList(pool.data) : []), [pool.data])

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Home
      </Link>
      <h1 className="text-2xl font-bold">Today&apos;s deals</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500"></p>

      {pool.isLoading && <ProductGridSkeleton count={10} />}
      {pool.error && <p className="text-red-600">Couldn't load the deals.</p>}
      {!pool.isLoading && items.length === 0 && <p className="text-gray-500">Nothing in stock right now. Check back soon!</p>}

      <div className={PRODUCT_GRID}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}
