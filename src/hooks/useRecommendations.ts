import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getViewStats } from '../lib/recentlyViewed'
import { getSessionSeed, recommend, type Interactions } from '../lib/recommend'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import type { ProductWithVariants } from '../lib/types'

// The whole active inventory (a small store's catalogue easily fits in one request).
// The key starts with "products", so live stock changes refresh it too.
// Shared by "Recommended for you" and the product page's "You may also like", so it is fetched once.
export function useProductPool() {
  return useQuery({
    queryKey: ['products', 'pool'],
    queryFn: async (): Promise<ProductWithVariants[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as ProductWithVariants[]
    },
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
    queryKey: ['purchase-history', user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('created_at, order_items(product_variants(product_id))')
        .eq('user_id', user!.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error

      const rows = data as unknown as {
        created_at: string
        order_items: { product_variants: { product_id: string } | null }[]
      }[]
      return rows.flatMap((order) =>
        order.order_items.flatMap((line) =>
          line.product_variants?.product_id
            ? [{ productId: line.product_variants.product_id, at: new Date(order.created_at).getTime() }]
            : []
        )
      )
    },
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
