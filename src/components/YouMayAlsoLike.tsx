import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useSimilarProducts } from '../hooks/useSimilarProducts'
import ProductCard from './ProductCard'
import { ProductGridSkeleton } from './Skeleton'
import type { ProductWithVariants } from '../lib/types'

// The "You may also like" row under the product details: other items that are similar to this one.
export default function YouMayAlsoLike({ product }: { product: ProductWithVariants }) {
  const { items, isLoading } = useSimilarProducts(product, 8)

  // Nothing to suggest (a one-item shop): show nothing rather than an empty heading.
  if (!isLoading && items.length === 0) return null

  return (
    <section className="mt-14 border-t border-gray-200 pt-10" aria-labelledby="also-like-heading">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 id="also-like-heading" className="text-xl font-bold sm:text-2xl">
          You may also like
        </h2>
        <Link
          to={`/recommended?like=${product.id}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand"
        >
          More like this <ArrowRight size={15} />
        </Link>
      </div>

      {isLoading ? (
        <ProductGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 md:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  )
}
