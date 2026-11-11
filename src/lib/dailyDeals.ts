// "Daily deals": which in-stock items to show, and in what order.
//
//  1. The newest items come first, newest to oldest (the "fresh" block).
//  2. After that, recent and older items are mixed together, so older stock keeps getting seen and
//     doesn't fade out of view. The mix is reshuffled once a day, so different older items get a turn.
//
// The home page row shows the first few of this list; the Daily deals page shows all of it.

import { inStock, shuffle } from './recommend'
import type { ProductWithVariants } from './types'

const DAY = 86_400_000
export const FRESH_BLOCK = 12 // how many of the newest items always lead the list

export function dailyDealsList(pool: ProductWithVariants[], now = Date.now()): ProductWithVariants[] {
  const newestFirst = pool
    .filter(inStock)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const fresh = newestFirst.slice(0, FRESH_BLOCK)
  const rest = newestFirst.slice(FRESH_BLOCK)

  // Split what's left into its newer half and older half, shuffle each with today's seed, then take
  // turns: one newer item, one older item, and so on.
  const seed = Math.floor(now / DAY)
  const half = Math.ceil(rest.length / 2)
  const newer = shuffle(rest.slice(0, half), seed)
  const older = shuffle(rest.slice(half), seed + 1)

  const mixed: ProductWithVariants[] = []
  for (let i = 0; i < Math.max(newer.length, older.length); i++) {
    if (newer[i]) mixed.push(newer[i])
    if (older[i]) mixed.push(older[i])
  }
  return [...fresh, ...mixed]
}
