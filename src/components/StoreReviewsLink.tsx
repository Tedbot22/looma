import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Stars } from './StarRating'
import { useReviewStats } from '../hooks/useReviews'

// Sits under the product details. Every thrift item is one of a kind, so an item can't have reviews of its own:
// this links to what customers say about the store instead.
export default function StoreReviewsLink() {
  const { data: stats } = useReviewStats()
  const count = stats?.count ?? 0

  return (
    <Link
      to="/reviews"
      className="mt-10 flex items-center justify-between gap-4 rounded-2xl border border-gray-200 p-4 transition-colors hover:border-brand sm:p-5"
    >
      <div className="min-w-0">
        <p className="font-semibold">Store reviews</p>
        {count > 0 && stats ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Stars value={stats.average} size={16} />
            <span className="font-semibold">{stats.average.toFixed(1)}</span>
            <span className="text-gray-500">
              from {count} {count === 1 ? 'customer' : 'customers'}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-500">See what customers say about shopping with us</p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand">
        View store reviews <ArrowRight size={15} />
      </span>
    </Link>
  )
}
