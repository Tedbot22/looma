import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useRecommendations } from '../hooks/useRecommendations'
import ProductCard from '../components/ProductCard'
import { ProductGridSkeleton } from '../components/Skeleton'

// The full "Recommended for you" list (the home page shows the first few).
export default function Recommended() {
  const { items, personalised, isLoading, error } = useRecommendations(40)

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Home
      </Link>
      <h1 className="text-2xl font-bold">Recommended for you</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">
        {personalised > 0
          ? 'Based on the items you view, save and buy, followed by a few other finds.'
          : 'Browse a few items and these picks will start to match your taste.'}
      </p>

      {isLoading && <ProductGridSkeleton count={10} />}
      {error && <p className="text-red-600">Couldn't load recommendations.</p>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}
