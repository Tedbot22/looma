import { describe, expect, it } from 'vitest'
import { normalize, queryAlternatives, searchProducts, suggestQueries, tokenize } from './search'
import { makeProduct, makeVariant } from '../test/fixtures'

const names = (query: string, products: Parameters<typeof searchProducts>[0]) =>
  searchProducts(products, query).map((h) => h.item.name)

describe('text clean-up', () => {
  it('lower-cases, drops accents and turns punctuation into spaces', () => {
    expect(normalize('  Café-Tote, XL! ')).toBe('cafe tote xl')
  })

  it('trims plurals and ignores filler words', () => {
    expect(tokenize('The Jeans and dresses with pockets')).toEqual(['jean', 'dress', 'pocket'])
    expect(tokenize('accessories')).toEqual(['accessory'])
    expect(tokenize('bus')).toEqual(['bus']) // short words are left alone
  })
})

describe('queryAlternatives (what the database is asked for)', () => {
  it('gives one list per typed word, starting with the word itself', () => {
    const alts = queryAlternatives('black jackets')
    expect(alts).toHaveLength(2)
    expect(alts[0]).toEqual(['black'])
    expect(alts[1][0]).toBe('jacket')
    expect(alts[1]).toEqual(expect.arrayContaining(['coat', 'outerwear']))
  })

  it('is empty when nothing searchable was typed', () => {
    expect(queryAlternatives('')).toEqual([])
    expect(queryAlternatives('the and of')).toEqual([])
  })
})

describe('searchProducts', () => {
  const blackDenimJacket = makeProduct({ name: 'Black Denim Jacket', categories: { name: 'Outerwear' } })
  const blueDenimJacket = makeProduct({ name: 'Blue Denim Jacket', categories: { name: 'Outerwear' } })
  const cargoPants = makeProduct({ name: 'Cargo Pants', categories: { name: 'Bottoms' } })
  const all = [blackDenimJacket, blueDenimJacket, cargoPants]

  it('returns nothing for an empty or filler-only search', () => {
    expect(searchProducts(all, '')).toEqual([])
    expect(searchProducts(all, 'the of')).toEqual([])
  })

  it('needs every typed word to be found', () => {
    expect(names('black denim jacket', all)).toEqual(['Black Denim Jacket'])
    expect(names('denim jacket', all)).toEqual(['Black Denim Jacket', 'Blue Denim Jacket'])
    expect(names('black pants', all)).toEqual([])
  })

  it('finds words in the category, colour, size, details and description too', () => {
    const p = makeProduct({
      name: 'Plain Top',
      categories: { name: 'Blouses' },
      product_variants: [makeVariant({ color: 'Crimson', size: 'XXL' })],
      details: 'Material: linen',
      description: 'Perfect for harmattan evenings',
    })
    for (const q of ['blouse', 'crimson', 'xxl', 'linen', 'harmattan']) expect(names(q, [p]), q).toEqual(['Plain Top'])
  })

  it('ignores colours and sizes of variants that are switched off', () => {
    const p = makeProduct({ name: 'Plain Top', product_variants: [makeVariant({ color: 'Crimson', is_active: false })] })
    expect(names('crimson', [p])).toEqual([])
  })

  it('treats plurals and accents as the same word', () => {
    const p = makeProduct({ name: 'Café Tote Bag' })
    expect(names('cafe', [p])).toEqual(['Café Tote Bag'])
    expect(names('totes', [p])).toEqual(['Café Tote Bag'])
  })

  it('knows alternative words (trousers = pants)', () => {
    expect(names('trousers', all)).toEqual(['Cargo Pants'])
    expect(names('coat', all)).toEqual(['Black Denim Jacket', 'Blue Denim Jacket'])
  })

  it('completes the word still being typed, but only the last word', () => {
    expect(names('den', all)).toEqual(['Black Denim Jacket', 'Blue Denim Jacket'])
    expect(names('black j', all)).toEqual(['Black Denim Jacket']) // a single letter is fine once other words narrow it
    expect(names('den jacket', all)).toEqual([]) // "den" is not the word being typed, so it must be a whole word
    expect(names('j', all)).toEqual([]) // one lone letter matches too much to be useful
  })

  it('forgives one typo in words of five or more letters, not in short words', () => {
    expect(names('jaket', all)).toEqual(['Black Denim Jacket', 'Blue Denim Jacket'])
    expect(names('catgo', [cargoPants])).toEqual(['Cargo Pants'])
    expect(names('shoe', [makeProduct({ name: 'Fun Show Tee' })])).toEqual([])
  })

  it('ranks a name match above a description match', () => {
    const inName = makeProduct({ name: 'Denim Jacket' })
    const inDescription = makeProduct({ name: 'Mystery Top', description: 'Looks like a denim jacket' })
    expect(names('denim jacket', [inDescription, inName])).toEqual(['Denim Jacket', 'Mystery Top'])
  })

  it('ranks exact words above typos, and the whole phrase in the name highest', () => {
    const exact = makeProduct({ name: 'Denim Jacket' })
    const spread = makeProduct({ name: 'Jacket Denim Style' })
    expect(names('denim jacket', [spread, exact])).toEqual(['Denim Jacket', 'Jacket Denim Style'])
    const typo = makeProduct({ name: 'Jacket' })
    expect(names('jaket', [typo, makeProduct({ name: 'Jacket Two' })]).length).toBe(2)
  })

  it('keeps the given order when scores are equal', () => {
    const a = makeProduct({ name: 'Red Cap' })
    const b = makeProduct({ name: 'Red Cap' })
    const c = makeProduct({ name: 'Red Cap' })
    expect(searchProducts([c, a, b], 'red cap').map((h) => h.item)).toEqual([c, a, b])
  })

  it('says where a match came from and shows a snippet when the name does not explain it', () => {
    const p = makeProduct({ name: 'Mystery Top', details: 'Fit: oversized\nMaterial: soft linen blend' })
    const [hit] = searchProducts([p], 'linen')
    expect(hit.matchedIn).toEqual(['details'])
    expect(hit.snippet).toBe('Material: soft linen blend')
    const [byName] = searchProducts([makeProduct({ name: 'Linen Shirt', details: 'Material: linen' })], 'linen')
    expect(byName.snippet).toBeNull()
  })
})

