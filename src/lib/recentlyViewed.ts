// What a customer has been looking at, remembered on this device.
// It needs no account and no database. Two things are kept:
//   * the recent list (newest first), which powers "Recently viewed"
//   * view statistics (how often and how lately each product was opened), which the
//     "Recommended for you" algorithm learns from

const KEY = 'thrift-recent'
const STATS_KEY = 'thrift-view-stats'
const MAX_RECENT = 20
const MAX_STATS = 100

export interface ViewStat {
  views: number // how many times it was opened
  last: number // when it was last opened (milliseconds since 1970)
}

function readList(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getRecentIds(): string[] {
  const ids = readList(KEY)
  return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []
}

export function getViewStats(): Record<string, ViewStat> {
  const raw = readList(STATS_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const stats: Record<string, ViewStat> = {}
  for (const [id, value] of Object.entries(raw as Record<string, Partial<ViewStat>>)) {
    if (typeof value?.views === 'number' && typeof value?.last === 'number') {
      stats[id] = { views: value.views, last: value.last }
    }
  }
  return stats
}

// Viewing the same product again moves it to the front instead of listing it twice,
// and adds one to its view count.
export function addRecentId(id: string) {
  try {
    const next = [id, ...getRecentIds().filter((i) => i !== id)].slice(0, MAX_RECENT)
    localStorage.setItem(KEY, JSON.stringify(next))

    const stats = getViewStats()
    stats[id] = { views: (stats[id]?.views ?? 0) + 1, last: Date.now() }

    // Keep only the most recently viewed products' statistics so this never grows forever.
    const kept = Object.entries(stats)
      .sort((a, b) => b[1].last - a[1].last)
      .slice(0, MAX_STATS)
    localStorage.setItem(STATS_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* storage blocked: the feature just stays empty */
  }
}

// "Clear" wipes both the list and the statistics, so clearing your history also resets
// what the recommendations have learned about you.
export function clearRecentIds() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(STATS_KEY)
  } catch {
    /* nothing to do */
  }
}
