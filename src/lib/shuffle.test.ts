import { describe, expect, it } from 'vitest'
import { seededUnit, shuffleBySeed, weightedShuffle } from './shuffle'

const items = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i}` }))

describe('seededUnit', () => {
  it('is always strictly between 0 and 1', () => {
    for (let seed = 0; seed < 200; seed++) {
      const u = seededUnit(seed, `id-${seed}`)
      expect(u).toBeGreaterThan(0)
      expect(u).toBeLessThan(1)
    }
  })

  it('is steady for the same seed and id, and varies with either', () => {
    expect(seededUnit(7, 'a')).toBe(seededUnit(7, 'a'))
    expect(seededUnit(7, 'a')).not.toBe(seededUnit(8, 'a'))
    expect(seededUnit(7, 'a')).not.toBe(seededUnit(7, 'b'))
  })
})

describe('shuffleBySeed', () => {
  it('keeps every item exactly once and does not touch the input', () => {
    const copy = [...items]
    const out = shuffleBySeed(items, 1)
    expect(out).toHaveLength(items.length)
    expect(new Set(out.map((i) => i.id))).toEqual(new Set(items.map((i) => i.id)))
    expect(items).toEqual(copy)
  })

  it('gives the same order for the same seed and a different one for another seed', () => {
    expect(shuffleBySeed(items, 5)).toEqual(shuffleBySeed(items, 5))
    expect(shuffleBySeed(items, 5)).not.toEqual(shuffleBySeed(items, 6))
  })
})

describe('weightedShuffle', () => {
  it('is steady for a seed, and keeps every item', () => {
    const w = () => 1
    expect(weightedShuffle(items, w, 3)).toEqual(weightedShuffle(items, w, 3))
    expect(weightedShuffle(items, w, 3)).toHaveLength(items.length)
  })

  it('puts heavily weighted items near the front far more often than light ones', () => {
    const heavy = 'item-0'
    const weight = (i: { id: string }) => (i.id === heavy ? 50 : 1)
    let heavyInTop5 = 0
    let lightInTop5 = 0
    const runs = 200
    for (let seed = 0; seed < runs; seed++) {
      const top = weightedShuffle(items, weight, seed).slice(0, 5).map((i) => i.id)
      if (top.includes(heavy)) heavyInTop5++
      if (top.includes('item-1')) lightInTop5++
    }
    expect(heavyInTop5 / runs).toBeGreaterThan(0.8) // ~97% expected
    expect(lightInTop5 / runs).toBeLessThan(0.3) // ~10% expected
  })

  it('still lets a light item reach the top sometimes (nothing is locked in)', () => {
    const weight = (i: { id: string }) => (i.id === 'item-0' ? 50 : 1)
    const firstIds = new Set<string>()
    for (let seed = 0; seed < 300; seed++) firstIds.add(weightedShuffle(items, weight, seed)[0].id)
    expect(firstIds.size).toBeGreaterThan(5)
  })
})
