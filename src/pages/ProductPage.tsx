import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, MessageCircle, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { discountPercent } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'
import { addRecentId } from '../lib/recentlyViewed'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import PriceTag from '../components/PriceTag'
import ImageCarousel from '../components/ImageCarousel'
import type { ProductVariant, ProductWithVariants } from '../lib/types'

function variantLabel(v: ProductVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || 'Standard'
}

export default function ProductPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const wishlist = useWishlist()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['product', productId],
    queryFn: async (): Promise<ProductWithVariants | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('id', productId!)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data as ProductWithVariants | null
    },
    enabled: !!productId,
  })

  // Remember this product for the "Recently viewed" page.
  const viewedId = product?.id
  useEffect(() => {
    if (viewedId) addRecentId(viewedId)
  }, [viewedId])

  if (isLoading) return <p className="py-20 text-center text-gray-400">Loading…</p>
  if (error) return <p className="py-20 text-center text-red-600">Couldn't load this item.</p>
  if (!product) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">This item isn't available anymore.</p>
        <Link to="/shop" className="mt-3 inline-block font-medium text-brand underline">
          Back to shop
        </Link>
      </div>
    )
  }

  const variants = product.product_variants.filter((v) => v.is_active)

  // The chosen variant, or the first one still in stock. Derived, so no extra effect needed.
  const active =
    variants.find((v) => v.id === selectedId && v.stock > 0) ?? variants.find((v) => v.stock > 0)
  const soldOut = !active

  const percentOff = discountPercent(product.price, product.compare_at_price)

  const cartItem = active && {
    variantId: active.id,
    productId: product.id,
    name: product.name,
    variantLabel: variantLabel(active),
    price: product.price,
    image: product.images[0] ?? null,
    maxStock: active.stock,
  }

  // Wishlist works even when everything is sold out: we save the first variant.
  const wishVariant = active ?? variants[0]
  const saved = !!wishVariant && wishlist.has(wishVariant.id)

  function handleWishlist() {
    if (!wishVariant || !product) return
    wishlist.toggle({
      variantId: wishVariant.id,
      productId: product.id,
      name: product.name,
      variantLabel: variantLabel(wishVariant),
      price: product.price,
      image: product.images[0] ?? null,
    })
    toast.success(saved ? 'Removed from wishlist' : 'Saved to wishlist')
  }

  function handleAddToCart() {
    if (!cartItem) return
    addItem(cartItem, quantity)
    toast.success('Added to cart')
  }

  function handleBuyNow() {
    if (!cartItem) return
    addItem(cartItem, quantity)
    navigate('/cart') // becomes /checkout in the checkout batch
  }

  const contactMessage =
    `Hi! I'm interested in "${product.name}"` +
    (active ? ` (${variantLabel(active)})` : '') +
    `\nProduct ID: ${product.id}\n${window.location.href}`

  return (
    <div>
      <Link to="/shop" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Back to shop
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Gallery: a swipeable carousel */}
        <ImageCarousel images={product.images} alt={product.name}>
          {percentOff && !soldOut && (
            <span className="absolute left-3 top-3 rounded-full bg-sale px-3 py-1 text-sm font-semibold text-white">
              -{percentOff}%
            </span>
          )}
        </ImageCarousel>

        {/* Details */}
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <button
              onClick={handleWishlist}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              className="shrink-0 rounded-full border border-gray-200 p-2 hover:border-brand"
            >
              <Heart size={20} className={saved ? 'fill-sale text-sale' : 'text-gray-500'} />
            </button>
          </div>
          <PriceTag price={product.price} compareAt={product.compare_at_price} size="lg" />

          {product.description && <p className="text-gray-600">{product.description}</p>}

          {/* Variant picker: out-of-stock options are visible but disabled */}
          {variants.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Options</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const out = v.stock === 0
                  const selected = v.id === active?.id
                  return (
                    <button
                      key={v.id}
                      disabled={out}
                      onClick={() => {
                        setSelectedId(v.id)
                        setQuantity(1)
                      }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        out
                          ? 'cursor-not-allowed border-gray-100 text-gray-300 line-through'
                          : selected
                            ? 'border-brand bg-brand text-white'
                            : 'border-gray-200 hover:border-brand'
                      }`}
                    >
                      {variantLabel(v)}
                    </button>
                  )
                })}
              </div>
              {active && active.stock <= 3 && (
                <p className="mt-2 text-sm font-medium text-amber-600">
                  {active.stock === 1 ? 'Only 1 left' : `Only ${active.stock} left`}
                </p>
              )}
            </div>
          )}

          {/* Quantity */}
          {active && active.stock > 1 && (
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">Quantity</p>
              <div className="flex items-center rounded-lg border border-gray-200">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2 hover:text-brand"
                >
                  <Minus size={16} />
                </button>
                <span className="w-8 text-center text-sm">{Math.min(quantity, active.stock)}</span>
                <button
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(active.stock, q + 1))}
                  className="p-2 hover:text-brand"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {soldOut ? (
              <p className="rounded-lg bg-gray-100 py-3 text-center font-semibold text-gray-500">
                Sold out
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleAddToCart}
                  className="rounded-lg border border-brand py-3 font-semibold text-brand hover:bg-gray-50"
                >
                  Add to cart
                </button>
                <button
                  onClick={handleBuyNow}
                  className="rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light"
                >
                  Buy now
                </button>
              </div>
            )}

            <a
              href={whatsappLink(contactMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 font-medium text-gray-700 hover:border-brand"
            >
              <MessageCircle size={18} /> Contact seller
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
