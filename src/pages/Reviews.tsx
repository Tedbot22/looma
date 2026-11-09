import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { Stars } from '../components/StarRating'
import ReviewCard from '../components/ReviewCard'
import { ListSkeleton, Skeleton } from '../components/Skeleton'
import { useReviewStats, useStoreReviews, type ReviewSort } from '../hooks/useReviews'
import { REVIEW_QUESTIONS, type ReviewStats, type Tone } from '../lib/reviews'

const PAGE_SIZE = 10

const TONE_BAR: Record<Tone, string> = {
  low: 'bg-red-400',
  mid: 'bg-emerald-300',
  high: 'bg-emerald-600',
}

// The big average, and one bar per star. Clicking a bar filters the list to that rating.
function RatingSummary({
  stats,
  activeStar,
  onStar,
}: {
  stats: ReviewStats
  activeStar: number | null
  onStar: (star: number | null) => void
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center sm:px-6">
        <p className="text-5xl font-bold">{stats.average.toFixed(1)}</p>
        <Stars value={stats.average} size={22} className="mt-2" />
        <p className="mt-1 text-sm text-gray-500">
          {stats.count} {stats.count === 1 ? 'review' : 'reviews'}
        </p>
      </div>

      <ul className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = stats.stars[String(star) as '1']
          const percent = stats.count ? Math.round((n / stats.count) * 100) : 0
          const active = activeStar === star
          return (
            <li key={star}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onStar(active ? null : star)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1 text-sm hover:bg-gray-50 ${active ? 'bg-gray-100' : ''}`}
              >
                <span className="w-10 shrink-0 text-left text-gray-600">{star} star</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-gray-500">{percent}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// "What customers say": how people answered each quick question, as a single coloured bar.
function QuestionBreakdown({ stats }: { stats: ReviewStats }) {
  const rows = REVIEW_QUESTIONS.flatMap((q) => {
    const counts = stats[q.key]
    const total = q.options.reduce((sum, o) => sum + (counts?.[o.value] ?? 0), 0)
    return total > 0 ? [{ q, counts, total }] : []
  })
  if (rows.length === 0) return null

  return (
    <section className="mt-8 rounded-2xl bg-gray-50 p-5">
      <h2 className="font-semibold">What customers say</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {rows.map(({ q, counts, total }) => {
          const positive = q.options.filter((o) => o.tone !== 'low').reduce((sum, o) => sum + (counts[o.value] ?? 0), 0)
          return (
            <div key={q.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{q.short}</span>
                <span className="text-gray-500">{Math.round((positive / total) * 100)}% positive</span>
              </div>
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-gray-200" role="img"
                aria-label={q.options.map((o) => `${o.label}: ${counts[o.value] ?? 0}`).join(', ')}>
                {q.options.map((o) => (
                  <span key={o.value} className={TONE_BAR[o.tone]} style={{ width: `${((counts[o.value] ?? 0) / total) * 100}%` }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {q.options.map((o) => `${o.label} ${counts[o.value] ?? 0}`).join(' · ')}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The public reviews page. Reviews are about the store (every thrift item is one of a kind),
// and each one comes from a delivered order, so all of them are verified purchases.
export default function Reviews() {
  const [rating, setRating] = useState<number | null>(null)
  const [withComments, setWithComments] = useState(false)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const stats = useReviewStats()
  const reviews = useStoreReviews({ rating, withComments, sort })

  const shown = reviews.data?.slice(0, visible) ?? []
  const filtered = rating !== null || withComments

  function resetPaging<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setVisible(PAGE_SIZE)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/shop" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Back to shop
      </Link>
      <h1 className="text-2xl font-bold">Customer reviews</h1>
      <p className="mt-1 text-sm text-gray-500">
        Real feedback from customers whose orders were delivered. Reviews are about shopping with us, since every item
        is one of a kind.
      </p>

      {stats.isLoading && <Skeleton className="mt-6 h-40 w-full rounded-2xl" />}
      {stats.error && <p className="mt-6 text-red-600">Couldn't load the reviews.</p>}

      {stats.data && stats.data.count === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-gray-300 py-16 text-center">
          <p className="font-medium">No reviews yet</p>
          <p className="mt-1 text-sm text-gray-500">After your order is delivered, you'll be invited to share how it went.</p>
          <Link to="/shop" className="mt-4 inline-block font-medium text-brand underline">
            Start shopping
          </Link>
        </div>
      )}

      {stats.data && stats.data.count > 0 && (
        <>
          <div className="mt-6 rounded-2xl border border-gray-200 p-5">
            <RatingSummary stats={stats.data} activeStar={rating} onStar={resetPaging(setRating)} />
          </div>

          <QuestionBreakdown stats={stats.data} />

          {/* Filters */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">All reviews</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-gray-600">
                <input
                  type="checkbox"
                  checked={withComments}
                  onChange={(e) => resetPaging(setWithComments)(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                With comments
              </label>
              <label className="flex items-center gap-2 text-gray-600">
                <span className="sr-only">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => resetPaging(setSort)(e.target.value as ReviewSort)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 outline-none focus:border-brand"
                >
                  <option value="newest">Newest first</option>
                  <option value="highest">Highest rated</option>
                  <option value="lowest">Lowest rated</option>
                </select>
              </label>
            </div>
          </div>

          {rating !== null && (
            <button
              type="button"
              onClick={() => resetPaging(setRating)(null)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
            >
              {rating} star reviews <X size={14} />
            </button>
          )}

          <div className="mt-4 space-y-4">
            {reviews.isLoading && <ListSkeleton rows={3} />}
            {reviews.error && <p className="text-red-600">Couldn't load the reviews.</p>}
            {reviews.data && reviews.data.length === 0 && (
              <p className="py-10 text-center text-gray-500">
                {filtered ? 'No reviews match these filters.' : 'No reviews yet.'}
              </p>
            )}
            {shown.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>

          {reviews.data && visible < reviews.data.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mx-auto mt-6 block rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium hover:border-brand hover:text-brand"
            >
              Show more reviews
            </button>
          )}
        </>
      )}
    </div>
  )
}
