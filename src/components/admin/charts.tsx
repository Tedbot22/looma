import { useState } from 'react'

// Small charts drawn with plain SVG, so the admin area needs no chart library.

// ---------- bars over time ----------
export interface BarPoint {
  label: string // shown when hovering, e.g. "12 Nov"
  value: number
}

function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const n = max / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

export function BarChart({
  data,
  format,
  height = 200,
}: {
  data: BarPoint[]
  format: (n: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const padL = 4
  const padB = 22
  const H = height
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const plotH = H - padB
  const slot = (W - padL) / Math.max(data.length, 1)
  const barW = Math.max(2, slot * 0.7)
  const ticks = [0, 0.5, 1]
  const active = hover !== null ? data[hover] : null

  return (
    <div>
      <p className="mb-2 h-5 text-sm text-gray-500" aria-live="polite">
        {active ? (
          <>
            <span className="font-semibold text-gray-900">{format(active.value)}</span> · {active.label}
          </>
        ) : (
          'Tap or hover a bar for the day'
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={W} y1={plotH - t * plotH} y2={plotH - t * plotH} stroke="#e5e7eb" strokeWidth={1} />
            {t > 0 && (
              <text x={padL} y={plotH - t * plotH - 3} fontSize={10} fill="#9ca3af">
                {format(max * t)}
              </text>
            )}
          </g>
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * plotH
          const x = padL + i * slot + (slot - barW) / 2
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              {/* a taller invisible target, so thin bars are easy to touch */}
              <rect x={padL + i * slot} y={0} width={slot} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={plotH - h}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={Math.min(3, barW / 2)}
                fill={hover === i ? '#0e4d44' : '#09322c'}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            </g>
          )
        })}
        <text x={padL} y={H - 6} fontSize={10} fill="#9ca3af">
          {data[0]?.label}
        </text>
        <text x={W} y={H - 6} fontSize={10} fill="#9ca3af" textAnchor="end">
          {data[data.length - 1]?.label}
        </text>
      </svg>
    </div>
  )
}

// ---------- donut ----------
export interface Slice {
  label: string
  value: number
  color: string
}

export function Donut({ slices, centre }: { slices: Slice[]; centre: { big: string; small: string } }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const R = 40
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Donut chart">
        <circle cx={50} cy={50} r={R} fill="none" stroke="#f3f4f6" strokeWidth={14} />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * C
              const el = (
                <circle
                  key={s.label}
                  cx={50}
                  cy={50}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={14}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += len
              return el
            })}
        <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
          <text x={50} y={50} textAnchor="middle" fontSize={16} fontWeight={700} fill="#111827">
            {centre.big}
          </text>
          <text x={50} y={62} textAnchor="middle" fontSize={7} fill="#6b7280">
            {centre.small}
          </text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums">
              {s.value}
              {total > 0 && <span className="ml-1 font-normal text-gray-400">({Math.round((s.value / total) * 100)}%)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- horizontal bars (top products) ----------
export function HBars({ rows }: { rows: { label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums">{r.display}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-gray-400">{r.sub}</p>}
        </li>
      ))}
    </ul>
  )
}
