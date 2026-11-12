// Store-wide settings in one place, so changing them never means hunting through components.

export const STORE_NAME = 'Looma' // TODO: the client's real store name

// The logo image. Drop your file into /public (e.g. public/logo.png) and change this path to match.
export const LOGO_SRC = '/logo.png'
export const LOGO_SRC_2 = '/logo2.png'
export const LOGO_SRC_3 = '/logo3.png'

// Owner's WhatsApp number: country code + number, digits only, no "+" or spaces.
// Nigeria example: 2348012345678 (that's +234 801 234 5678)
export const WHATSAPP_NUMBER = '2348145043953' // TODO: replace with the owner's real number

// Where an invite code (from a ?ref=CODE link) is remembered until the visitor signs up.
export const REFERRAL_KEY = 'looma-ref'

// ---- Search engine (SEO) text. Change these to match how you want the store to appear on Google. ----
// Keep the title under about 60 characters and the description under about 155.
export const SEO_TITLE = 'Looma | Thrift Fashion & Clothing Brand in Nigeria'
export const SEO_DESCRIPTION =
  'Looma brings you affordable thrift fashion and standout styles made for everyday confidence.'

// The store\'s public web address, with no slash at the end (e.g. https://looma.ng). Set VITE_SITE_URL in Vercel once you
// have your own domain. Until then the address the visitor is on is used.
export const SITE_URL: string =
  ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')

// Where the share picture (WhatsApp, Facebook, X link previews) comes from. 1200 x 630 works best.
export const SHARE_IMAGE = '/og-image.png'
