// "Recently viewed" is remembered per device (in the browser), newest first.
// It needs no account and no database, and the list is just product ids.

const KEY = 'thrift-recent'
const MAX = 20

export function getRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []
  } catch {
    return []
  }
}

// Viewing the same product again moves it to the front instead of listing it twice.
export function addRecentId(id: string) {
  try {
    const next = [id, ...getRecentIds().filter((i) => i !== id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: the feature just stays empty */
  }
}

export function clearRecentIds() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
