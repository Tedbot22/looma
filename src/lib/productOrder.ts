// How products are ranked for a random-but-sensible order. Used by the Shop and Today's deals.
//
// Newer items and bigger discounts are more likely to come first, but nothing is locked in: the order is
// still different on every visit. Older stock is mixed in on purpose, so it keeps getting seen.
//   Shop:          80% random, 20% priority (see SHOP_PRIORITY_SHARE).
//   Today's deals: stronger priority (weighted shuffles below), with older stock slotted in.

import { discountPercent } from './format'
import { seededUnit } from './shuffle'
import type { ProductWithVariants } from './types'

const DAY = 86_400_000

export const NEWER_SHARE = 0.6 // the newest 60% of items count as "newer", the rest as "older stock"

// How much of the Shop's order comes from priority (newer, discounted). The rest, 80%, is pure random.
// Raise it to favour new and discounted items more; 0 would be a completely random shuffle.
export const SHOP_PRIORITY_SHARE = 0.2

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

// The Shop's order (when nobody is searching). Every item gets a score:
//   score = 80% random number + 20% priority (newer and discounted = higher)
// and the list is sorted by score. A new random number is drawn on every visit, so the order changes each time,
// and priority only nudges it: an old, full-price item can still land near the top, and a brand new one can
// land far down.
export function shopOrder(products: ProductWithVariants[], seed: number): ProductWithVariants[] {
  const newestFirst = [...products].sort((a, b) => created(b) - created(a))
  const last = Math.max(newestFirst.length - 1, 1)

  return newestFirst
    .map((p, rank) => {
      const newness = 1 - rank / last // newest = 1, oldest = 0
      const discount = Math.min(discountPercent(p.price, p.compare_at_price) ?? 0, 50) / 50 // 50% off or more = 1
      const priority = 0.6 * newness + 0.4 * discount
      const score = (1 - SHOP_PRIORITY_SHARE) * seededUnit(seed, p.id) + SHOP_PRIORITY_SHARE * priority
      return { p, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
}
