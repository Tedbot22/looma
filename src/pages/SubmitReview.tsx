import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrderReview } from '../hooks/useReviews'
import { StarPicker } from '../components/StarRating'
import ReviewMediaPicker from '../components/ReviewMediaPicker'
import { removeUploaded, uploadReviewMedia, type PendingMedia } from '../lib/reviewMedia'
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
// The fit and comfort questions are no longer asked (old reviews that answered them still show them).
const FORM_QUESTIONS = REVIEW_QUESTIONS.filter((q) => q.key !== 'size_fit' && q.key !== 'comfort')

export default function SubmitReview() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const startRating = Number(params.get('rating'))
  const [rating, setRating] = useState(Number.isInteger(startRating) && startRating >= 1 && startRating <= 5 ? startRating : 0)
  const [answers, setAnswers] = useState<Partial<Record<ReviewQuestionKey, string>>>({})
  const [message, setMessage] = useState('')
  const [media, setMedia] = useState<PendingMedia[]>([])
  const [progress, setProgress] = useState('')
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

    // 1. Upload the photos and video first, so a slow connection never leaves a half-finished review.
    const uploaded: { kind: 'image' | 'video'; url: string }[] = []
    try {
      for (const [i, item] of media.entries()) {
        setProgress(`Uploading ${i + 1} of ${media.length}…`)
        uploaded.push({ kind: item.kind, url: await uploadReviewMedia(user.id, item) })
      }
    } catch {
      await removeUploaded(uploaded.map((u) => u.url))
      setSubmitting(false)
      setProgress('')
      toast.error("We couldn't upload your photos or video. Check your connection and try again.")
      return
    }
    setProgress('')

    // 2. The review itself.
    const { data: created, error } = await supabase
      .from('store_reviews')
      .insert({
        order_id: order.id,
        user_id: user.id,
        rating,
        item_condition: answers.item_condition ?? null,
        delivery: answers.delivery ?? null,
        message: message.trim() || null,
      })
      .select('id')
      .single()

    if (error || !created) {
      await removeUploaded(uploaded.map((u) => u.url))
      setSubmitting(false)
      toast.error(
        error?.code === '23505'
          ? "You've already reviewed this order."
          : error?.code === '42501'
            ? 'Reviews open once your order has been delivered.'
            : "We couldn't send your review. Please try again."
      )
      return
    }

    // 3. Attach the files to the review.
    if (uploaded.length > 0) {
      const { error: mediaError } = await supabase
        .from('review_media')
        .insert(uploaded.map((u) => ({ review_id: created.id, user_id: user.id, kind: u.kind, url: u.url })))
      if (mediaError) {
        await removeUploaded(uploaded.map((u) => u.url))
        toast.warning("Your review was sent, but your photos or video couldn't be attached.")
      }
    }
    setSubmitting(false)
    media.forEach((m) => URL.revokeObjectURL(m.preview))

    // Refresh everything that shows reviews, so the new one appears and the prompt goes away.
    for (const key of ['review-stats', 'store-reviews', 'product-reviews', 'review-products', 'my-reviewed-orders', 'my-review', 'admin-reviews', 'review-media']) {
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


      <div className="mt-5">
        <StarPicker value={rating} onChange={setRating} size={35} showLabel />
      </div>

      {rating > 0 && (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="font-semibold">A few quick questions</h2>

            <div className="mt-4 space-y-5">
              {FORM_QUESTIONS.map((q) => (
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

          <ReviewMediaPicker items={media} onChange={setMedia} disabled={submitting} />

          <section>
            <label htmlFor="review-message" className="font-semibold">
              Tell us more
            </label>
            <p className="text-xs text-gray-500">{`What did you like, or what could we do better? (optional)`}</p>
            <textarea
              id="review-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              rows={5}
              placeholder="Share your thoughts and experience about this item…"
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
              {submitting ? progress || 'Sending…' : `Submit review`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-500">
              Not now?{' '}
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
