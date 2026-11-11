import { siteOrigin } from './_shared'

// Served at /robots.txt (see vercel.json). Tells search engines where not to go, and where the sitemap is.
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
