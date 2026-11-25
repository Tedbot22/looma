import { describe, expect, it } from 'vitest'
import { describeVariant, toCartItem, variantLabel } from './variants'
import { makeProduct, makeVariant } from '../test/fixtures'

describe('variantLabel', () => {
  it('joins colour and size, and copes with either missing', () => {
    expect(variantLabel({ color: 'Black', size: 'M' })).toBe('Black / M')
    expect(variantLabel({ color: 'Black', size: null })).toBe('Black')
    expect(variantLabel({ color: null, size: 'XL' })).toBe('XL')
  })

  it('calls a single-version item "Standard"', () => {
    expect(variantLabel({ color: null, size: null })).toBe('Standard')
    expect(variantLabel({ color: '', size: '' })).toBe('Standard')
  })
})

describe('toCartItem', () => {
  it('prefers the variant photo, then the first product photo, then none', () => {
    const product = makeProduct({ images: ['p1.jpg', 'p2.jpg'] })
    expect(toCartItem(product, makeVariant({ image: 'v.jpg' })).image).toBe('v.jpg')
    expect(toCartItem(product, makeVariant({ image: null })).image).toBe('p1.jpg')
    expect(toCartItem(makeProduct({ images: [] }), makeVariant()).image).toBeNull()
  })

  it('carries the product price and the variant stock', () => {
    const item = toCartItem(makeProduct({ id: 'p9', name: 'Hoodie', price: 8000 }), makeVariant({ id: 'v9', stock: 3, color: 'Red', size: 'L' }))
    expect(item).toMatchObject({ variantId: 'v9', productId: 'p9', name: 'Hoodie', price: 8000, maxStock: 3, variantLabel: 'Red / L' })
  })
})

describe('describeVariant', () => {
  const row = { id: 'v1', color: 'Blue', size: 'S', stock: 2, products: { id: 'p1', name: 'Jeans', price: 9000, images: ['a.jpg'] } }

  it('flattens a database row for the UI', () => {
    expect(describeVariant(row)).toEqual({
      variantId: 'v1', productId: 'p1', name: 'Jeans', variantLabel: 'Blue / S', price: 9000, image: 'a.jpg', stock: 2,
    })
  })

  it('returns null when the variant or its product is hidden from the customer', () => {
    expect(describeVariant(null)).toBeNull()
    expect(describeVariant({ ...row, products: null })).toBeNull()
  })
})
