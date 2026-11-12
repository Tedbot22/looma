// "Today's deals": which in-stock items to show, and in what order.
//
//  1. A lead block that mixes three kinds of items, taking turns: a fresh arrival, a big markdown, a
//     random pick, then again. So the first six on the home page are two of each.
//  2. After that, recent and older stock is mixed together (one newer, one older, and so on), so older
//     items keep getting seen and don't fade out of view.
//
// Everything that is random is reshuffled once a day. The home page row shows the first few of this
// list; the Today's deals page shows all of it.

import { discountPercent } from './format'
import { inStock, shuffle } from './recommend'
import type { ProductWithVariants } from './types'

const DAY = 86_400_000
export const LEAD_BLOCK = 12 // how many items the lead mix is made of
const HIGH_DISCOUNT = 20 // percent off, or more, counts as a big markdown

export function todaysDealsList(pool: ProductWithVariants[], now = Date.now()): ProductWithVariants[] {
  const seed = Math.floor(now / DAY)
  const newestFirst = pool
    .filter(inStock)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // The three sources for the lead block.
  const fresh = newestFirst
  const markdowns = newestFirst
    .map((p) => ({ p, off: discountPercent(p.price, p.compare_at_price) ?? 0 }))
    .filter((x) => x.off >= HIGH_DISCOUNT)
    .sort((a, b) => b.off - a.off)
    .map((x) => x.p)
  const random = shuffle(newestFirst, seed)

  const lead: ProductWithVariants[] = []
  const used = new Set<string>()
  const next = (source: ProductWithVariants[]) => source.find((p) => !used.has(p.id))
  const take = (p: ProductWithVariants | undefined) => {
    if (!p) return false
    lead.push(p)
    used.add(p.id)
    return true
  }

  // Fresh, markdown, random, fresh, markdown, random... If one source runs dry (say there are no big
  // markdowns today) the turn goes to the next source instead of leaving a gap.
  const turns = [fresh, markdowns, random]
  for (let i = 0; lead.length < LEAD_BLOCK && lead.length < newestFirst.length; i++) {
    const order = [turns[i % 3], turns[(i + 1) % 3], turns[(i + 2) % 3]]
    if (!order.some((source) => take(next(source)))) break
  }

  // The rest: newer and older stock taking turns, so older items don't fade.
  const rest = newestFirst.filter((p) => !used.has(p.id))
  const half = Math.ceil(rest.length / 2)
  const newer = shuffle(rest.slice(0, half), seed)
  const older = shuffle(rest.slice(half), seed + 1)
  const mixed: ProductWithVariants[] = []
  for (let i = 0; i < Math.max(newer.length, older.length); i++) {
    if (newer[i]) mixed.push(newer[i])
    if (older[i]) mixed.push(older[i])
  }

  return [...lead, ...mixed]
}
