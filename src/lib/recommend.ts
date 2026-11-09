// "Recommended for you": learns what kind of items a customer interacts with, then suggests similar
// items from the inventory. When there aren't enough similar items, random ones fill the gaps.
//
// It is a plain function (data in, list out), so it is easy to test and has no side effects.
//
// HOW IT WORKS
//  1. Collect signals. Every interaction says "this customer likes this product", with a strength:
//       viewed       1 to 2.5, rising with the number of views, fading with age (half-life 14 days)
//       wishlisted   3
//       in the cart  4
//       purchased    5, fading slowly with age (half-life 60 days)
//  2. Turn the signals into a taste profile: which categories, which words in product names, which
//     colours, and which price level the customer keeps coming back to.
//  3. Score every in-stock product against that profile.
//  4. Pick the best ones, but spread them out so one category doesn't take over the list.
//  5. If fewer than the wanted number are genuinely similar, fill the rest at random.

import type { ProductWithVariants } from './types'

export interface Interactions {
  views: Record<string, { views: number; last: number }>
  wishlistProductIds: string[]
  cartProductIds: string[]
  purchases: { productId: string; at: number }[]
}

export interface RecommendationResult {
  items: ProductWithVariants[]
  personalised: number // how many were chosen because they are similar to what the customer likes
}

interface Signal {
  productId: string
  weight: number
}

const DAY = 86_400_000
const halfLife = (ageMs: number, days: number) => Math.pow(0.5, Math.max(0, ageMs) / (days * DAY))

// A match this weak is not "similar", so it falls through to the random fill instead.
const MIN_SIMILARITY = 0.15

// ---------- 1. signals ----------
export function buildSignals(interactions: Interactions, now = Date.now()): Signal[] {
  const signals: Signal[] = []

  for (const [productId, v] of Object.entries(interactions.views)) {
    // More views count for more (with diminishing returns), and old interest fades.
    signals.push({ productId, weight: (1 + Math.log(1 + v.views)) * halfLife(now - v.last, 14) })
  }
  for (const productId of interactions.wishlistProductIds) signals.push({ productId, weight: 3 })
  for (const productId of interactions.cartProductIds) signals.push({ productId, weight: 4 })
  for (const p of interactions.purchases) {
    signals.push({ productId: p.productId, weight: 5 * halfLife(now - p.at, 60) })
  }
  return signals
}

// ---------- product features ----------
// Words in a product's name that carry meaning ("vintage", "denim", "sneakers").
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'new', 'set', 'pack', 'size', 'pcs', 'piece', 'pieces'])

export function nameTokens(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    // a simple plural strip, so "jeans" and "jean" or "sneakers" and "sneaker" match
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  return [...new Set(words)]
}

const colours = (p: ProductWithVariants) =>
  [...new Set(p.product_variants.filter((v) => v.is_active && v.color).map((v) => v.color!.toLowerCase()))]

export const inStock = (p: ProductWithVariants) => p.product_variants.some((v) => v.is_active && v.stock > 0)

// ---------- 2. taste profile ----------
interface Taste {
  category: Map<string, number>
  token: Map<string, number>
  colour: Map<string, number>
  priceCentre: number | null // the typical price, on a log scale (a jump from 1,000 to 2,000 matters more than 11,000 to 12,000)
  priceSpread: number
  hasSignals: boolean
}

