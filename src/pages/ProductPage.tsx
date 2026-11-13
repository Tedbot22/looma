import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, MessageCircle, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { discountPercent } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'
import { absoluteUrl, pageTitle, tidy, useSeo } from '../lib/seo'
import { STORE_NAME } from '../config'
import { addRecentId } from '../lib/recentlyViewed'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import PriceTag from '../components/PriceTag'
import ImageCarousel from '../components/ImageCarousel'
import ProductDetails from '../components/ProductDetails'
import YouMayAlsoLike from '../components/YouMayAlsoLike'
import StoreReviewsLink from '../components/StoreReviewsLink'
import ProductReviews from '../components/ProductReviews'
import { ProductPageSkeleton } from '../components/Skeleton'
import type { ProductVariant, ProductWithVariants } from '../lib/types'

function variantLabel(v: ProductVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || 'Standard'
}

export default function ProductPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { items: cartItems, addItem, setQuantity: setCartQuantity, removeItem } = useCart()
  const wishlist = useWishlist()

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['product', productId],
    queryFn: async (): Promise<ProductWithVariants | null> => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), product_variants(*)')
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

  // Opening another product from the "You may also like" row: start at the top with a fresh selection.
  useEffect(() => {
    window.scrollTo({ top: 0 })
    setSelectedId(null)
  }, [productId])

  // What Google and link previews (WhatsApp, Facebook) show for this item, plus Product data so Google can
  // show the price and availability. Hidden items stay out of search results.
  useSeo(
    isLoading || error
      ? null
      : !product
        ? { title: pageTitle('Item unavailable'), noindex: true }
        : {
            title: pageTitle(product.name),
            description:
              tidy(product.description) ||
              `Buy ${product.name} at ${STORE_NAME}. Thrift fashion in Nigeria, delivered to you.`,
            path: `/product/${product.id}`,
            image: product.images[0],
            ogType: 'product',
            jsonLd: {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              description: tidy(product.description, 500) || product.name,
              sku: product.id,
              image: product.images.map(absoluteUrl),
              ...(product.categories?.name ? { category: product.categories.name } : {}),
              offers: {
                '@type': 'Offer',
                url: absoluteUrl(`/product/${product.id}`),
                priceCurrency: 'NGN',
                price: product.price,
                itemCondition: 'https://schema.org/UsedCondition',
                availability: product.product_variants.some((v) => v.is_active && v.stock > 0)
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
                seller: { '@type': 'Organization', name: STORE_NAME },
              },
            },
          }
  )

  if (isLoading) return <ProductPageSkeleton />
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

  // How many of the chosen option are already in the cart.
  const inCart = active ? (cartItems.find((i) => i.variantId === active.id)?.quantity ?? 0) : 0

  function handleAddToCart() {
    if (!cartItem) return
    addItem(cartItem, 1)
    toast.success('Added to cart')
  }

  function handleLess() {
    if (!active) return
    if (inCart <= 1) removeItem(active.id)
    else setCartQuantity(active.id, inCart - 1)
  }

  function handleMore() {
    if (!active) return
    if (inCart >= active.stock) {
      toast.message(`Only ${active.stock} available.`)
      return
    }
    setCartQuantity(active.id, inCart + 1)
  }

  const contactMessage =
    `Hi! I'm interested in "${product.name}"` +
    (active ? ` (${variantLabel(active)})` : '') +
    `\nProduct ID: ${product.id}\n${window.location.href}`

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/shop" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
        <ArrowLeft size={16} /> Back to shop
      </Link>

      <div className="grid gap-5 sm:gap-8 md:grid-cols-2">
        {/* Gallery: a swipeable carousel */}
        <ImageCarousel images={product.images} alt={product.name}>
          {percentOff && !soldOut && (
            <span className="absolute left-3 top-3 rounded-full bg-sale px-3 py-1 text-sm font-semibold text-white">
              -{percentOff}%
            </span>
          )}
        </ImageCarousel>

        {/* Details */}
        <div className="space-y-4 sm:space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold sm:text-2xl">{product.name}</h1>
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
                      onClick={() => setSelectedId(v.id)}
                      className={`min-h-10 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors sm:px-4 ${
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

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {soldOut ? (
              <p className="rounded-lg bg-gray-100 py-3 text-center font-semibold text-gray-500">
                Sold out
              </p>
            ) : (
              /* One row. Not in the cart: the button is full width and says "Add to cart". Once the item is
                 added, the - N + control slides in on the left and the same button narrows to "Go to cart". */
              <div className="flex items-stretch">
                <div
                  inert={inCart === 0}
                  aria-hidden={inCart === 0}
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    inCart > 0 ? 'mr-3 max-w-44 opacity-100' : 'mr-0 max-w-0 opacity-0'
                  }`}
                >
                  <div role="group" aria-label="Quantity in cart" className="flex h-full shrink-0 items-center rounded-lg border border-gray-300">
                    <button
                      onClick={handleLess}
                      aria-label={inCart <= 1 ? 'Remove from cart' : 'One less'}
                      className="p-3 text-brand transition-transform hover:bg-brand/10 active:scale-90 sm:p-3.5"
                    >
                      {inCart <= 1 ? <Trash2 size={18} /> : <Minus size={18} />}
                    </button>
                    <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">
                      <span key={inCart} className="count-bump">
                        {inCart}
                      </span>
                    </span>
                    <button
                      onClick={handleMore}
                      aria-label="One more"
                      disabled={inCart >= active.stock}
                      className="p-3 text-brand transition-transform hover:bg-brand/10 active:scale-90 disabled:opacity-30 sm:p-3.5"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={inCart > 0 ? () => navigate('/cart') : handleAddToCart}
                  className="min-w-0 flex-1 rounded-lg bg-brand px-3 py-3 text-sm font-semibold text-white transition-transform hover:bg-brand-light active:scale-[0.98] sm:py-3.5 sm:text-base"
                >
                  <span key={inCart > 0 ? 'go' : 'add'} className="pop-in flex items-center justify-center gap-2">
                    <ShoppingCart size={18} /> {inCart > 0 ? 'Go to cart' : 'Add to cart'}
                  </span>
                </button>
              </div>
            )}

            <a
              href={whatsappLink(contactMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:border-brand sm:text-base"
            >
              <MessageCircle size={18} /> Contact seller
            </a>
          </div>
        </div>
      </div>

      <ProductDetails product={product} />

      <ProductReviews productId={product.id} />

      <StoreReviewsLink />

      <YouMayAlsoLike product={product} />
    </div>
  )
}
