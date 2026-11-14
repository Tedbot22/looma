// A shuffle that is random per page load but steady while the page stays open.
// Each item gets a number worked out from (seed + its id) and the list is sorted by that number.
// New seed on every visit = new order. Same seed after a refetch, a stock update or a filter change = same order,
// so products don't jump around under the customer's finger.
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Extra mixing so ids that differ by one character don't land next to each other.
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

// A steady "random" number strictly between 0 and 1 for one item and one seed.
export function seededUnit(seed: number, id: string): number {
  return (hash(`${seed}:${id}`) + 1) / 4294967297
}

export function shuffleBySeed<T extends { id: string }>(items: T[], seed: number): T[] {
  return items
    .map((item) => ({ item, key: hash(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}

// A weighted shuffle: every item can land anywhere, but items with a bigger weight are much more likely to
// land near the front. Same seed + same items = same order (so a page stays steady while it's open).
// (Each item "races" with time -ln(u) / weight, where u is a steady random number worked out from seed + id.)
export function weightedShuffle<T extends { id: string }>(items: T[], weight: (item: T) => number, seed: number): T[] {
  return items
    .map((item) => {
      const u = seededUnit(seed, item.id)
      return { item, key: -Math.log(u) / Math.max(weight(item), 1e-6) }
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}
