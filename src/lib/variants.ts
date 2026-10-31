import type { CartItem } from '../context/CartContext'
import type { ProductVariant, ProductWithVariants } from './types'

// "Black / M", or "Standard" for items with a single version.
export function variantLabel(v: Pick<ProductVariant, 'color' | 'size'>): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || 'Standard'
}

// Builds the cart entry for one variant of a product (used by product cards and the quick-add sheet).
export function toCartItem(product: ProductWithVariants, variant: ProductVariant): Omit<CartItem, 'quantity'> {
  return {
    variantId: variant.id,
    productId: product.id,
    name: product.name,
    variantLabel: variantLabel(variant),
    price: product.price,
    image: product.images[0] ?? null,
    maxStock: variant.stock,
  }
}

// ---- Reading cart / wishlist rows from the database ----

// One query fetches a saved variant together with its product details.
export const VARIANT_FIELDS = 'id, color, size, stock, products(id, name, price, images)'

export interface VariantEmbed {
  id: string
  color: string | null
  size: string | null
  stock: number
  products: { id: string; name: string; price: number; images: string[] } | null
}

// Flattens a database row into the shape the UI uses.
// Returns null when the variant or product is hidden (Row Level Security removes them from view).
export function describeVariant(v: VariantEmbed | null) {
  if (!v || !v.products) return null
  return {
    variantId: v.id,
    productId: v.products.id,
    name: v.products.name,
    variantLabel: variantLabel(v),
    price: v.products.price,
    image: v.products.images[0] ?? null,
    stock: v.stock,
  }
}
