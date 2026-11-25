// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as wishlistApi from '../api/wishlist'
import type { WishlistItem } from '../lib/types'
import { useWishlist, WishlistProvider } from './WishlistContext'

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }))
vi.mock('./AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../api/wishlist', () => ({
  fetchWishlist: vi.fn(),
  mergeGuestWishlist: vi.fn(),
  saveWishlistItem: vi.fn(),
  removeWishlistItem: vi.fn(),
}))
const api = vi.mocked(wishlistApi)

const item = (variantId: string): WishlistItem => ({ variantId, productId: 'p', name: `Item ${variantId}`, variantLabel: 'Standard', price: 1000, image: null })

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WishlistProvider>{children}</WishlistProvider>
    </QueryClientProvider>
  )
  return renderHook(() => useWishlist(), { wrapper })
}

beforeEach(() => {
  auth.user = null
  auth.loading = false
  localStorage.clear()
  api.fetchWishlist.mockResolvedValue([])
  api.mergeGuestWishlist.mockResolvedValue()
  api.saveWishlistItem.mockResolvedValue()
  api.removeWishlistItem.mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('guest wishlist', () => {
  it('lives in the browser, newest first, and ignores a second "add" of the same item', () => {
    const { result } = setup()
    act(() => result.current.add(item('a')))
    act(() => result.current.add(item('b')))
    act(() => result.current.add(item('a')))
    expect(result.current.items.map((i) => i.variantId)).toEqual(['b', 'a'])
    expect(result.current.has('a')).toBe(true)
    expect(JSON.parse(localStorage.getItem('thrift-wishlist')!)).toHaveLength(2)
    expect(api.saveWishlistItem).not.toHaveBeenCalled()
  })

  it('toggle adds, then removes', () => {
    const { result } = setup()
    act(() => result.current.toggle(item('a')))
    expect(result.current.has('a')).toBe(true)
    act(() => result.current.toggle(item('a')))
    expect(result.current.has('a')).toBe(false)
  })
})

describe('logging in with a guest wishlist', () => {
  it('folds it into the account exactly once, even while it is being saved and the screen redraws', async () => {
    localStorage.setItem('thrift-wishlist', JSON.stringify([item('v1')]))
    auth.user = { id: 'u1' }
    let finishMerge!: () => void
    api.mergeGuestWishlist.mockReturnValue(new Promise<void>((resolve) => (finishMerge = resolve)))
    const { rerender } = setup()

    await waitFor(() => expect(api.mergeGuestWishlist).toHaveBeenCalledTimes(1))
    expect(api.mergeGuestWishlist).toHaveBeenCalledWith('u1', [item('v1')])
    rerender()
    rerender()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(api.mergeGuestWishlist).toHaveBeenCalledTimes(1)

    finishMerge()
    await waitFor(() => expect(localStorage.getItem('thrift-wishlist')).toBe('[]'))
    expect(api.mergeGuestWishlist).toHaveBeenCalledTimes(1)
  })
})

describe('logged-in wishlist', () => {
  beforeEach(() => {
    auth.user = { id: 'u1' }
    api.fetchWishlist.mockResolvedValue([item('old')])
  })

  it('loads the account wishlist, shows changes at once and saves them in the background', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.items.map((i) => i.variantId)).toEqual(['old']))
    expect(api.fetchWishlist).toHaveBeenCalledWith('u1')

    let finishSave!: () => void
    api.saveWishlistItem.mockReturnValueOnce(new Promise<void>((resolve) => (finishSave = resolve)))
    await act(async () => result.current.add(item('new')))
    await waitFor(() => expect(result.current.items.map((i) => i.variantId)).toEqual(['new', 'old']))
    expect(api.saveWishlistItem).toHaveBeenCalledWith('u1', 'new')
    finishSave()

    await act(async () => result.current.remove('old'))
    expect(api.removeWishlistItem).toHaveBeenCalledWith('u1', 'old')
    await waitFor(() => expect(result.current.items.map((i) => i.variantId)).toEqual(['new']))
  })

  it('reloads the list from the database when a save fails', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(api.fetchWishlist).toHaveBeenCalledTimes(1)

    api.saveWishlistItem.mockRejectedValueOnce(new Error('network down'))
    await act(async () => result.current.add(item('new')))
    await waitFor(() => expect(api.fetchWishlist).toHaveBeenCalledTimes(2))
  })
})
