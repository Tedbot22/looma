import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { Stars } from '../../components/StarRating'
import { ListSkeleton } from '../../components/Skeleton'
import { REVIEW_QUESTIONS, optionLabel, type ReviewQuestionKey } from '../../lib/reviews'
import ReviewMediaGallery from '../../components/ReviewMediaGallery'
import type { ReviewMedia } from '../../lib/reviewMedia'

interface AdminReview {
  id: string
  rating: number
  size_fit: string | null
  comfort: string | null
  delivery: string | null
  item_condition: string | null
  message: string | null
  is_visible: boolean
  created_at: string
  orders: { order_number: number } | null
  profiles: { full_name: string | null } | null
  review_media: Pick<ReviewMedia, 'id' | 'kind' | 'url'>[] | null
}

type Filter = 'all' | 'low' | 'hidden'

// Admin, then Reviews: read everything customers wrote, spot unhappy customers quickly, and hide anything
// that shouldn't be public (a hidden review disappears from the store and from the averages).
export default function AdminReviews() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async (): Promise<AdminReview[]> => {
      const { data, error } = await supabase
        .from('store_reviews')
        .select('*, orders(order_number), profiles(full_name), review_media(id, kind, url)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as AdminReview[]
    },
  })

  async function setVisible(review: AdminReview, visible: boolean) {
    setBusyId(review.id)
    const { error } = await supabase.from('store_reviews').update({ is_visible: visible }).eq('id', review.id)
    setBusyId(null)
    if (error) return toast.error(error.message)

    toast.success(visible ? 'Review is public again' : 'Review hidden from the store')
    for (const key of ['admin-reviews', 'review-stats', 'store-reviews']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  const all = reviews ?? []
  const visibleOnes = all.filter((r) => r.is_visible)
  const average = visibleOnes.length ? visibleOnes.reduce((sum, r) => sum + r.rating, 0) / visibleOnes.length : 0

  const list = all.filter((r) => (filter === 'low' ? r.rating <= 2 : filter === 'hidden' ? !r.is_visible : true))
  const lowCount = all.filter((r) => r.rating <= 2).length
  const hiddenCount = all.filter((r) => !r.is_visible).length

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: `All (${all.length})` },
    { id: 'low', label: `1–2 stars (${lowCount})` },
    { id: 'hidden', label: `Hidden (${hiddenCount})` },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Reviews</h1>
          {visibleOnes.length > 0 && (
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <Stars value={average} size={15} /> {average.toFixed(1)} average from {visibleOnes.length} public{' '}
              {visibleOnes.length === 1 ? 'review' : 'reviews'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                filter === c.id ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-brand'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <p className="text-red-600">Couldn't load reviews. Have phase8_reviews.sql and phase9_admin_metrics_and_review_media.sql been run?</p>}
      {reviews && list.length === 0 && <p className="py-10 text-center text-gray-400">Nothing here yet.</p>}

      <ul className="space-y-3">
        {list.map((r) => (
          <li key={r.id} className={`rounded-xl border bg-white p-4 ${r.is_visible ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Stars value={r.rating} size={16} />
                <p className="mt-1 text-sm font-medium">
                  {r.profiles?.full_name || 'Customer'}
                  <span className="font-normal text-gray-400">
                    {' '}· Order #{r.orders?.order_number ?? '?'} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => setVisible(r, !r.is_visible)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:border-brand disabled:opacity-50"
              >
                {r.is_visible ? (
                  <>
                    <EyeOff size={14} /> Hide
                  </>
                ) : (
                  <>
                    <Eye size={14} /> Show again
                  </>
                )}
              </button>
            </div>

            {r.message && <p className="mt-3 whitespace-pre-line break-words text-sm text-gray-700">{r.message}</p>}
            {r.review_media && r.review_media.length > 0 && <ReviewMediaGallery media={r.review_media} />}

            <ul className="mt-3 flex flex-wrap gap-2">
              {REVIEW_QUESTIONS.map((q) => {
                const label = optionLabel(q.key as ReviewQuestionKey, r[q.key])
                return label ? (
                  <li key={q.key} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    {q.short}: <span className="font-medium text-gray-800">{label}</span>
                  </li>
                ) : null
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
