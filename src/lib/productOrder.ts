// How products are ranked for a random-but-sensible order. Used by Today's deals.
//
// Newer items and bigger discounts are more likely to come first, but nothing is locked in: the order is
// still different on every visit. Older stock is mixed in on purpose, so it keeps getting seen.
//   Today's deals: weighted shuffles (below), with older stock slotted in.
//   The Shop:      ordered by the database, in browse_products() (supabase/migrations/0005): 80% random,
//                  20% priority (60% newness + 40% discount). Change the numbers there.

import { discountPercent } from './format'
import type { ProductWithVariants } from './types'

const DAY = 86_400_000

export const NEWER_SHARE = 0.6 // the newest 60% of items count as "newer", the rest as "older stock"

const created = (p: ProductWithVariants) => new Date(p.created_at).getTime()

// Brand new = 1. Halves every `halfLifeDays`, but never drops below 0.15, so old stock can still show early.
export function recencyWeight(p: ProductWithVariants, now: number, halfLifeDays = 21): number {
  const ageDays = Math.max(0, (now - created(p)) / DAY)
  return 0.15 + 0.85 * Math.pow(0.5, ageDays / halfLifeDays)
}

// No discount = 1, 20% off = 2, 50% off = 3.5, 80% off or more = 5.
export function discountBoost(p: ProductWithVariants): number {
  const off = Math.min(discountPercent(p.price, p.compare_at_price) ?? 0, 80)
  return 1 + off / 20
}

export const priorityWeight = (p: ProductWithVariants, now: number) => recencyWeight(p, now) * discountBoost(p)
