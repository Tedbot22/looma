import { Link, useNavigate } from 'react-router-dom'
import { Heart, ImageOff, Minus, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../context/WishlistContext'
import { useCartLines, type CartLine } from '../hooks/useCartLines'
import { formatNaira } from '../lib/format'

export default function Cart() {
  const { setQuantity, removeItem, loading } = useCart()
  const wishlist = useWishlist()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lines, orderable, total } = useCartLines()

  const soldOutCount = lines.length - orderable.length

  function moveToWishlist(line: CartLine) {
    wishlist.add({
      variantId: line.variantId,
      productId: line.productId,
      name: line.name,
      variantLabel: line.variantLabel,
      price: line.price,
      image: line.image,
    })
    removeItem(line.variantId)
    toast.success('Moved to wishlist')
  }

  function handleCheckout() {
    // Logged-out users go to login first, then come straight back to checkout.
    navigate(user ? '/checkout' : '/login?next=/checkout')
  }

  if (loading) return <p className="py-20 text-center text-gray-400">Loading your cart…</p>

  if (lines.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-gray-400">Find something you love and it'll show up here.</p>
        <Link
          to="/shop"
          className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white"
        >
          Start shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>

      {soldOutCount > 0 && orderable.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {soldOutCount === 1 ? 'One item is' : `${soldOutCount} items are`} sold out. You can still
          check out the rest, or save the sold-out {soldOutCount === 1 ? 'item' : 'items'} to your
          wishlist.
        </p>
      )}

      <ul className="divide-y divide-gray-100">
        {lines.map((line) => {
          const soldOut = line.status === 'sold_out'

          return (
            <li key={line.variantId} className="flex gap-4 py-4">
              <Link
                to={`/product/${line.productId}`}
                className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100"
              >
                {line.image ? (
                  <img
                    src={line.image}
                    alt={line.name}
                    className={`h-full w-full object-cover ${soldOut ? 'opacity-50 grayscale' : ''}`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <ImageOff size={20} />
                  </div>
                )}
              </Link>

              <div className="flex flex-1 flex-col justify-between">
                <div className={soldOut ? 'text-gray-400' : ''}>
                  <p className="font-medium">{line.name}</p>
                  <p className="text-sm text-gray-500">{line.variantLabel}</p>
                  {soldOut ? (
                    <span className="mt-1 inline-block rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                      Sold out
                    </span>
                  ) : (
                    <p className="text-sm font-semibold">{formatNaira(line.price)}</p>
                  )}
                  {line.status === 'limited' && (
                    <p className="text-xs font-medium text-amber-600">
                      Only {line.liveStock} left. Quantity adjusted.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {soldOut ? (
                    <button
                      onClick={() => moveToWishlist(line)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:border-brand"
                    >
                      <Heart size={14} /> Move to wishlist
                    </button>
                  ) : (
                    <div className="flex items-center rounded-lg border border-gray-200">
                      <button
                        aria-label="Decrease quantity"
                        disabled={line.effectiveQty <= 1}
                        onClick={() => setQuantity(line.variantId, line.effectiveQty - 1)}
                        className="p-1.5 hover:text-brand disabled:text-gray-300"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm">{line.effectiveQty}</span>
                      <button
                        aria-label="Increase quantity"
                        disabled={line.effectiveQty >= line.liveStock}
                        onClick={() => setQuantity(line.variantId, line.effectiveQty + 1)}
                        className="p-1.5 hover:text-brand disabled:text-gray-300"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}

                  <button
                    aria-label={`Remove ${line.name}`}
                    onClick={() => removeItem(line.variantId)}
                    className="p-1.5 text-gray-400 hover:text-sale"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 rounded-xl bg-gray-50 p-5">
        <div className="flex justify-between text-lg font-semibold">
          <span>Subtotal</span>
          <span>{formatNaira(total)}</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {soldOutCount > 0
            ? 'Sold-out items are not included.'
            : 'Delivery details are added at checkout.'}
        </p>
        <button
          onClick={handleCheckout}
          disabled={orderable.length === 0}
          className="mt-4 w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:bg-gray-200 disabled:text-gray-400"
        >
          {orderable.length === 0 ? 'Nothing available to check out' : 'Checkout'}
        </button>
      </div>
    </div>
  )
}
