import type { ProductWithVariants } from './types'

// Which size chart a product gets. 'none' (or no match) means no "Size guide" link at all,
// which is right for things like perfumes and bags.
export type SizeGuideKind = 'clothing' | 'shoes'

// The owner can pick the guide on the product form. When it is left on "Automatic" we work it out from the
// category name, so a category called "Sneakers" gets the shoe chart and "Perfumes" gets nothing.
const SHOE_WORDS = /\b(shoes?|sneakers?|footwear|sandals?|slides?|slippers?|boots?|heels?|loafers?|trainers?|crocs?|flats?|palm)\b/i
const NO_GUIDE_WORDS =
  /\b(perfumes?|fragrances?|colognes?|body ?spray|scents?|bags?|handbags?|accessor(y|ies)|jewel(l)?ery|watch(es)?|caps?|hats?|belts?|sunglasses|glasses|beauty|cosmetics?|wigs?|home|gadgets?|phones?)\b/i
const CLOTHING_WORDS =
  /(cloth|wear|shirt|top|tee|dress|trouser|pant|jean|short|skirt|hood|jacket|sweat|jersey|polo|native|gown|suit|coat|knit|apparel|blouse|cargo|jogger|singlet|bra|lingerie|co-?ord)/i

export function resolveSizeGuide(product: Pick<ProductWithVariants, 'size_guide' | 'categories' | 'product_variants'>): SizeGuideKind | null {
  // No sizes on the item = nothing to look up.
  const hasSizes = product.product_variants.some((v) => v.is_active && !!v.size)
  if (!hasSizes) return null

  if (product.size_guide === 'none') return null
  if (product.size_guide === 'clothing' || product.size_guide === 'shoes') return product.size_guide

  const category = product.categories?.name ?? ''
  if (NO_GUIDE_WORDS.test(category)) return null
  if (SHOE_WORDS.test(category)) return 'shoes'
  if (CLOTHING_WORDS.test(category)) return 'clothing'
  return null
}

// ---------- Chart data (general guide: brands differ, and these are pre-owned pieces) ----------

export const CM_PER_INCH = 2.54

// Body measurements in cm, as [min, max].
export const CLOTHING_ROWS: { size: string; chest: [number, number]; waist: [number, number]; hip: [number, number] }[] = [
  { size: 'XS', chest: [81, 86], waist: [66, 71], hip: [86, 91] },
  { size: 'S', chest: [86, 94], waist: [71, 79], hip: [91, 99] },
  { size: 'M', chest: [94, 102], waist: [79, 86], hip: [99, 107] },
  { size: 'L', chest: [102, 110], waist: [86, 94], hip: [107, 114] },
  { size: 'XL', chest: [110, 118], waist: [94, 102], hip: [114, 122] },
  { size: 'XXL', chest: [118, 126], waist: [102, 110], hip: [122, 130] },
  { size: '3XL', chest: [126, 134], waist: [110, 118], hip: [130, 138] },
]

// Jeans and trousers sold by waist size in inches.
export const BOTTOMS_ROWS: { size: string; waist: [number, number]; hip: [number, number] }[] = [
  { size: '28', waist: [71, 74], hip: [89, 93] },
  { size: '30', waist: [76, 79], hip: [94, 98] },
  { size: '32', waist: [81, 84], hip: [99, 103] },
  { size: '34', waist: [86, 89], hip: [104, 108] },
  { size: '36', waist: [91, 94], hip: [109, 113] },
  { size: '38', waist: [97, 99], hip: [114, 118] },
  { size: '40', waist: [102, 104], hip: [119, 123] },
]

export const SHOE_ROWS: { eu: string; uk: string; usMen: string; usWomen: string; footCm: number }[] = [
  { eu: '36', uk: '3.5', usMen: '4.5', usWomen: '6', footCm: 22.5 },
  { eu: '37', uk: '4.5', usMen: '5.5', usWomen: '7', footCm: 23.1 },
  { eu: '38', uk: '5', usMen: '6', usWomen: '7.5', footCm: 23.8 },
  { eu: '39', uk: '6', usMen: '7', usWomen: '8.5', footCm: 24.5 },
  { eu: '40', uk: '6.5', usMen: '7.5', usWomen: '9', footCm: 25.1 },
  { eu: '41', uk: '7.5', usMen: '8.5', usWomen: '10', footCm: 25.8 },
  { eu: '42', uk: '8', usMen: '9', usWomen: '10.5', footCm: 26.5 },
  { eu: '43', uk: '9', usMen: '10', usWomen: '11.5', footCm: 27.1 },
  { eu: '44', uk: '9.5', usMen: '10.5', usWomen: '12', footCm: 27.8 },
  { eu: '45', uk: '10.5', usMen: '11.5', usWomen: '13', footCm: 28.5 },
  { eu: '46', uk: '11', usMen: '12', usWomen: '13.5', footCm: 29.1 },
]

export type Unit = 'cm' | 'in'

const inch = (cm: number) => Math.round((cm / CM_PER_INCH) * 2) / 2 // nearest half inch

export function formatRange([lo, hi]: [number, number], unit: Unit): string {
  return unit === 'cm' ? `${lo}–${hi}` : `${inch(lo)}–${inch(hi)}`
}

export function formatLength(cm: number, unit: Unit): string {
  return unit === 'cm' ? cm.toFixed(1) : (cm / CM_PER_INCH).toFixed(1)
}
