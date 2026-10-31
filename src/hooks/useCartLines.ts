import { useCart, type CartItem } from '../context/CartContext'
import { useVariantInfo } from './useVariantInfo'

export type LineStatus = 'ok' | 'limited' | 'sold_out'

export interface CartLine extends CartItem {
  liveStock: number
  effectiveQty: number // what we can actually order right now
  status: LineStatus
}

// The cart as the customer SHOULD see it: each item checked against live stock.
// Sold-out items stay in the list (greyed out) but are excluded from "orderable" and the total.
export function useCartLines() {
  const { items } = useCart()
  const { infoById, refetch } = useVariantInfo(items.map((i) => i.variantId))

  const lines: CartLine[] = items.map((item) => {
    // Until the live check loads, trust what the cart saved.
    const info = infoById ? (infoById.get(item.variantId) ?? { stock: 0, price: item.price }) : null
    const liveStock = info ? info.stock : item.maxStock
    const price = info && info.price > 0 ? info.price : item.price

    const status: LineStatus =
      liveStock <= 0 ? 'sold_out' : item.quantity > liveStock ? 'limited' : 'ok'

    return {
      ...item,
      price,
      liveStock,
      effectiveQty: Math.min(item.quantity, Math.max(liveStock, 0)),
      status,
    }
  })

  const orderable = lines.filter((l) => l.status !== 'sold_out')
  const total = orderable.reduce((sum, l) => sum + l.price * l.effectiveQty, 0)

  return { lines, orderable, total, refetch }
}
