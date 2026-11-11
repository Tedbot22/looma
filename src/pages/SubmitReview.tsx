import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrderReview } from '../hooks/useReviews'
import { StarPicker } from '../components/StarRating'
import { OrderSkeleton } from '../components/Skeleton'
import { MAX_MESSAGE_LENGTH, RATING_LABEL, REVIEW_QUESTIONS, type ReviewQuestionKey } from '../lib/reviews'

interface OrderToReview {
  id: string
  order_number: number
  status: string
  order_items: { name: string }[]
}

// Where the customer lands after tapping a star. The star is already filled in; the quick questions
// and the message are all optional, so leaving a review never feels like paperwork.
export default function SubmitReview() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const startRating = Number(params.get('rating'))
  const [rating, setRating] = useState(Number.isInteger(startRating) && startRating >= 1 && startRating <= 5 ? startRating : 0)
  const [answers, setAnswers] = useState<Partial<Record<ReviewQuestionKey, string>>>({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-to-review', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderToReview | null> => {
      // RLS guarantees you can only read your own orders.
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, order_items(name)')
        .eq('id', orderId!)
        .maybeSingle()
      if (error) throw error
      return data as OrderToReview | null
    },
  })
  const { data: existing, isLoading: checkingExisting } = useOrderReview(orderId)

  if (isLoading || checkingExisting) return <OrderSkeleton />

  const back = (
    <Link to={orderId ? `/order/${orderId}` : '/account/orders'} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
      <ArrowLeft size={16} /> Back to order
    </Link>
  )

  if (!order) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">We couldn't find that order.</p>
        <Link to="/account/orders" className="mt-3 inline-block font-medium text-brand underline">
          Your orders
        </Link>
      </div>
    )
  }

  if (done || existing) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <CheckCircle2 className="mx-auto text-green-600" size={48} />
        <h1 className="mt-3 text-2xl font-bold">{done ? 'Thank you for your review!' : "You've already reviewed this order"}</h1>
        <p className="mt-1 text-gray-500">Your feedback helps other shoppers and helps us get better.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/reviews" className="rounded-lg border border-gray-200 px-6 py-3 font-medium hover:border-brand">
            Read store reviews
          </Link>
          <Link to="/shop" className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-light">
            Keep shopping
          </Link>
        </div>
      </div>
    )
  }

  if (order.status !== 'delivered') {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-gray-600">You can review order #{order.order_number} once it has been delivered.</p>
        <Link to={`/order/${order.id}`} className="mt-3 inline-block font-medium text-brand underline">
          Track your order
        </Link>
      </div>
    )
  }

  async function submit() {
    if (!user || !order || rating < 1) return
    setSubmitting(true)

    const { error } = await supabase.from('store_reviews').insert({
      order_id: order.id,
      user_id: user.id,
      rating,
      size_fit: answers.size_fit ?? null,
      comfort: answers.comfort ?? null,
      item_condition: answers.item_condition ?? null,
      delivery: answers.delivery ?? null,
      message: message.trim() || null,
    })
    setSubmitting(false)

    if (error) {
      toast.error(
        error.code === '23505'
          ? "You've already reviewed this order."
          : error.code === '42501'
            ? 'Reviews open once your order has been delivered.'
            : "We couldn't send your review. Please try again."
      )
      return
    }

    // Refresh everything that shows reviews, so the new one appears and the prompt goes away.
    for (const key of ['review-stats', 'store-reviews', 'product-reviews', 'review-products', 'my-reviewed-orders', 'my-review', 'admin-reviews']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
    setDone(true)
  }

  const itemNames = order.order_items.map((i) => i.name)

  return (
    <div className="mx-auto max-w-xl">
      {back}

      <h1 className="text-2xl font-bold">How was your order?</h1>
      <p className="mt-1 text-sm text-gray-500">
        Order #{order.order_number}
        {itemNames.length > 0 && ` · ${itemNames.slice(0, 2).join(', ')}${itemNames.length > 2 ? ` +${itemNames.length - 2} more` : ''}`}
      </p>

      <p className="mt-1 text-xs text-gray-500">Your review will also appear on the product pages of the items in this order.</p>

      <div className="mt-5">
        <StarPicker value={rating} onChange={setRating} size={40} showLabel />
      </div>

      {rating > 0 && (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="font-semibold">A few quick questions</h2>
            <p className="text-xs text-gray-500">All optional. Tap an answer again to clear it.</p>

            <div className="mt-4 space-y-5">
              {REVIEW_QUESTIONS.map((q) => (
                <fieldset key={q.key}>
                  <legend className="mb-2 text-sm font-medium">{q.question}</legend>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((o) => {
                      const selected = answers[q.key] === o.value
                      return (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setAnswers((a) => {
                              const next = { ...a }
                              if (selected) delete next[q.key]
                              else next[q.key] = o.value
                              return next
                            })
                          }
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                            selected ? 'border-brand bg-brand text-white' : 'border-gray-200 hover:border-brand'
                          }`}
                        >
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <section>
            <label htmlFor="review-message" className="font-semibold">
              Tell us more
            </label>
            <p className="text-xs text-gray-500">Optional. What did you like, or what could we do better?</p>
            <textarea
              id="review-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              rows={5}
              placeholder="Share your experience with the item, the fit and the delivery…"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {message.length}/{MAX_MESSAGE_LENGTH}
            </p>
          </section>

          <div>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
            >
              {submitting ? 'Sending…' : `Submit ${RATING_LABEL[rating].toLowerCase()} review`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-500">
              Your review will show your first name and last initial. Not now?{' '}
              <Link to={`/order/${order.id}`} className="underline">
                Skip
              </Link>
            </p>
          </div>
        </div>
      )}

      {rating === 0 && <p className="mt-6 text-sm text-gray-500">Pick a star rating to continue.</p>}
    </div>
  )
}
