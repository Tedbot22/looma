// "Today's deals": which in-stock items to show, and in what order.
//
//  1. A lead block that mixes four kinds of items, taking turns: fresh arrival, big markdown, random pick,
//     fresh arrival, big markdown, older stock, then again. Fresh arrivals and markdowns are weighted shuffles
//     (newer / deeper discounts come up first more often, but the order changes every visit).
//  2. After that, recent and older stock is mixed together (one newer, one older, and so on), so older
//     items keep getting seen and don't fade out of view.
//
// The order is reshuffled every time the page opens (each page picks a fresh seed with randomSeed() and keeps
// it while it stays open, so items don't jump around). The home page row shows the first few of this list;
// the Today's deals page shows all of it.

import { discountPercent } from './format'
import { inStock, shuffle } from './recommend'
import { NEWER_SHARE, discountBoost, priorityWeight, recencyWeight } from './productOrder'
import { weightedShuffle } from './shuffle'
import type { ProductWithVariants } from './types'

const DAY = 86_400_000
export const LEAD_BLOCK = 12 // how many items the lead mix is made of
const HIGH_DISCOUNT = 20 // percent off, or more, counts as a big markdown

// A new whole number for each visit. Pass it to todaysDealsList to get a new order.
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

export function todaysDealsList(pool: ProductWithVariants[], seed: number = Math.floor(Date.now() / DAY)): ProductWithVariants[] {
  const now = Date.now()
  const newestFirst = pool
    .filter(inStock)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // The three sources for the lead block.
  // "Fresh arrivals" and "big markdowns" are weighted shuffles: the newest items and the deepest discounts are the
  // most likely to be picked first, but the order differs on every visit.
  const fresh = weightedShuffle(newestFirst, (p) => recencyWeight(p, now, 10), seed + 2)
  const markdowns = weightedShuffle(
    newestFirst.filter((p) => (discountPercent(p.price, p.compare_at_price) ?? 0) >= HIGH_DISCOUNT),
    (p) => discountBoost(p) ** 2,
    seed + 3
  )
  const random = shuffle(newestFirst, seed)
  // A bit of older stock in the lead mix too, so it isn't only seen further down the page.
  const olderPicks = weightedShuffle(newestFirst.slice(Math.ceil(newestFirst.length * NEWER_SHARE)), discountBoost, seed + 4)

  const lead: ProductWithVariants[] = []
  const used = new Set<string>()
  const next = (source: ProductWithVariants[]) => source.find((p) => !used.has(p.id))
  const take = (p: ProductWithVariants | undefined) => {
    if (!p) return false
    lead.push(p)
    used.add(p.id)
    return true
  }

  // Fresh, markdown, random, fresh, markdown, older... (so the first six on the home page are two fresh, two
  // markdowns, one random and one older). If one source runs dry (say there are no big markdowns today) the
  // turn goes to the next source instead of leaving a gap.
  const turns = [fresh, markdowns, random, fresh, markdowns, olderPicks]
  for (let i = 0; lead.length < LEAD_BLOCK && lead.length < newestFirst.length; i++) {
    const order = turns.map((_, k) => turns[(i + k) % turns.length])
    if (!order.some((source) => take(next(source)))) break
  }

  // The rest: newer and older stock taking turns, so older items don't fade.
  const rest = newestFirst.filter((p) => !used.has(p.id))
  const half = Math.ceil(rest.length / 2)
  const newer = weightedShuffle(rest.slice(0, half), (p) => priorityWeight(p, now), seed)
  const older = weightedShuffle(rest.slice(half), discountBoost, seed + 1)
  const mixed: ProductWithVariants[] = []
  for (let i = 0; i < Math.max(newer.length, older.length); i++) {
    if (newer[i]) mixed.push(newer[i])
    if (older[i]) mixed.push(older[i])
  }

  return [...lead, ...mixed]
}
