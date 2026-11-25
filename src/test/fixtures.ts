// Small builders for test data, so each test only spells out what it cares about.
import type { ProductVariant, ProductWithVariants } from '../lib/types'

let counter = 0

export function makeVariant(over: Partial<ProductVariant> = {}): ProductVariant {
  counter++
  return {
    id: `variant-${counter}`,
    product_id: 'product',
    color: null,
    size: null,
    image: null,
    stock: 1,
    is_active: true,
    ...over,
  }
}

export function makeProduct(over: Partial<ProductWithVariants> = {}): ProductWithVariants {
  counter++
  return {
    id: `product-${counter}`,
    category_id: 'cat-1',
    name: 'Plain Tee',
    description: null,
    details: null,
    price: 5000,
    compare_at_price: null,
    images: [],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    product_variants: [makeVariant()],
    categories: { name: 'Tops' },
    ...over,
  }
}

// A product that is sold out (every variant at zero stock).
export const soldOut = (over: Partial<ProductWithVariants> = {}) =>
  makeProduct({ product_variants: [makeVariant({ stock: 0 })], ...over })

const DAY = 86_400_000
export const daysAgo = (n: number, from = Date.now()) => new Date(from - n * DAY).toISOString()
