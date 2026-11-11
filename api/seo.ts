import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SHARE_IMAGE,
  STORE_NAME,
  escapeHtml,
  isUuid,
  siteOrigin,
  supabaseGet,
  tidy,
} from './_shared'

// Crawlers that don't run JavaScript (WhatsApp, Facebook, X, Telegram, and sometimes Bing) would only ever see the
// plain home-page tags on a product link. vercel.json sends those crawlers' requests for /product/:id and /shop/:id
// here. We return the normal app page with the title, description, picture and Product data for that item filled in.
// Real visitors never come through here; they get the normal app.

interface ProductRow {
  id: string
  name: string
  description: string | null
  price: number
  images: string[] | null
  categories: { name: string } | null
  product_variants: { stock: number; is_active: boolean }[]
}
interface CategoryRow {
  id: string
  name: string
}
interface SeoData {
  title: string
  description: string
  path: string
  image: string
  ogType: 'website' | 'product'
  jsonLd?: object
  found: boolean
}

export async function GET(request: Request) {
  const origin = siteOrigin(request)
  const params = new URL(request.url).searchParams
  const type = params.get('type')
  const id = params.get('id')

  // The app page itself (the built index.html), which we edit and return.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const shell = await fetch(`https://${host}/index.html`)
  if (!shell.ok) return new Response('Page unavailable', { status: 502 })
  const html = await shell.text()

  let data: SeoData | null = null
  try {
    if (type === 'product' && isUuid(id)) data = await productSeo(origin, id)
    else if (type === 'category' && isUuid(id)) data = await categorySeo(origin, id)
  } catch {
    data = null
  }

  // Unknown id or a database problem: send the plain app page, kept out of search results if the item doesn't exist.
  const seo: SeoData = data ?? {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: new URL(request.url).pathname,
    image: SHARE_IMAGE,
    ogType: 'website',
    found: false,
  }
  return new Response(inject(html, seo, origin), {
    status: data ? 200 : 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  })
}

async function productSeo(origin: string, id: string): Promise<SeoData | null> {
  const rows = await supabaseGet<ProductRow>(
    `products?id=eq.${id}&is_active=eq.true&select=id,name,description,price,images,categories(name),product_variants(stock,is_active)&limit=1`
  )
  const p = rows[0]
  if (!p) return null
  const images = p.images ?? []
  return {
    title: `${p.name} | ${STORE_NAME}`,
    description: tidy(p.description) || `Buy ${p.name} at ${STORE_NAME}. Your style. Your confidence. Thrift fashion delivered to you.`,
    path: `/product/${p.id}`,
    image: images[0] ?? SHARE_IMAGE,
    ogType: 'product',
    found: true,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: tidy(p.description, 500) || p.name,
      sku: p.id,
      image: images,
      ...(p.categories?.name ? { category: p.categories.name } : {}),
      offers: {
        '@type': 'Offer',
        url: `${origin}/product/${p.id}`,
        priceCurrency: 'NGN',
        price: p.price,
        itemCondition: 'https://schema.org/UsedCondition',
        availability: p.product_variants.some((v) => v.is_active && v.stock > 0)
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: STORE_NAME },
      },
    },
  }
}

async function categorySeo(_origin: string, id: string): Promise<SeoData | null> {
  const rows = await supabaseGet<CategoryRow>(`categories?id=eq.${id}&select=id,name&limit=1`)
  const c = rows[0]
  if (!c) return null
  return {
    title: `${c.name} | Thrift Clothing | ${STORE_NAME}`,
    description: `Shop thrift ${c.name.toLowerCase()} at ${STORE_NAME}. Your style. Your confidence. Thrift fashion delivered to you.`,
    path: `/shop/${c.id}`,
    image: SHARE_IMAGE,
    ogType: 'website',
    found: true,
  }
}

function inject(html: string, seo: SeoData, origin: string): string {
  const url = `${origin}${seo.path}`
  const image = /^https?:\/\//i.test(seo.image) ? seo.image : `${origin}${seo.image}`
  const t = escapeHtml(seo.title)
  const d = escapeHtml(seo.description)
  const lines = [
    '<!--seo:start-->',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${seo.found ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}" />`,
    ...(seo.found ? [`<link rel="canonical" href="${escapeHtml(url)}" />`] : []),
    `<meta property="og:site_name" content="${STORE_NAME}" />`,
    '<meta property="og:locale" content="en_NG" />',
    `<meta property="og:type" content="${seo.ogType}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    // "<" is escaped so a product name can never close the script tag early.
    ...(seo.jsonLd
      ? [`<script type="application/ld+json" id="seo-jsonld-page">${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`]
      : []),
    '<!--seo:end-->',
  ]
  // A function (not a string) as the replacement, so a "$" in a product name is never treated as a special pattern.
  return html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => lines.join('\n  '))
}
