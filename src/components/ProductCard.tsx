import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ImageOff, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import PriceTag from './PriceTag'
import QuickAddDialog from './QuickAddDialog'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { discountPercent } from '../lib/format'
import { toCartItem, variantLabel } from '../lib/variants'
import type { ProductWithVariants } from '../lib/types'

export default function ProductCard({ product }: { product: ProductWithVariants }) {
  const { items: cartItems, addItem } = useCart()
  const wishlist = useWishlist()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Stock is tracked per variant, so a product is "sold out" only when every variant is.
  const variants = product.product_variants.filter((v) => v.is_active)
  const inStock = variants.filter((v) => v.stock > 0)
  const totalStock = inStock.reduce((sum, v) => sum + v.stock, 0)
  const soldOut = inStock.length === 0
  const lowStock = totalStock === 1

  const percentOff = discountPercent(product.price, product.compare_at_price)
  const image = product.images[0]
  const href = `/product/${product.id}`

  // Wishlist: if ANY version of this product is saved, the heart is filled.
  const savedIds = variants.filter((v) => wishlist.has(v.id)).map((v) => v.id)
  const saved = savedIds.length > 0
  const wishVariant = inStock[0] ?? variants[0]

  function toggleWishlist() {
    if (saved) {
      savedIds.forEach((id) => wishlist.remove(id))
      toast.success('Removed from wishlist')
      return
    }
    if (!wishVariant) return
    wishlist.add({
      variantId: wishVariant.id,
      productId: product.id,
      name: product.name,
      variantLabel: variantLabel(wishVariant),
      price: product.price,
      image: product.images[0] ?? null,
    })
    toast.success('Saved to wishlist')
  }

  function quickAdd() {
    if (inStock.length === 1) {
      const only = inStock[0]
      const inCart = cartItems.find((i) => i.variantId === only.id)?.quantity ?? 0
      if (inCart >= only.stock) {
        toast.message('Already in your cart.')
        return
      }
      addItem(toCartItem(product, only), 1)
      toast.success('Added to cart')
    } else {
      setPickerOpen(true) // several options: let them choose
    }
  }

  return (
    <div className="group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
        <Link to={href} className="block h-full w-full" aria-label={product.name}>
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                soldOut ? 'opacity-50' : ''
              }`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300">
              <ImageOff size={32} />
            </div>
          )}
        </Link>

        {percentOff && !soldOut && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-sale px-2 py-0.5 text-xs font-semibold text-white">
            -{percentOff}%
          </span>
        )}

        {soldOut && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
            Sold out
          </span>
        )}

        {/* Quick actions: always visible, so they work on touch screens too */}
        <button
          onClick={toggleWishlist}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className="absolute right-2 top-2 rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
        >
          <Heart size={16} className={saved ? 'fill-sale text-sale' : 'text-gray-600'} />
        </button>
      </div>

      <div className="mt-2 space-y-0.5">
        <Link to={href} className="block">
          <h3 className="truncate text-sm font-medium text-gray-800">{product.name}</h3>
        </Link>

        {/* Price on the left, add-to-cart on the same line on the right */}
        <div className="flex items-center justify-between gap-2">
          <Link to={href} className="min-w-0">
            <PriceTag price={product.price} compareAt={product.compare_at_price} />
          </Link>
          {!soldOut && (
            <button
              onClick={quickAdd}
              aria-label={`Add ${product.name} to cart`}
              className="shrink-0 rounded-full bg-brand p-2 text-white shadow-sm hover:bg-brand-light"
            >
              <ShoppingCart size={16} />
            </button>
          )}
        </div>

        {lowStock && (
          <Link to={href} className="block text-xs font-medium text-amber-600">
            Only 1 left
          </Link>
        )}
      </div>

      {pickerOpen && inStock.length > 0 && (
        <QuickAddDialog product={product} variants={inStock} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
