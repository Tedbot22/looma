// Format a number as Nigerian naira, e.g. 1500 -> ₦1,500
export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Percent off, calculated (never stored) so it can't drift out of sync.
// discountPercent(1500, 2000) -> 25
export function discountPercent(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price) return null
  return Math.round(((compareAt - price) / compareAt) * 100)
}
