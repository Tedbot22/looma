import { useState } from 'react'
import { Stars } from './StarRating'
import ReviewCard from './ReviewCard'
import { useProductReviews, useReviewMedia } from '../hooks/useReviews'

// Reviews from customers who bought this product. Sits on the product page, above the store reviews link.
// Shows nothing until the product has at least one review.
export default function ProductReviews({ productId }: { productId: string }) {
  const { data } = useProductReviews(productId)
  const [showAll, setShowAll] = useState(false)
  const { data: mediaByReview } = useReviewMedia((data?.reviews ?? []).map((r) => r.id))

  if (!data || data.count === 0) return null

  const shown = showAll ? data.reviews : data.reviews.slice(0, 3)

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Reviews of this item</h2>
        <Stars value={data.average} size={16} />
        <span className="text-sm font-semibold">{data.average.toFixed(1)}</span>
        <span className="text-sm text-gray-500">
          ({data.count} {data.count === 1 ? 'review' : 'reviews'})
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {shown.map((r) => (
          <ReviewCard key={r.id} review={r} media={mediaByReview?.[r.id]} />
        ))}
      </div>

      {!showAll && data.reviews.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium hover:border-brand"
        >
          Show all {data.reviews.length} reviews
        </button>
      )}
    </section>
  )
}
