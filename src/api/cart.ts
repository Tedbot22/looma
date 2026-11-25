// A logged-in customer's cart, kept in the database so the server can act on it (for example when an
// item sells out). Guests keep theirs in the browser, which needs no api.

import { supabase } from '../lib/supabase'
import type { CartItem } from '../lib/types'
import { VARIANT_FIELDS, describeVariant, type VariantEmbed } from '../lib/variants'
import { run, unwrap } from './db'

const ON_CONFLICT = { onConflict: 'user_id,variant_id' }

// The cart, oldest item first. Items whose product has since been hidden or removed are left out.
export async function fetchCart(userId: string): Promise<CartItem[]> {
  const rows = await unwrap<unknown>(
    supabase
      .from('cart_items')
      .select(`variant_id, quantity, product_variants(${VARIANT_FIELDS})`)
      .eq('user_id', userId)
      .not('variant_id', 'is', null)
      .order('created_at')
  ) as { quantity: number; product_variants: VariantEmbed | null }[]

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

// Puts an item in the cart at this quantity (adding it, or replacing the quantity if it is already there).
export const saveCartItem = (userId: string, variantId: string, quantity: number) =>
  run(supabase.from('cart_items').upsert({ user_id: userId, variant_id: variantId, quantity }, ON_CONFLICT))

export const setCartItemQuantity = (userId: string, variantId: string, quantity: number) =>
  run(supabase.from('cart_items').update({ quantity }).eq('user_id', userId).eq('variant_id', variantId))

export const removeCartItem = (userId: string, variantId: string) =>
  run(supabase.from('cart_items').delete().eq('user_id', userId).eq('variant_id', variantId))

export const removeCartItems = (userId: string, variantIds: string[]) =>
  run(supabase.from('cart_items').delete().eq('user_id', userId).in('variant_id', variantIds))

export const clearCart = (userId: string) => run(supabase.from('cart_items').delete().eq('user_id', userId))

// When a guest logs in, their browser cart is folded into their account cart.
// "max" (not "sum") makes this safe to run twice without doubling quantities, and nothing goes past stock.
export async function mergeGuestCart(userId: string, guest: CartItem[]): Promise<void> {
  const existing = await unwrap<{ variant_id: string; quantity: number }[]>(
    supabase.from('cart_items').select('variant_id, quantity').eq('user_id', userId)
  )

  const have = new Map((existing ?? []).map((r) => [r.variant_id, r.quantity]))
  const rows = guest
    .map((g) => ({
      user_id: userId,
      variant_id: g.variantId,
      quantity: Math.min(g.maxStock, Math.max(have.get(g.variantId) ?? 0, g.quantity)),
    }))
    .filter((r) => r.quantity > 0)

  // One bad row (say, an item since deleted) must not block the rest.
  await Promise.allSettled(rows.map((r) => supabase.from('cart_items').upsert(r, ON_CONFLICT)))
}
