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

export function shuffleBySeed<T extends { id: string }>(items: T[], seed: number): T[] {
  return items
    .map((item) => ({ item, key: hash(`${seed}:${item.id}`) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}
