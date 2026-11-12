import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '../context/CartContext'
import { toCartItem, variantLabel } from '../lib/variants'
import PriceTag from './PriceTag'
import type { ProductVariant, ProductWithVariants } from '../lib/types'

interface Props {
  product: ProductWithVariants
  variants: ProductVariant[] // only the ones in stock (the parent guarantees at least one)
  onClose: () => void
}

// A small sheet for picking a color/size when adding straight from the shop page.
export default function QuickAddDialog({ product, variants, onClose }: Props) {
  const { addItem } = useCart()
  const [selectedId, setSelectedId] = useState(variants[0].id)
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]

  // Close with the Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function add() {
    addItem(toCartItem(product, selected), 1)
    toast.success('Added to cart')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Choose an option for ${product.name}`}
        onClick={(e) => e.stopPropagation()}
        className="m-auto w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{product.name}</p>
            <PriceTag price={product.price} compareAt={product.compare_at_price} />
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <p className="mb-2 mt-4 text-sm font-medium">Choose an option</p>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                v.id === selected.id ? 'border-brand bg-brand text-white' : 'border-gray-200 hover:border-brand'
              }`}
            >
              {variantLabel(v)}
            </button>
          ))}
        </div>
        {selected.stock <= 3 && (
          <p className="mt-2 text-sm font-medium text-amber-600">
            {selected.stock === 1 ? 'Only 1 left' : `Only ${selected.stock} left`}
          </p>
        )}

        <button
          onClick={add}
          className="mt-5 w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light"
        >
          Add to cart
        </button>
      </div>
    </div>
  )
}
