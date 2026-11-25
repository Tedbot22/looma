import { describe, expect, it } from 'vitest'
import { dailyDealsList, FRESH_BLOCK } from './dailyDeals'
import { LEAD_BLOCK, todaysDealsList } from './todaysDeals'
import { daysAgo, makeProduct, makeVariant, soldOut } from '../test/fixtures'

// 40 in-stock products, one a day older than the last. Every 4th is 30% off.
const NOW = Date.UTC(2026, 5, 15)
const catalogue = Array.from({ length: 40 }, (_, i) =>
  makeProduct({
    name: `Item ${i}`,
    created_at: daysAgo(i, NOW),
    price: 7000,
    compare_at_price: i % 4 === 0 ? 10000 : null,
    product_variants: [makeVariant({ stock: 2 })],
  })
)
const ids = (list: { id: string }[]) => list.map((p) => p.id)

describe("today's deals", () => {
  it('shows each in-stock item exactly once and hides sold-out ones', () => {
    const withSoldOut = [...catalogue, soldOut({ name: 'Gone' }), soldOut({ name: 'Also gone' })]
    const list = todaysDealsList(withSoldOut, 1)
    expect(list).toHaveLength(catalogue.length)
    expect(new Set(ids(list)).size).toBe(catalogue.length)
    expect(list.some((p) => p.name.includes('gone') || p.name === 'Gone')).toBe(false)
  })

  it('keeps the same order for the same seed and reshuffles for another', () => {
    expect(ids(todaysDealsList(catalogue, 11))).toEqual(ids(todaysDealsList(catalogue, 11)))
    expect(ids(todaysDealsList(catalogue, 11))).not.toEqual(ids(todaysDealsList(catalogue, 12)))
  })

  it('does not change the list it was given', () => {
    const before = ids(catalogue)
    todaysDealsList(catalogue, 3)
    expect(ids(catalogue)).toEqual(before)
  })

  it('works through a lead block that includes big markdowns', () => {
    const lead = todaysDealsList(catalogue, 5).slice(0, LEAD_BLOCK)
    expect(lead).toHaveLength(LEAD_BLOCK)
    const markdowns = lead.slice(0, 6).filter((p) => p.compare_at_price !== null)
    expect(markdowns.length).toBeGreaterThanOrEqual(2) // two of the first six turns are reserved for markdowns
  })

  it('still fills the list when there are no markdowns at all', () => {
    const plain = catalogue.map((p) => ({ ...p, compare_at_price: null }))
    expect(todaysDealsList(plain, 5)).toHaveLength(catalogue.length)
  })

  it('handles an empty or tiny catalogue', () => {
    expect(todaysDealsList([], 1)).toEqual([])
    expect(todaysDealsList([catalogue[0]], 1)).toEqual([catalogue[0]])
  })
})

describe('daily deals', () => {
  it('leads with the newest items, newest first', () => {
    const list = dailyDealsList([...catalogue].reverse(), NOW)
    expect(ids(list.slice(0, FRESH_BLOCK))).toEqual(ids(catalogue.slice(0, FRESH_BLOCK)))
  })

  it('shows each in-stock item once and skips sold-out ones', () => {
    const list = dailyDealsList([...catalogue, soldOut()], NOW)
    expect(list).toHaveLength(catalogue.length)
    expect(new Set(ids(list)).size).toBe(catalogue.length)
  })

  it('is steady within a day and mixes the older stock differently the next day', () => {
    const today = ids(dailyDealsList(catalogue, NOW))
    expect(ids(dailyDealsList(catalogue, NOW + 3_600_000))).toEqual(today) // an hour later, same day
    expect(ids(dailyDealsList(catalogue, NOW + 86_400_000))).not.toEqual(today)
  })
})
