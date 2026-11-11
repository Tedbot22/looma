import { useEffect } from 'react'
import { SEO_DESCRIPTION, SHARE_IMAGE, SITE_URL, STORE_NAME } from '../config'

// Sets the page title, description, share-preview tags, canonical address and structured data (JSON-LD)
// for the page that is showing. Search engines read these; so do WhatsApp, Facebook and X when a link is shared.
// (Crawlers that don't run JavaScript get the same tags from api/seo.ts instead.)

export interface SeoOptions {
  title: string
  description?: string
  /** Path of this page, e.g. /product/123. Used for the canonical address. Defaults to the current path. */
  path?: string
  /** Absolute or site-relative image address for link previews. */
  image?: string
  /** Keep this page out of search results. */
  noindex?: boolean
  /** Structured data for this page (a Product, for example). */
  jsonLd?: object
  /** "product" makes Facebook and WhatsApp show it as a product link. */
  ogType?: 'website' | 'product'
}

const PAGE_LD_ID = 'seo-jsonld-page'

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (content === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (href === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

function upsertJsonLd(id: string, data: object | null) {
  let el = document.getElementById(id)
  if (!data) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.id = id
    el.setAttribute('type', 'application/ld+json')
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

export const absoluteUrl = (pathOrUrl: string) =>
  /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`

export function pageTitle(title: string) {
  return `${title} | ${STORE_NAME}`
}

export function useSeo(options: SeoOptions | null) {
  // Re-run only when something that matters changes (the JSON is compared as text).
  const key = options ? JSON.stringify(options) : ''

  useEffect(() => {
    if (!options) return
    const { title, description = SEO_DESCRIPTION, image = SHARE_IMAGE, noindex, jsonLd, ogType = 'website' } = options
    const path = options.path ?? window.location.pathname
    const url = absoluteUrl(path)
    const imageUrl = absoluteUrl(image)

    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
    // Pages kept out of search have no canonical address.
    upsertCanonical(noindex ? null : url)

    upsertMeta('property', 'og:type', ogType)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', imageUrl)

    upsertJsonLd(PAGE_LD_ID, jsonLd ?? null)
    return () => upsertJsonLd(PAGE_LD_ID, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** One tidy line of plain text no longer than `max` characters, for descriptions. */
export function tidy(text: string | null | undefined, max = 155): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}
