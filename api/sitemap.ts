// Served at /sitemap.xml (see vercel.json). A list of every public page, so Google finds new products quickly.
// Self-contained on purpose: Vercel runs this as an ES module, where importing a sibling file without its extension fails.

/** The store's public address: VITE_SITE_URL if set, otherwise the address this request came in on. */
function siteOrigin(request: Request): string {
  const configured = (process.env.VITE_SITE_URL || process.env.SITE_URL || '').replace(/\/$/, '')
  if (configured) return configured
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  return `https://${host}`
}

/** Reads rows from Supabase with the public (anon) key, the same access the storefront has. */
async function supabaseGet<T>(path: string): Promise<T[]> {
  const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('Supabase address or key is missing in the Vercel environment variables')
  const res = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Supabase answered ${res.status}`)
  return (await res.json()) as T[]
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface ProductRow {
  id: string
  created_at: string
  images: string[] | null
}
interface CategoryRow {
  id: string
}

const STATIC_PAGES = ['/', '/shop', '/about', '/faq', '/contact', '/reviews', '/privacy', '/terms']

export async function GET(request: Request) {
  const origin = siteOrigin(request)
  let products: ProductRow[] = []
  let categories: CategoryRow[] = []
  try {
    ;[products, categories] = await Promise.all([
      supabaseGet<ProductRow>('products?select=id,created_at,images&is_active=eq.true&order=created_at.desc&limit=5000'),
      supabaseGet<CategoryRow>('categories?select=id'),
    ])
  } catch {
    // If the database can't be reached, still serve the fixed pages rather than an error.
  }

  const url = (loc: string, extra = '') => `  <url><loc>${escapeXml(origin + loc)}</loc>${extra}</url>`
  const entries = [
    ...STATIC_PAGES.map((p) => url(p)),
    ...categories.map((c) => url(`/shop/${c.id}`)),
    ...products.map((p) =>
      url(
        `/product/${p.id}`,
        `<lastmod>${new Date(p.created_at).toISOString()}</lastmod>` +
          (p.images ?? [])
            .filter((src) => /^https?:\/\//i.test(src))
            .slice(0, 3)
            .map((src) => `<image:image><image:loc>${escapeXml(src)}</image:loc></image:image>`)
            .join('')
      )
    ),
  ]

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    entries.join('\n') +
    '\n</urlset>\n'

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
