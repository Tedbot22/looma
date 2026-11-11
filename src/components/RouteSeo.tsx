import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SEO_DESCRIPTION, SEO_TITLE, SITE_URL, STORE_NAME } from '../config'
import { useAppSettings } from '../hooks/useAppSettings'
import { absoluteUrl, pageTitle, useSeo, type SeoOptions } from '../lib/seo'

// Search-engine text for every page that isn't a single product or category (those set their own).
// Pages that are private, or only make sense for one signed-in person, are kept out of Google.

const PUBLIC_PAGES: Record<string, { title: string; description: string }> = {
  '/': { title: SEO_TITLE, description: SEO_DESCRIPTION },
  '/shop': {
    title: pageTitle('Shop Thrift Clothing & Fashion'),
    description: `Browse ${STORE_NAME}'s thrift clothing, quality thrift pieces and affordable fashion.`,
  },
  '/about': {
    title: pageTitle('About Us'),
    description: `Learn about ${STORE_NAME}: thrift fashion, style and confidence for you.`,
  },
  '/faq': {
    title: pageTitle('Frequently Asked Questions'),
    description: `Answers about ordering, delivery, payment and returns at ${STORE_NAME}.`,
  },
  '/contact': {
    title: pageTitle('Contact Us'),
    description: `Questions about an order or a piece? Get in touch with ${STORE_NAME}.`,
  },
  '/reviews': {
    title: pageTitle('Customer Reviews'),
    description: `See what customers say about ${STORE_NAME}: fit, comfort and delivery.`,
  },
  '/privacy': { title: pageTitle('Privacy Policy'), description: `How ${STORE_NAME} protects your data.` },
  '/terms': { title: pageTitle('Terms & Conditions'), description: `The terms for shopping with ${STORE_NAME}.` },
}

export default function RouteSeo() {
  const { pathname, search } = useLocation()
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname

  // A product or category sets its own tags (see ProductPage and Shop).
  const ownsItsTags = path.startsWith('/product/') || path.startsWith('/shop/')

  const page = PUBLIC_PAGES[path]
  // Search results and price filters are endless variations of the same list, so Google skips them.
  const filtered = path === '/shop' && /[?&](q|min|max)=/.test(search)

  const options: SeoOptions | null = ownsItsTags
    ? null
    : page
      ? { ...page, path, noindex: filtered }
      : { title: pageTitle('Thrift Fashion'), path, noindex: true }

  useSeo(options)
  useSiteSchema()
  return null
}

// Tells Google who the store is, and links it to the store's social pages (set in Admin > Store).
function useSiteSchema() {
  const { data: settings } = useAppSettings()
  const sameAs = [settings?.social_facebook, settings?.social_instagram, settings?.social_tiktok].filter(
    (u): u is string => !!u && /^https?:\/\//i.test(u)
  )

  useEffect(() => {
    if (!SITE_URL) return
    const data = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'OnlineStore',
          '@id': `${SITE_URL}/#store`,
          name: STORE_NAME,
          url: `${SITE_URL}/`,
          logo: absoluteUrl('/icons/icon-512.png'),
          image: absoluteUrl('/og-image.png'),
          description: SEO_DESCRIPTION,
          areaServed: 'NG',
          ...(sameAs.length ? { sameAs } : {}),
        },
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: STORE_NAME,
          alternateName: ['Looma', 'Looma Thrift'],
          url: `${SITE_URL}/`,
          publisher: { '@id': `${SITE_URL}/#store` },
        },
      ],
    }
    let el = document.getElementById('seo-jsonld-site')
    if (!el) {
      el = document.createElement('script')
      el.id = 'seo-jsonld-site'
      el.setAttribute('type', 'application/ld+json')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  }, [sameAs.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
}
