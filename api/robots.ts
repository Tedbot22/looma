// Served at /robots.txt (see vercel.json). Tells search engines where not to go, and where the sitemap is.
// Self-contained on purpose: Vercel runs this as an ES module, where importing a sibling file without its extension fails.

/** The store's public address: VITE_SITE_URL if set, otherwise the address this request came in on. */
function siteOrigin(request: Request): string {
  const configured = (process.env.VITE_SITE_URL || process.env.SITE_URL || '').replace(/\/$/, '')
  if (configured) return configured
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  return `https://${host}`
}

export function GET(request: Request) {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /order/',
    'Disallow: /review/',
    'Disallow: /rider/',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /*?q=',
    '',
    `Sitemap: ${siteOrigin(request)}/sitemap.xml`,
    '',
  ].join('\n')
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
