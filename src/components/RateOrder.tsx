import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, X } from 'lucide-react'
import { StarPicker } from '../components/StarRating'
import { useOrderReview } from '../hooks/useReviews'

// "How was your order?" Tapping a star takes the customer to the review form with that rating filled in.
// Optional by design: if onDismiss is given, a close button lets them say "not now".
export default function RateOrder({
  orderId,
  orderNumber,
  onDismiss,
  className = '',
}: {
  orderId: string
  orderNumber: number
  onDismiss?: () => void
  className?: string
}) {
  const navigate = useNavigate()

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">How was your order?</p>
          <p className="mt-0.5 text-xs text-gray-500">Order #{orderNumber} · tap a star to leave a quick review</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Not now"
            className="-mr-1 -mt-1 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="mt-3">
        <StarPicker value={0} size={32} onChange={(n) => navigate(`/review/${orderId}?rating=${n}`)} />
      </div>
    </div>
  )
}

// For the order page: the rating card if they haven't reviewed yet, a thank-you if they have.
export function OrderReviewSection({ orderId, orderNumber }: { orderId: string; orderNumber: number }) {
  const { data: review, isLoading } = useOrderReview(orderId)
  if (isLoading) return null

  if (review) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <CheckCircle2 size={20} className="shrink-0 text-green-600" />
        <p>
          Thanks for your review!{' '}
          <Link to="/reviews" className="font-medium underline">
            See what others say
          </Link>
        </p>
      </div>
    )
  }
  return <RateOrder orderId={orderId} orderNumber={orderNumber} />
}
