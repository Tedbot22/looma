// The last few things this person searched for, kept on their device and shown when the search box is
// opened empty. Nothing here is sent anywhere.

const KEY = 'looma:recent-searches'
const MAX = 6

export function getRecentSearches(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Private mode or full storage: recent searches are a convenience, so just skip them.
  }
}

// Newest first, with no repeats.
export function addRecentSearch(term: string): string[] {
  const t = term.trim()
  if (t.length < 2) return getRecentSearches()
  const next = [t, ...getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX)
  save(next)
  return next
}

export function removeRecentSearch(term: string): string[] {
  const next = getRecentSearches().filter((x) => x !== term)
  save(next)
  return next
}

export function clearRecentSearches(): string[] {
  save([])
  return []
}
