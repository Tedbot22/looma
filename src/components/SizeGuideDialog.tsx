import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { whatsappLink } from '../lib/whatsapp'
import {
  BOTTOMS_ROWS,
  CLOTHING_ROWS,
  SHOE_ROWS,
  formatLength,
  formatRange,
  type SizeGuideKind,
  type Unit,
} from '../lib/sizeGuides'

interface Props {
  kind: SizeGuideKind
  productName: string
  onClose: () => void
}

const cell = 'px-3 py-2 text-center whitespace-nowrap'
const head = `${cell} bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500`

// The "Size guide" sheet: a bottom sheet on phones, a centred card on larger screens.
// Mounted only while open. The Back button closes it (same idea as the review photo viewer).
export default function SizeGuideDialog({ kind, productName, onClose }: Props) {
  const [unit, setUnit] = useState<Unit>('cm')
  const [tab, setTab] = useState<'tops' | 'bottoms'>('tops')

  useEffect(() => {
    window.history.pushState({ ...window.history.state, sizeGuide: true }, '')
    let popped = false
    const onPop = () => {
      popped = true
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (!popped) window.history.back() // closed with X or by tapping outside: step our history entry back
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = kind === 'shoes' ? 'Shoe size guide' : 'Size guide'

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {kind === 'clothing' ? (
              <div className="inline-flex rounded-full bg-gray-100 p-1 text-sm font-medium" role="tablist">
                {(
                  [
                    ['tops', 'Tops & dresses'],
                    ['bottoms', 'Jeans & trousers'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-full px-3.5 py-1.5 ${tab === id ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <div className="inline-flex rounded-full bg-gray-100 p-1 text-sm font-medium" role="group" aria-label="Units">
              {(['cm', 'in'] as const).map((u) => (
                <button
                  key={u}
                  aria-pressed={unit === u}
                  onClick={() => setUnit(u)}
                  className={`rounded-full px-3.5 py-1.5 ${unit === u ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                >
                  {u === 'cm' ? 'cm' : 'inches'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            {kind === 'shoes' && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={head}>EU</th>
                    <th className={head}>UK</th>
                    <th className={head}>US men</th>
                    <th className={head}>US women</th>
                    <th className={head}>Foot ({unit})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {SHOE_ROWS.map((r) => (
                    <tr key={r.eu}>
                      <td className={`${cell} font-semibold`}>{r.eu}</td>
                      <td className={cell}>{r.uk}</td>
                      <td className={cell}>{r.usMen}</td>
                      <td className={cell}>{r.usWomen}</td>
                      <td className={cell}>{formatLength(r.footCm, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {kind === 'clothing' && tab === 'tops' && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={head}>Size</th>
                    <th className={head}>Chest ({unit})</th>
                    <th className={head}>Waist ({unit})</th>
                    <th className={head}>Hips ({unit})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {CLOTHING_ROWS.map((r) => (
                    <tr key={r.size}>
                      <td className={`${cell} font-semibold`}>{r.size}</td>
                      <td className={cell}>{formatRange(r.chest, unit)}</td>
                      <td className={cell}>{formatRange(r.waist, unit)}</td>
                      <td className={cell}>{formatRange(r.hip, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {kind === 'clothing' && tab === 'bottoms' && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={head}>Waist size</th>
                    <th className={head}>Waist ({unit})</th>
                    <th className={head}>Hips ({unit})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {BOTTOMS_ROWS.map((r) => (
                    <tr key={r.size}>
                      <td className={`${cell} font-semibold`}>{r.size}</td>
                      <td className={cell}>{formatRange(r.waist, unit)}</td>
                      <td className={cell}>{formatRange(r.hip, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-5 space-y-2 text-sm text-gray-600">
            <p className="font-medium text-gray-900">How to measure</p>
            {kind === 'shoes' ? (
              <ul className="list-disc space-y-1 pl-5">
                <li>Stand on a sheet of paper with your heel against a wall and mark the tip of your longest toe.</li>
                <li>Measure from the wall to the mark and match it to the foot length above.</li>
                <li>Between two sizes? Go up to the bigger one.</li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                <li>Chest: around the fullest part, under your arms, keeping the tape level.</li>
                <li>Waist: around the narrowest part of your waist (or where you wear your trousers).</li>
                <li>Hips: around the fullest part of your hips.</li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
