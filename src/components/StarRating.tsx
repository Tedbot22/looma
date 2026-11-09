import { useState } from 'react'
import { Star } from 'lucide-react'
import { RATING_LABEL } from '../lib/reviews'

// Read-only stars. Accepts decimals (4.6 fills 4 and a bit more than half of the fifth).
export function Stars({ value, size = 16, className = '' }: { value: number; size?: number; className?: string }) {
  const percent = Math.max(0, Math.min(5, value)) * 20
  const row = (fill: boolean) =>
    [0, 1, 2, 3, 4].map((i) => (
      <Star
        key={i}
        size={size}
        className={`shrink-0 ${fill ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
      />
    ))

  return (
    <span
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
      className={`relative inline-flex ${className}`}
    >
      <span className="inline-flex">{row(false)}</span>
      <span className="absolute inset-y-0 left-0 inline-flex overflow-hidden" style={{ width: `${percent}%` }}>
        {row(true)}
      </span>
    </span>
  )
}

// Tappable stars. Hovering previews a rating; clicking picks it.
export function StarPicker({
  value,
  onChange,
  size = 36,
  showLabel = false,
}: {
  value: number
  onChange: (rating: number) => void
  size?: number
  showLabel?: boolean
}) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  return (
    <div>
      <div role="radiogroup" aria-label="Rating" className="inline-flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}: ${RATING_LABEL[n]}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Star
              size={size}
              className={n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-300'}
            />
          </button>
        ))}
      </div>
      {showLabel && (
        <p className="mt-1 h-5 text-sm font-medium text-gray-600">{shown ? RATING_LABEL[shown] : ''}</p>
      )}
    </div>
  )
}