function bump(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function buildTaste(signals: Signal[], byId: Map<string, ProductWithVariants>): Taste {
  const taste: Taste = {
    category: new Map(),
    token: new Map(),
    colour: new Map(),
    priceCentre: null,
    priceSpread: 0.35,
    hasSignals: false,
  }

  let total = 0
  let logSum = 0
  const points: { w: number; logPrice: number }[] = []

  for (const s of signals) {
    const p = byId.get(s.productId)
    if (!p || s.weight <= 0) continue // a product that no longer exists tells us nothing

    taste.hasSignals = true
    bump(taste.category, p.category_id, s.weight)
    for (const t of nameTokens(p.name)) bump(taste.token, t, s.weight)
    for (const c of colours(p)) bump(taste.colour, c, s.weight)

    const logPrice = Math.log(Math.max(1, p.price))
    total += s.weight
    logSum += s.weight * logPrice
    points.push({ w: s.weight, logPrice })
  }

  if (total > 0) {
    const centre = logSum / total
    const variance = points.reduce((sum, pt) => sum + pt.w * (pt.logPrice - centre) ** 2, 0) / total
    taste.priceCentre = centre
    taste.priceSpread = Math.max(0.35, Math.sqrt(variance)) // never so narrow that only one exact price fits
  }
  return taste
}

// ---------- 3. scoring ----------
const maxOf = (map: Map<string, number>) => Math.max(1e-9, ...map.values())

function scoreProduct(p: ProductWithVariants, taste: Taste, max: { cat: number; tok: number; col: number }) {
  const category = (taste.category.get(p.category_id) ?? 0) / max.cat
  const tokens = nameTokens(p.name)
  const words = Math.min(1, tokens.reduce((sum, t) => sum + (taste.token.get(t) ?? 0) / max.tok, 0) / 2)
  const cols = colours(p)
  const colour = cols.length ? Math.max(...cols.map((c) => (taste.colour.get(c) ?? 0) / max.col)) : 0
  const price =
    taste.priceCentre === null
      ? 0
      : Math.exp(-((Math.log(Math.max(1, p.price)) - taste.priceCentre) ** 2) / (2 * taste.priceSpread ** 2))

  return {
    // Being the same kind of item matters most, then the words in the name, then price level, then colour.
    score: 0.45 * category + 0.25 * words + 0.2 * price + 0.1 * colour,
    // A price match alone is not similarity: the item must share a category, a word or a colour.
    related: category > 0 || words > 0 || colour > 0,
  }
}

// ---------- seeded randomness ----------
// The same seed always gives the same shuffle, so the random fill doesn't reshuffle on every
// re-render. A new seed per visit gives a fresh selection each time.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// One seed per browser visit (kept for the session so the page is stable while you browse).
export function getSessionSeed(): number {
  try {
    const saved = sessionStorage.getItem('thrift-seed')
    if (saved) return Number(saved)
    const fresh = Math.floor(Math.random() * 2 ** 31)
    sessionStorage.setItem('thrift-seed', String(fresh))
    return fresh
  } catch {
    return 12345
  }
}

// ---------- the whole thing ----------
export function recommend(
  pool: ProductWithVariants[],
  interactions: Interactions,
  options: { limit: number; seed: number; now?: number }
): RecommendationResult {
  const { limit, seed, now = Date.now() } = options
  const byId = new Map(pool.map((p) => [p.id, p]))
  const taste = buildTaste(buildSignals(interactions, now), byId)

  // Things not worth suggesting: already bought, already in the cart, or just looked at
  // (those have their own "Recently viewed" row).
  const skip = new Set<string>([
    ...interactions.cartProductIds,
    ...interactions.purchases.map((p) => p.productId),
    ...Object.keys(interactions.views),
  ])
  // Only things that can actually be bought right now.
  const available = pool.filter(inStock)
  const fresh = available.filter((p) => !skip.has(p.id))

  const picked: ProductWithVariants[] = []
  const pickedIds = new Set<string>()

  // ----- similar items, best first, with variety -----
  if (taste.hasSignals) {
    const max = { cat: maxOf(taste.category), tok: maxOf(taste.token), col: maxOf(taste.colour) }
    const candidates = fresh
      .map((p) => ({ p, ...scoreProduct(p, taste, max) }))
      .filter((c) => c.related && c.score >= MIN_SIMILARITY)

    // After each pick, items from the same category are slightly less attractive,
    // so the list mixes categories instead of showing ten of the same thing.
    const penalty = new Map<string, number>()
    while (picked.length < limit && candidates.length > 0) {
      let bestIndex = 0
      let best = -1
      candidates.forEach((c, i) => {
        const s = c.score * (penalty.get(c.p.category_id) ?? 1)
        if (s > best) {
          best = s
          bestIndex = i
        }
      })
      const [chosen] = candidates.splice(bestIndex, 1)
      picked.push(chosen.p)
      pickedIds.add(chosen.p.id)
      penalty.set(chosen.p.category_id, (penalty.get(chosen.p.category_id) ?? 1) * 0.85)
    }
  }
  const personalised = picked.length

  // ----- not enough similar items: fill with random ones -----
  const fill = (source: ProductWithVariants[]) => {
    for (const p of shuffle(source, seed)) {
      if (picked.length >= limit) return
      if (!pickedIds.has(p.id)) {
        picked.push(p)
        pickedIds.add(p.id)
      }
    }
  }
  fill(fresh)
  // A small store may run out even of those: allow anything in stock that isn't already chosen
  // (including things already viewed), so the row is never left short.
  fill(available.filter((p) => !interactions.cartProductIds.includes(p.id)))
  fill(available)

  return { items: picked.slice(0, limit), personalised }
}

// ---------- "You may also like" (product page) ----------
// Unlike recommend() above, this doesn't look at the customer at all. It answers one question:
// "which in-stock items are most like THIS product?" (same category first, then shared words in the
// name, price level and colour). If the shop doesn't have enough close matches, random in-stock items fill the gaps.
export function similarTo(
  pool: ProductWithVariants[],
  product: ProductWithVariants,
  options: { limit: number; seed: number }
): ProductWithVariants[] {
  const { limit, seed } = options

  // The product on the page may not be in the pool (the pool is capped), so make sure it can be looked up.
  const byId = new Map(pool.map((p) => [p.id, p]))
  byId.set(product.id, product)
  const taste = buildTaste([{ productId: product.id, weight: 1 }], byId)
  const max = { cat: maxOf(taste.category), tok: maxOf(taste.token), col: maxOf(taste.colour) }

  // Only things that can be bought right now, and never the product being viewed.
  const available = pool.filter((p) => p.id !== product.id && inStock(p))

  // No penalty for repeating a category here: on a "similar items" row, the same category is the point.
  const picked = available
    .map((p) => ({ p, ...scoreProduct(p, taste, max) }))
    .filter((c) => c.related && c.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score) // ties keep the pool's order (newest first)
    .slice(0, limit)
    .map((c) => c.p)

  // Not enough close matches: fill with random in-stock items.
  const pickedIds = new Set(picked.map((p) => p.id))
  for (const p of shuffle(available, seed)) {
    if (picked.length >= limit) break
    if (!pickedIds.has(p.id)) picked.push(p)
  }
  return picked
}
