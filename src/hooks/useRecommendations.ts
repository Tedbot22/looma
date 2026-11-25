import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPurchaseHistory } from '../api/orders'
import { getViewStats } from '../lib/recentlyViewed'
import { getSessionSeed, recommend, type Interactions } from '../lib/recommend'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { fetchProductPool } from '../api/catalog'
import { queryKeys } from '../api/queryKeys'

// The whole active inventory (a small store's catalogue easily fits in one request).
// The key starts with "products", so live stock changes refresh it too.
// Shared by "Recommended for you" and the product page's "You may also like", so it is fetched once.
export function useProductPool() {
  return useQuery({
    queryKey: queryKeys.products.pool(),
    queryFn: () => fetchProductPool(),
    staleTime: 5 * 60_000,
  })
}

// Gathers what this customer has done (views on this device, wishlist, cart and, when logged in, past
// purchases) in the shape the recommendation algorithm wants. Used by both "Recommended for you" and the
// product page's "You may also like".
export function useCustomerInteractions(): Interactions {
  const { user } = useAuth()
  const { items: wishlist } = useWishlist()
  const { items: cart } = useCart()

  // Read once when the page opens: the picks shouldn't shuffle while someone is browsing the page.
  const [views] = useState(getViewStats)

  // What this customer has actually bought (cancelled orders don't count).
  const purchases = useQuery({
    queryKey: queryKeys.orders.purchaseHistory(user?.id),
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: () => fetchPurchaseHistory(user!.id),
  })

  return useMemo(
    () => ({
      views,
      wishlistProductIds: wishlist.map((w) => w.productId),
      cartProductIds: cart.map((c) => c.productId),
      purchases: purchases.data ?? [],
    }),
    [views, wishlist, cart, purchases.data]
  )
}

// "Recommended for you": asks the recommend() algorithm for items similar to what this customer likes.
export function useRecommendations(limit: number) {
  const interactions = useCustomerInteractions()
  const [seed] = useState(getSessionSeed)
  const pool = useProductPool()

  const result = useMemo(
    () => (pool.data ? recommend(pool.data, interactions, { limit, seed }) : null),
    [pool.data, interactions, limit, seed]
  )

  return {
    items: result?.items ?? [],
    personalised: result?.personalised ?? 0,
    isLoading: pool.isLoading,
    error: pool.error as Error | null,
  }
}
