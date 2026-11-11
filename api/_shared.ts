// Helpers shared by the SEO functions (sitemap, robots, crawler pages). Files starting with "_" are not made into URLs.

declare const process: { env: Record<string, string | undefined> }

export const STORE_NAME = 'LOOMA'
export const SHARE_IMAGE = '/og-image.png'
export const DEFAULT_TITLE = 'LOOMA | Thrift Fashion & Clothing Brand in Nigeria'
export const DEFAULT_DESCRIPTION =
  'Looma brings you affordable thrift fashion and standout styles made for everyday confidence.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string | null): v is string => !!v && UUID.test(v)

/** The store's public address: VITE_SITE_URL if set, otherwise the address this request came in on. */
export function siteOrigin(request: Request): string {
  const configured = (process.env.VITE_SITE_URL || process.env.SITE_URL || '').replace(/\/$/, '')
  if (configured) return configured
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  return `https://${host}`
}

/** Reads rows from Supabase with the public (anon) key, the same access the storefront has. */
export async function supabaseGet<T>(path: string): Promise<T[]> {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('Supabase address or key is missing in the Vercel environment variables')
  const res = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Supabase answered ${res.status}`)
  return (await res.json()) as T[]
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const escapeXml = escapeHtml

export function tidy(text: string | null | undefined, max = 155): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}
