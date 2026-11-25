import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  clearCart,
  fetchCart,
  mergeGuestCart,
  removeCartItem,
  removeCartItems,
  saveCartItem,
  setCartItemQuantity,
} from '../api/cart'
import { queryKeys } from '../api/queryKeys'
import type { CartItem } from '../lib/types'
import { useAuth } from './AuthContext'

export type { CartItem }

interface CartContextValue {
  items: CartItem[]
  count: number
  total: number
  loading: boolean // true while we don't yet know what's in the cart
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  setQuantity: (variantId: string, quantity: number) => void
  removeItem: (variantId: string) => void
  removeItems: (variantIds: string[]) => void
  clear: () => void
}

// Guests (not logged in) keep their cart in this browser.
// Logged-in users keep it in the database, so the server can act on it (e.g. when an item sells out).
const GUEST_KEY = 'thrift-cart'

function loadGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY)
    // Older saved carts may contain entries from the removed bundle feature: keep only normal items.
    const items = raw ? (JSON.parse(raw) as (CartItem & { kind?: string })[]) : []
    return items.filter((i) => i.kind !== 'bundle')
  } catch {
    return []
  }
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const [guestItems, setGuestItems] = useState<CartItem[]>(loadGuestCart)

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(guestItems))
    } catch {
      /* storage blocked: cart still works for this session */
    }
  }, [guestItems])

  const serverCart = useQuery({
    queryKey: queryKeys.cart.forUser(userId),
    queryFn: () => fetchCart(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // Just logged in with items in the browser cart? Move them into the account.
  useEffect(() => {
    if (!userId || guestItems.length === 0) return
    let cancelled = false
    mergeGuestCart(userId, guestItems)
      .then(() => {
        if (cancelled) return
        setGuestItems([])
        queryClient.invalidateQueries({ queryKey: queryKeys.cart.forUser(userId) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, guestItems, queryClient])

  const items = userId ? (serverCart.data ?? []) : guestItems
  const loading = authLoading || (!!userId && serverCart.isLoading)

  const value = useMemo<CartContextValue>(() => {
    const queryKey = queryKeys.cart.forUser(userId)
    // Update what's on screen immediately, then write to the database in the background.
    // If the write fails, re-fetch so the screen shows the truth again.
    const setServerItems = (update: (prev: CartItem[]) => CartItem[]) =>
      queryClient.setQueryData<CartItem[]>(queryKey, (prev) => update(prev ?? []))
    const sync = (write: Promise<void>) => {
      write.catch(() => queryClient.invalidateQueries({ queryKey }))
    }

    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      loading,

      addItem: (item, quantity = 1) => {
        const existing = items.find((i) => i.variantId === item.variantId)
        // Same variant already in the cart: increase quantity, but never past stock.
        const newQty = Math.min((existing?.quantity ?? 0) + quantity, item.maxStock)
        if (newQty < 1) return
        const next: CartItem = { ...item, quantity: newQty }
        const upsert = (prev: CartItem[]) =>
          existing ? prev.map((i) => (i.variantId === item.variantId ? next : i)) : [...prev, next]

        if (!userId) return setGuestItems(upsert)
        setServerItems(upsert)
        sync(saveCartItem(userId, item.variantId, newQty))
      },

      setQuantity: (variantId, quantity) => {
        const existing = items.find((i) => i.variantId === variantId)
        if (!existing) return
        const q = Math.max(1, Math.min(quantity, existing.maxStock))
        const update = (prev: CartItem[]) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: q } : i))

        if (!userId) return setGuestItems(update)
        setServerItems(update)
        sync(setCartItemQuantity(userId, variantId, q))
      },

      removeItem: (variantId) => {
        const update = (prev: CartItem[]) => prev.filter((i) => i.variantId !== variantId)
        if (!userId) return setGuestItems(update)
        setServerItems(update)
        sync(removeCartItem(userId, variantId))
      },

      removeItems: (variantIds) => {
        const update = (prev: CartItem[]) => prev.filter((i) => !variantIds.includes(i.variantId))
        if (!userId) return setGuestItems(update)
        setServerItems(update)
        sync(removeCartItems(userId, variantIds))
      },

      clear: () => {
        if (!userId) return setGuestItems([])
        setServerItems(() => [])
        sync(clearCart(userId))
      },
    }
  }, [items, loading, userId, queryClient])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
