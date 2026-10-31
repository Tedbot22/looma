import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { VARIANT_FIELDS, describeVariant, type VariantEmbed } from '../lib/variants'
import { useAuth } from './AuthContext'

export interface WishlistItem {
  variantId: string
  productId: string
  name: string
  variantLabel: string
  price: number
  image: string | null
  autoMoved?: boolean // true when the system moved it here from the cart because it sold out
}

interface WishlistContextValue {
  items: WishlistItem[]
  loading: boolean
  has: (variantId: string) => boolean
  add: (item: WishlistItem) => void
  remove: (variantId: string) => void
  toggle: (item: WishlistItem) => void
}

// Same approach as the cart: guests use this browser, logged-in users use the database.
const GUEST_KEY = 'thrift-wishlist'

function loadGuestWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    return raw ? (JSON.parse(raw) as WishlistItem[]) : []
  } catch {
    return []
  }
}

async function fetchWishlist(userId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select(`auto_moved_at, product_variants(${VARIANT_FIELDS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = data as unknown as { auto_moved_at: string | null; product_variants: VariantEmbed | null }[]
  return rows.flatMap((row) => {
    const d = describeVariant(row.product_variants)
    if (!d) return []
    return [
      {
        variantId: d.variantId,
        productId: d.productId,
        name: d.name,
        variantLabel: d.variantLabel,
        price: d.price,
        image: d.image,
        autoMoved: !!row.auto_moved_at,
      },
    ]
  })
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()

  const [guestItems, setGuestItems] = useState<WishlistItem[]>(loadGuestWishlist)

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(guestItems))
    } catch {
      /* storage blocked */
    }
  }, [guestItems])

  const serverWishlist = useQuery({
    queryKey: ['wishlist', userId],
    queryFn: () => fetchWishlist(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // Just logged in? Fold the browser wishlist into the account (duplicates ignored).
  useEffect(() => {
    if (!userId || guestItems.length === 0) return
    let cancelled = false
    Promise.allSettled(
      guestItems.map((g) =>
        supabase
          .from('wishlist_items')
          .upsert({ user_id: userId, variant_id: g.variantId }, { onConflict: 'user_id,variant_id', ignoreDuplicates: true })
      )
    ).then(() => {
      if (cancelled) return
      setGuestItems([])
      queryClient.invalidateQueries({ queryKey: ['wishlist', userId] })
    })
    return () => {
      cancelled = true
    }
  }, [userId, guestItems, queryClient])

  const items = userId ? (serverWishlist.data ?? []) : guestItems
  const loading = authLoading || (!!userId && serverWishlist.isLoading)

  const value = useMemo<WishlistContextValue>(() => {
    const setServerItems = (update: (prev: WishlistItem[]) => WishlistItem[]) =>
      queryClient.setQueryData<WishlistItem[]>(['wishlist', userId], (prev) => update(prev ?? []))
    const run = (op: PromiseLike<{ error: unknown }>) => {
      op.then(({ error }) => {
        if (error) queryClient.invalidateQueries({ queryKey: ['wishlist', userId] })
      })
    }

    const has = (variantId: string) => items.some((i) => i.variantId === variantId)

    const add = (item: WishlistItem) => {
      if (has(item.variantId)) return
      if (!userId) return setGuestItems((prev) => [item, ...prev])
      setServerItems((prev) => [item, ...prev])
      run(
        supabase
          .from('wishlist_items')
          .upsert({ user_id: userId, variant_id: item.variantId }, { onConflict: 'user_id,variant_id', ignoreDuplicates: true })
      )
    }

    const remove = (variantId: string) => {
      const update = (prev: WishlistItem[]) => prev.filter((i) => i.variantId !== variantId)
      if (!userId) return setGuestItems(update)
      setServerItems(update)
      run(supabase.from('wishlist_items').delete().eq('user_id', userId).eq('variant_id', variantId))
    }

    return {
      items,
      loading,
      has,
      add,
      remove,
      toggle: (item) => (has(item.variantId) ? remove(item.variantId) : add(item)),
    }
  }, [items, loading, userId, queryClient])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>')
  return ctx
}
