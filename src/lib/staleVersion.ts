// After you publish a new version, a customer who still has the old page open can fail to load a page
// that has since been renamed. That is not a bug in the page: reloading fixes it.

const STALE_CHUNK =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk [\w-]+ failed|ChunkLoadError/i

export function isStaleVersionError(error: unknown): boolean {
  return error instanceof Error && STALE_CHUNK.test(`${error.name} ${error.message}`)
}

const RELOAD_KEY = 'looma:stale-reload-at'

// Reloads the page, but at most once every 30 seconds, so a real outage can never turn into a reload loop.
export function reloadOnce(reload: () => void): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false // storage is blocked, so we can't guard against a loop: let the customer press the button
  }
  reload()
  return true
}
