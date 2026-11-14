import { useState } from 'react'
import { ChevronRight, Ruler } from 'lucide-react'
import { resolveSizeGuide } from '../lib/sizeGuides'
import SizeGuideDialog from './SizeGuideDialog'
import type { ProductVariant, ProductWithVariants } from '../lib/types'

interface Props {
  product: ProductWithVariants
  variants: ProductVariant[] // the options to offer (sold-out ones are shown greyed out)
  selectedId: string | undefined
  onSelect: (variantId: string) => void
}

// Colour then size, the way big marketplaces show it:
//   Color: Black      [photo] [photo] [photo]
//   Size: M           Size guide >
//                     [S] [M] [L] [XL]
// Picking a colour keeps your size when that colour has it, and sold-out choices are crossed out.
export default function VariantPicker({ product, variants, selectedId, onSelect }: Props) {
  const [guideOpen, setGuideOpen] = useState(false)
  const guide = resolveSizeGuide(product)

  const active = variants.find((v) => v.id === selectedId)
  const colorOf = (v: ProductVariant) => v.color?.trim() ?? ''
  const sizeOf = (v: ProductVariant) => v.size?.trim() ?? ''

  const colors = [...new Set(variants.map(colorOf).filter(Boolean))]
  const sizes = [...new Set(variants.map(sizeOf).filter(Boolean))]

  const activeColor = active ? colorOf(active) : ''
  const activeSize = active ? sizeOf(active) : ''

  // Colours and sizes can't always be combined, so look the real variant up.
  const inColor = (c: string) => variants.filter((v) => colorOf(v) === c)
  const find = (c: string, s: string) => variants.find((v) => colorOf(v) === c && sizeOf(v) === s)

  function pickColor(c: string) {
    const options = inColor(c).filter((v) => v.stock > 0)
    // Keep the current size when this colour has it; otherwise the first size still in stock.
    const next = options.find((v) => sizeOf(v) === activeSize) ?? options[0]
    if (next) onSelect(next.id)
  }

  function pickSize(s: string) {
    const v = find(activeColor, s)
    if (v && v.stock > 0) onSelect(v.id)
  }

  // Nothing to choose between (one plain version): show nothing.
  if (colors.length === 0 && sizes.length === 0) return null

  const swatchImage = (c: string) => inColor(c).find((v) => v.image)?.image ?? null

  return (
    <div className="space-y-5">
      {colors.length > 0 && (
        <div>
          <p className="mb-2 text-sm">
            <span className="font-medium">Color:</span> <span className="text-gray-600">{activeColor}</span>
          </p>
          <div className="flex flex-wrap gap-2.5">
            {colors.map((c) => {
              const unavailable = inColor(c).every((v) => v.stock <= 0)
              const selected = c === activeColor
              const image = swatchImage(c)
              return (
                <button
                  key={c}
                  type="button"
                  disabled={unavailable}
                  aria-pressed={selected}
                  aria-label={unavailable ? `${c}, sold out` : c}
                  onClick={() => pickColor(c)}
                  className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                    selected ? 'border-brand' : 'border-gray-200 hover:border-gray-400'
                  } ${unavailable ? 'cursor-not-allowed opacity-40' : ''} ${
                    image ? 'h-16 w-14 sm:h-[4.5rem] sm:w-16' : 'min-h-10 px-3.5 py-2 text-sm font-medium'
                  } ${!image && selected ? 'bg-brand text-white' : ''}`}
                >
                  {image ? <img src={image} alt={c} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : c}
                  {unavailable && (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                      <span className="h-px w-[140%] -rotate-45 bg-gray-400" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-medium">Size:</span> <span className="text-gray-600">{activeSize}</span>
            </p>
            {guide && (
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                <Ruler size={15} /> Size guide <ChevronRight size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const v = find(activeColor, s)
              const out = !v || v.stock <= 0
              const selected = s === activeSize
              return (
                <button
                  key={s}
                  type="button"
                  disabled={out}
                  aria-pressed={selected}
                  onClick={() => pickSize(s)}
                  className={`min-h-10 min-w-12 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                    out
                      ? 'cursor-not-allowed border-gray-100 text-gray-300 line-through'
                      : selected
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 hover:border-brand'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {guideOpen && guide && <SizeGuideDialog kind={guide} productName={product.name} onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
