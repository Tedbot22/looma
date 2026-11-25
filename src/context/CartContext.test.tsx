// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cartApi from '../api/cart'
import type { CartItem } from '../lib/types'
import { CartProvider, useCart } from './CartContext'

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }))
vi.mock('./AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../api/cart', () => ({
  fetchCart: vi.fn(),
  mergeGuestCart: vi.fn(),
  saveCartItem: vi.fn(),
  setCartItemQuantity: vi.fn(),
  removeCartItem: vi.fn(),
  removeCartItems: vi.fn(),
  clearCart: vi.fn(),
}))
const api = vi.mocked(cartApi)

const line = (variantId: string, quantity: number, maxStock = 5): CartItem => ({
  variantId, productId: 'p', name: `Item ${variantId}`, variantLabel: 'Standard', price: 1000, image: null, quantity, maxStock,
})
const { quantity: _quantity, ...newItem } = line('new', 1, 3) // what a product card passes to addItem
void _quantity

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CartProvider>{children}</CartProvider>
    </QueryClientProvider>
  )
  return renderHook(() => useCart(), { wrapper })
}

beforeEach(() => {
  auth.user = null
  auth.loading = false
  localStorage.clear()
  api.fetchCart.mockResolvedValue([])
  api.mergeGuestCart.mockResolvedValue()
  for (const fn of [api.saveCartItem, api.setCartItemQuantity, api.removeCartItem, api.removeCartItems, api.clearCart]) fn.mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('guest cart', () => {
  it('lives in the browser and never calls the database', () => {
    const { result } = setup()
    act(() => result.current.addItem(newItem, 2))
    expect(result.current.items).toEqual([{ ...newItem, quantity: 2 }])
    expect(result.current.count).toBe(2)
    expect(result.current.total).toBe(2000)
    expect(JSON.parse(localStorage.getItem('thrift-cart')!)).toHaveLength(1)
    expect(api.fetchCart).not.toHaveBeenCalled()
    expect(api.saveCartItem).not.toHaveBeenCalled()
  })

  it('never lets the quantity pass the stock, and never below one', () => {
    const { result } = setup()
    act(() => result.current.addItem(newItem, 99)) // only 3 in stock
    expect(result.current.items[0].quantity).toBe(3)
    act(() => result.current.setQuantity('new', 0))
    expect(result.current.items[0].quantity).toBe(1)
    act(() => result.current.setQuantity('new', 50))
    expect(result.current.items[0].quantity).toBe(3)
  })
})

describe('logging in with a guest cart', () => {
  it('folds the guest cart into the account exactly once, even while it is still being saved and the screen redraws', async () => {
    localStorage.setItem('thrift-cart', JSON.stringify([line('v1', 2)]))
    auth.user = { id: 'u1' }
    // Keep the merge "in flight", the moment when extra redraws could wrongly start it again.
    let finishMerge!: () => void
    api.mergeGuestCart.mockReturnValue(new Promise<void>((resolve) => (finishMerge = resolve)))
    const { result, rerender } = setup()

    await waitFor(() => expect(api.mergeGuestCart).toHaveBeenCalledTimes(1))
    expect(api.mergeGuestCart).toHaveBeenCalledWith('u1', [line('v1', 2)])

    rerender()
    rerender()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)) // let the account cart load and redraw too
    })
    rerender()
    expect(api.mergeGuestCart).toHaveBeenCalledTimes(1)

    finishMerge()
    await waitFor(() => expect(localStorage.getItem('thrift-cart')).toBe('[]'))
    expect(api.mergeGuestCart).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)
  })
})

describe('logged-in cart', () => {
  beforeEach(() => {
    auth.user = { id: 'u1' }
    api.fetchCart.mockResolvedValue([line('old', 1)])
  })

  it('loads the account cart', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.items).toEqual([line('old', 1)]))
    expect(api.fetchCart).toHaveBeenCalledWith('u1')
  })

  it('shows a change straight away and saves it in the background', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    // Keep the save "in flight" so we can prove the screen changes before it finishes.
    let finishSave!: () => void
    api.saveCartItem.mockReturnValueOnce(new Promise<void>((resolve) => (finishSave = resolve)))
    await act(async () => result.current.addItem(newItem, 2))
    await waitFor(() =>
      expect(result.current.items.map((i) => [i.variantId, i.quantity])).toEqual([['old', 1], ['new', 2]])
    )
    expect(api.saveCartItem).toHaveBeenCalledWith('u1', 'new', 2)
    finishSave()

    await act(async () => result.current.setQuantity('old', 3))
    expect(api.setCartItemQuantity).toHaveBeenCalledWith('u1', 'old', 3)

    await act(async () => result.current.removeItem('old'))
    expect(api.removeCartItem).toHaveBeenCalledWith('u1', 'old')
    await waitFor(() => expect(result.current.items.map((i) => i.variantId)).toEqual(['new']))

    await act(async () => result.current.removeItems(['new']))
    expect(api.removeCartItems).toHaveBeenCalledWith('u1', ['new'])

    await act(async () => result.current.clear())
    expect(api.clearCart).toHaveBeenCalledWith('u1')
    await waitFor(() => expect(result.current.items).toEqual([]))
  })

  it('puts the screen right by reloading the cart when a save fails', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(api.fetchCart).toHaveBeenCalledTimes(1)

    api.saveCartItem.mockRejectedValueOnce(new Error('sold out meanwhile'))
    await act(async () => result.current.addItem(newItem, 1))

    await waitFor(() => expect(api.fetchCart).toHaveBeenCalledTimes(2)) // refetched to show the truth
  })
})
