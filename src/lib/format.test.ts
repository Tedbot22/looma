import { describe, expect, it } from 'vitest'
import { discountPercent, formatNaira } from './format'

describe('formatNaira', () => {
  it('shows naira with thousands separators and no kobo', () => {
    expect(formatNaira(1500)).toBe('₦1,500')
    expect(formatNaira(1234567)).toBe('₦1,234,567')
    expect(formatNaira(0)).toBe('₦0')
  })

  it('rounds away kobo rather than showing decimals', () => {
    expect(formatNaira(1500.4)).toBe('₦1,500')
    expect(formatNaira(1500.6)).toBe('₦1,501')
  })
})

describe('discountPercent', () => {
  it('works out the percentage off, rounded', () => {
    expect(discountPercent(1500, 2000)).toBe(25)
    expect(discountPercent(1000, 3000)).toBe(67)
  })

  it('is null when there is no real discount', () => {
    expect(discountPercent(1500, null)).toBeNull()
    expect(discountPercent(1500, 1500)).toBeNull()
    expect(discountPercent(1500, 1000)).toBeNull() // "compare at" below the price is not a discount
    expect(discountPercent(1500, 0)).toBeNull()
  })
})