describe('suggestQueries', () => {
  const products = [
    makeProduct({ name: 'Black Leather Jacket', category_id: 'outer', categories: { name: 'Outerwear' }, product_variants: [makeVariant({ color: 'Black' })] }),
    makeProduct({ name: 'Black Denim Jacket', category_id: 'outer', categories: { name: 'Outerwear' }, product_variants: [makeVariant({ color: 'Black' })] }),
    makeProduct({ name: 'Black Hoodie', category_id: 'tops', categories: { name: 'Tops' }, product_variants: [makeVariant({ color: 'Black' })] }),
  ]

  it('says nothing for a very short or unmatched search', () => {
    expect(suggestQueries(products, 'b')).toEqual([])
    expect(suggestQueries(products, 'zzzzz')).toEqual([])
  })

  it('finishes the word being typed and offers fuller phrases', () => {
    const phrases = suggestQueries(products, 'bla').filter((s) => !s.categoryId) // "in <category>" rows are separate
    const texts = phrases.map((s) => s.text)
    expect(texts).toContain('black')
    expect(texts).toContain('black leather jacket')
    expect(texts).not.toContain('bla') // never suggests exactly what was typed
  })

  it('adds "in <category>" rows when the matches span more than one category', () => {
    const rows = suggestQueries(products, 'black').filter((s) => s.categoryId)
    expect(rows.map((r) => r.categoryName)).toEqual(['Outerwear', 'Tops'])
    expect(suggestQueries([products[0], products[1]], 'black').some((s) => s.categoryId)).toBe(false)
  })

  it('never returns more than the limit', () => {
    expect(suggestQueries(products, 'black', 3).length).toBeLessThanOrEqual(3)
  })
})
