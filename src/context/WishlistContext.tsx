import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWishlist, mergeGuestWishlist, removeWishlistItem, saveWishlistItem } from '../api/wishlist'
import { queryKeys } from '../api/queryKeys'
import type { WishlistItem } from '../lib/types'
import { useAuth } from './AuthContext'

export type { WishlistItem }

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
    queryKey: queryKeys.wishlist.forUser(userId),
    queryFn: () => fetchWishlist(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // Just logged in? Fold the browser wishlist into the account (duplicates ignored).
  useEffect(() => {
    if (!userId || guestItems.length === 0) return
    let cancelled = false
    mergeGuestWishlist(userId, guestItems).then(() => {
      if (cancelled) return
      setGuestItems([])
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.forUser(userId) })
    })
    return () => {
      cancelled = true
    }
  }, [userId, guestItems, queryClient])

  const items = userId ? (serverWishlist.data ?? []) : guestItems
  const loading = authLoading || (!!userId && serverWishlist.isLoading)

  const value = useMemo<WishlistContextValue>(() => {
    const queryKey = queryKeys.wishlist.forUser(userId)
    const setServerItems = (update: (prev: WishlistItem[]) => WishlistItem[]) =>
      queryClient.setQueryData<WishlistItem[]>(queryKey, (prev) => update(prev ?? []))
    const sync = (write: Promise<void>) => {
      write.catch(() => queryClient.invalidateQueries({ queryKey }))
    }

    const has = (variantId: string) => items.some((i) => i.variantId === variantId)

    const add = (item: WishlistItem) => {
      if (has(item.variantId)) return
      if (!userId) return setGuestItems((prev) => [item, ...prev])
      setServerItems((prev) => [item, ...prev])
      sync(saveWishlistItem(userId, item.variantId))
    }

    const remove = (variantId: string) => {
      const update = (prev: WishlistItem[]) => prev.filter((i) => i.variantId !== variantId)
      if (!userId) return setGuestItems(update)
      setServerItems(update)
      sync(removeWishlistItem(userId, variantId))
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
