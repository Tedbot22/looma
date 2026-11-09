import { Link } from 'react-router-dom'
import { ProductGridSkeleton } from '../components/Skeleton'
import { Heart, ImageOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCart } from '../context/CartContext'
import { useWishlist, type WishlistItem } from '../context/WishlistContext'
import { useVariantInfo } from '../hooks/useVariantInfo'
import { formatNaira } from '../lib/format'

export default function Wishlist() {
  const { items, remove, loading } = useWishlist()
  const { addItem } = useCart()
  const { infoById } = useVariantInfo(items.map((i) => i.variantId))

  function moveToCart(item: WishlistItem, stock: number) {
    addItem(
      {
        variantId: item.variantId,
        productId: item.productId,
        name: item.name,
        variantLabel: item.variantLabel,
        price: item.price,
        image: item.image,
        maxStock: stock,
      },
      1
    )
    remove(item.variantId)
    toast.success('Moved to cart')
  }

  if (loading) return <ProductGridSkeleton count={4} />

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <Heart className="mx-auto text-gray-300" size={40} />
        <h1 className="mt-3 text-2xl font-semibold">Your wishlist is empty</h1>
        <p className="mt-2 text-gray-400">Tap the heart on any item to save it for later.</p>
        <Link
          to="/shop"
          className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white"
        >
          Browse the shop
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Wishlist</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          // Unknown until loaded: don't flash "Sold out" while we're still checking.
          const info = infoById ? (infoById.get(item.variantId) ?? { stock: 0, price: item.price }) : null
          const soldOut = info !== null && info.stock <= 0
          const price = info && info.price > 0 ? info.price : item.price

          return (
            <div key={item.variantId} className="group">
              <Link
                to={`/product/${item.productId}`}
                className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-gray-100"
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className={`h-full w-full object-cover ${soldOut ? 'opacity-50 grayscale' : ''}`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <ImageOff size={32} />
                  </div>
                )}
                {soldOut && (
                  <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                    Sold out
                  </span>
                )}
              </Link>

              <div className="mt-2 space-y-0.5">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">{item.variantLabel}</p>
                <p className="text-sm font-semibold">{formatNaira(price)}</p>
                {item.autoMoved && info && (
                  <p className={`text-xs font-medium ${soldOut ? 'text-gray-500' : 'text-green-600'}`}>
                    {soldOut ? 'Moved from your cart: sold out' : 'Back in stock!'}
                  </p>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  disabled={soldOut || info === null}
                  onClick={() => info && moveToCart(item, info.stock)}
                  className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {soldOut ? 'Unavailable' : 'Move to cart'}
                </button>
                <button
                  aria-label={`Remove ${item.name} from wishlist`}
                  onClick={() => remove(item.variantId)}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-sale"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
