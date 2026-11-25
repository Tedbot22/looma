// A logged-in customer's wishlist, kept in the database. Guests keep theirs in the browser.

import { supabase } from '../lib/supabase'
import type { WishlistItem } from '../lib/types'
import { VARIANT_FIELDS, describeVariant, type VariantEmbed } from '../lib/variants'
import { run, unwrap } from './db'

// Saving an item that is already saved is fine and changes nothing.
const SAVE_ONCE = { onConflict: 'user_id,variant_id', ignoreDuplicates: true }

// The wishlist, newest first. Items whose product has since been hidden or removed are left out.
export async function fetchWishlist(userId: string): Promise<WishlistItem[]> {
  const rows = await unwrap<unknown>(
    supabase
      .from('wishlist_items')
      .select(`auto_moved_at, product_variants(${VARIANT_FIELDS})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  ) as { auto_moved_at: string | null; product_variants: VariantEmbed | null }[]

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

export const saveWishlistItem = (userId: string, variantId: string) =>
  run(supabase.from('wishlist_items').upsert({ user_id: userId, variant_id: variantId }, SAVE_ONCE))

export const removeWishlistItem = (userId: string, variantId: string) =>
  run(supabase.from('wishlist_items').delete().eq('user_id', userId).eq('variant_id', variantId))

// When a guest logs in, their browser wishlist is folded into their account (duplicates ignored).
// One bad row must not block the rest.
export async function mergeGuestWishlist(userId: string, guest: WishlistItem[]): Promise<void> {
  await Promise.allSettled(guest.map((g) => saveWishlistItem(userId, g.variantId)))
}
