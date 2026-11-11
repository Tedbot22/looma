import { Link } from 'react-router-dom'
import { BadgeCheck } from 'lucide-react'
import { Stars } from '../components/StarRating'
import { REVIEW_QUESTIONS, optionLabel, type PublicReview, type ReviewProduct } from '../lib/reviews'

// One customer review: stars, who and when, what they said about the quick questions, and their message.
export default function ReviewCard({ review, products }: { review: PublicReview; products?: ReviewProduct[] }) {
  const answers = REVIEW_QUESTIONS.flatMap((q) => {
    const label = optionLabel(q.key, review[q.key])
    return label ? [{ key: q.key, short: q.short, label }] : []
  })

  return (
    <article className="rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars value={review.rating} size={18} />
        <time dateTime={review.created_at} className="text-xs text-gray-400">
          {new Date(review.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
        </time>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
        {review.reviewer_name}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
          <BadgeCheck size={14} /> Verified purchase
        </span>
      </p>

      {products && products.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          Bought:{' '}
          {products.map((p, i) => (
            <span key={p.product_id}>
              {i > 0 && ', '}
              <Link to={`/product/${p.product_id}`} className="font-medium text-brand underline">
                {p.product_name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {review.message && <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">{review.message}</p>}

      {answers.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {answers.map((a) => (
            <li key={a.key} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
              {a.short}: <span className="font-medium text-gray-800">{a.label}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
