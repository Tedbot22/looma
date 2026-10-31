import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { VARIANT_FIELDS, describeVariant, type VariantEmbed } from '../lib/variants'
import { useAuth } from './AuthContext'

export interface CartItem {
  variantId: string
  productId: string
  name: string
  variantLabel: string
  price: number
  image: string | null
  quantity: number
  maxStock: number // stock when last loaded: a UX hint only. The database is the real gatekeeper.
}

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
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

async function fetchCart(userId: string): Promise<CartItem[]> {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`variant_id, quantity, product_variants(${VARIANT_FIELDS})`)
    .eq('user_id', userId)
    .not('variant_id', 'is', null)
    .order('created_at')
  if (error) throw error

  const rows = data as unknown as { quantity: number; product_variants: VariantEmbed | null }[]
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
        quantity: row.quantity,
        maxStock: d.stock,
      },
    ]
  })
}

// When a guest logs in, their browser cart is folded into their account cart.
// "max" (not "sum") makes this safe to run twice without doubling quantities.
async function mergeGuestCart(userId: string, guest: CartItem[]) {
  const { data: existing, error } = await supabase
    .from('cart_items')
    .select('variant_id, quantity')
    .eq('user_id', userId)
  if (error) throw error

  const have = new Map((existing ?? []).map((r) => [r.variant_id as string, r.quantity as number]))
  const rows = guest
    .map((g) => ({
      user_id: userId,
      variant_id: g.variantId,
      quantity: Math.min(g.maxStock, Math.max(have.get(g.variantId) ?? 0, g.quantity)),
    }))
    .filter((r) => r.quantity > 0)

  // One bad row (say, an item since deleted) must not block the rest.
  await Promise.allSettled(
    rows.map((r) => supabase.from('cart_items').upsert(r, { onConflict: 'user_id,variant_id' }))
  )
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const queryKey = ['cart', userId]

  const [guestItems, setGuestItems] = useState<CartItem[]>(loadGuestCart)

  useEffect(() => {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(guestItems))
    } catch {
      /* storage blocked: cart still works for this session */
    }
  }, [guestItems])

  const serverCart = useQuery({
    queryKey,
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
        queryClient.invalidateQueries({ queryKey: ['cart', userId] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, guestItems, queryClient])

  const items = userId ? (serverCart.data ?? []) : guestItems
  const loading = authLoading || (!!userId && serverCart.isLoading)

  const value = useMemo<CartContextValue>(() => {
    // Update what's on screen immediately, then write to the database in the background.
    // If the write fails, re-fetch so the screen shows the truth again.
    const setServerItems = (update: (prev: CartItem[]) => CartItem[]) =>
      queryClient.setQueryData<CartItem[]>(['cart', userId], (prev) => update(prev ?? []))
    const syncFailed = () => queryClient.invalidateQueries({ queryKey: ['cart', userId] })
    const run = (op: PromiseLike<{ error: unknown }>) => {
      op.then(({ error }) => {
        if (error) syncFailed()
      })
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
        run(
          supabase
            .from('cart_items')
            .upsert({ user_id: userId, variant_id: item.variantId, quantity: newQty }, { onConflict: 'user_id,variant_id' })
        )
      },

      setQuantity: (variantId, quantity) => {
        const existing = items.find((i) => i.variantId === variantId)
        if (!existing) return
        const q = Math.max(1, Math.min(quantity, existing.maxStock))
        const update = (prev: CartItem[]) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: q } : i))

        if (!userId) return setGuestItems(update)
        setServerItems(update)
        run(supabase.from('cart_items').update({ quantity: q }).eq('user_id', userId).eq('variant_id', variantId))
      },

      removeItem: (variantId) => {
        const update = (prev: CartItem[]) => prev.filter((i) => i.variantId !== variantId)
        if (!userId) return setGuestItems(update)
        setServerItems(update)
        run(supabase.from('cart_items').delete().eq('user_id', userId).eq('variant_id', variantId))
      },

      removeItems: (variantIds) => {
        const update = (prev: CartItem[]) => prev.filter((i) => !variantIds.includes(i.variantId))
        if (!userId) return setGuestItems(update)
        setServerItems(update)
        run(supabase.from('cart_items').delete().eq('user_id', userId).in('variant_id', variantIds))
      },

      clear: () => {
        if (!userId) return setGuestItems([])
        setServerItems(() => [])
        run(supabase.from('cart_items').delete().eq('user_id', userId))
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
