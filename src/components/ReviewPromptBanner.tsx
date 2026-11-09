import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePendingReviewOrders } from '../hooks/useReviews'
import { dismissOrderPrompt, getDismissedOrders } from '../lib/reviews'
import RateOrder from '../components/RateOrder'

// A small floating card that asks about the customer's most recent delivered order.
// It is only a nudge: the close button hides it for good (for that order, on this device).
export default function ReviewPromptBanner() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { pending } = usePendingReviewOrders()
  const [dismissed, setDismissed] = useState(getDismissedOrders)

  const next = pending?.find((o) => !dismissed.includes(o.id))
  if (!user || !next) return null

  // Don't get in the way of checking out, reviewing, or the order page (which has its own rating card).
  if (pathname.startsWith('/checkout') || pathname.startsWith('/review/') || pathname === `/order/${next.id}`) {
    return null
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-6 sm:w-80">
      <RateOrder
        orderId={next.id}
        orderNumber={next.order_number}
        className="shadow-lg"
        onDismiss={() => setDismissed(dismissOrderPrompt(next.id))}
      />
    </div>
  )
}
