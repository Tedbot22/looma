import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ImageOff, Minus, Plus, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import PriceTag from './PriceTag'
import QuickAddDialog from './QuickAddDialog'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { discountPercent } from '../lib/format'
import { toCartItem, variantLabel } from '../lib/variants'
import type { ProductWithVariants } from '../lib/types'

export default function ProductCard({ product }: { product: ProductWithVariants }) {
  const { items: cartItems, addItem, setQuantity, removeItem } = useCart()
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

  // A product with a single option can be added (and its quantity changed) right on the card.
  // With several options (sizes, colours) the button opens a small picker instead.
  const single = inStock.length === 1 ? inStock[0] : null
  const cartQty = single ? (cartItems.find((i) => i.variantId === single.id)?.quantity ?? 0) : 0

  function quickAdd() {
    if (single) {
      addItem(toCartItem(product, single), 1)
      toast.success('Added to cart')
    } else {
      setPickerOpen(true)
    }
  }

  function decrease() {
    if (!single) return
    if (cartQty <= 1) removeItem(single.id)
    else setQuantity(single.id, cartQty - 1)
  }

  function increase() {
    if (!single) return
    if (cartQty >= single.stock) {
      toast.message(`Only ${single.stock} available.`)
      return
    }
    setQuantity(single.id, cartQty + 1)
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
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-sale px-1.5 py-0.5 text-[11px] font-semibold text-white sm:left-2 sm:top-2 sm:px-2 sm:text-xs">
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
          className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1.5 shadow-sm hover:bg-white sm:right-2 sm:top-2 sm:p-2"
        >
          <Heart size={16} className={saved ? 'fill-sale text-sale' : 'text-gray-600'} />
        </button>
      </div>

      <div className="mt-2 space-y-0.5">
        <Link to={href} className="block">
          <h3 className="truncate text-[13px] font-medium text-gray-800 sm:text-sm">{product.name}</h3>
        </Link>

        <Link to={href} className="block">
          <PriceTag price={product.price} compareAt={product.compare_at_price} />
        </Link>

        {lowStock && (
          <Link to={href} className="block text-xs font-medium text-amber-600">
            Only 1 left
          </Link>
        )}

        {/* Full-width add-to-cart, always visible. Once the item is in the cart it turns into a - 1 + stepper:
            only the - and + buttons are brand coloured, the count in the middle has no background. */}
        {!soldOut && (
          <div className="pt-2">
            {single && cartQty > 0 ? (
              <div
                role="group"
                aria-label={`${product.name} quantity in cart`}
                className="pop-in flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={decrease}
                  aria-label={cartQty <= 1 ? `Remove ${product.name} from cart` : 'One less'}
                  className="rounded-md bg-brand p-2.5 text-white transition-transform hover:bg-brand-light active:scale-90 sm:px-3"
                >
                  <Minus size={16} />
                </button>
                <span className="text-sm font-bold tabular-nums text-gray-900" aria-live="polite">
                  <span key={cartQty} className="count-bump">
                    {cartQty}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={increase}
                  aria-label="One more"
                  disabled={cartQty >= single.stock}
                  className="rounded-md bg-brand p-2.5 text-white transition-transform hover:bg-brand-light active:scale-90 disabled:opacity-40 sm:px-3"
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={quickAdd}
                aria-label={`Add ${product.name} to cart`}
                className="pop-in flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-2 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white transition-transform hover:bg-brand-light active:scale-[0.97] sm:gap-2 sm:px-3 sm:text-xs"
              >
                <ShoppingCart size={15} className="shrink-0" /> Add to cart
              </button>
            )}
          </div>
        )}
      </div>

      {pickerOpen && inStock.length > 0 && (
        <QuickAddDialog product={product} variants={inStock} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
