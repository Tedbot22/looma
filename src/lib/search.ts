// Product search shared by the search-box dropdown and the Shop page, so both give the same results
// in the same order.
//
// HOW IT WORKS
//  1. Each product is turned into searchable fields: name, category, colours and sizes, details,
//     description. Words are lower-cased, accents removed and plurals trimmed ("jeans" = "jean").
//  2. Every word the customer types must be found somewhere in the product (so "black denim jacket"
//     only shows items that mention black, denim and jacket, in any of the fields).
//  3. A word counts as found if it matches a product word exactly, as a start of a word ("den" finds
//     "denim"), as a known alternative ("trousers" finds "pants"), or with one typo ("jaket").
//  4. Products are ranked: a hit in the name counts most, then category, colour/size, details, and
//     last the description. Exact words beat starts of words, which beat typos.

// ---------- text clean-up ----------

// Lower-case, remove accents, turn punctuation into spaces.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Trim a plural so "sneakers" matches "sneaker" and "dresses" matches "dress". Short words are left alone.
function stem(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y'
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'with', 'in', 'of', 'to'])

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map(stem)
}

// ---------- alternative words ----------
// Words that mean the same thing in a clothing store. Add your own: each line is one group, and any
// word in a group finds the others. Keep them lower-case and singular.
const SYNONYM_GROUPS: string[][] = [
  ['pant', 'trouser', 'slack'],
  ['sneaker', 'trainer', 'kick'],
  ['shoe', 'footwear'],
  ['tee', 'tshirt', 't shirt', 'shirt'],
  ['jumper', 'sweater', 'pullover', 'knitwear'],
  ['hoodie', 'hoody'],
  ['jean', 'denim'],
  ['bag', 'handbag', 'purse'],
  ['gown', 'dress'],
  ['coat', 'jacket', 'outerwear'],
  ['cap', 'hat'],
  ['sandal', 'slide', 'slipper'],
  ['top', 'blouse'],
  ['trackpant', 'jogger', 'sweatpant'],
  ['short', 'bermuda'],
  ['vintage', 'retro', 'thrift'],
  ['grey', 'gray'],
  ['navy', 'dark blue'],
  ['beige', 'cream', 'nude'],
  ['xl', 'extra large'],
  ['xxl', '2xl'],
  ['s', 'small'],
  ['m', 'medium'],
  ['l', 'large'],
]

const SYNONYMS = new Map<string, Set<string>>()
for (const group of SYNONYM_GROUPS) {
  const words = group.map((g) => tokenize(g).join(' ')).filter(Boolean)
  for (const w of words) {
    const set = SYNONYMS.get(w) ?? new Set<string>()
    words.forEach((other) => other !== w && set.add(other))
    SYNONYMS.set(w, set)
  }
}

// ---------- typo tolerance ----------

// True when the two words differ by at most one letter added, removed, changed or swapped.
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0
  while (i < la && i < lb && a[i] === b[i]) i++
  if (i === la || i === lb) return true // one is the other plus one extra letter at the end
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true // one letter changed
    if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true // swapped
    return false
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

// ---------- searchable products ----------

type Field = 'name' | 'category' | 'variant' | 'details' | 'description'

// How much a hit in each field is worth.
const FIELD_WEIGHT: Record<Field, number> = {
  name: 10,
  category: 5,
  variant: 4,
  details: 3,
  description: 2,
}

// How the word matched, best first.
const MATCH_QUALITY = { exact: 1, synonym: 0.8, prefix: 0.7, typo: 0.5 } as const
type MatchKind = keyof typeof MATCH_QUALITY

export interface SearchableProduct {
  id: string
  name: string
  details: string | null
  description: string | null
  category_id?: string | null
  categories?: { name: string } | null
  product_variants: { color: string | null; size: string | null; is_active: boolean }[]
}

// Words for each field, worked out once per product (not once per keystroke).
const indexCache = new WeakMap<object, Record<Field, string[]>>()

function indexFields(p: SearchableProduct): Record<Field, string[]> {
  const cached = indexCache.get(p)
  if (cached) return cached
  const variants = p.product_variants.filter((v) => v.is_active)
  const fields: Record<Field, string[]> = {
    name: tokenize(p.name),
    category: tokenize(p.categories?.name ?? ''),
    variant: tokenize(variants.map((v) => `${v.color ?? ''} ${v.size ?? ''}`).join(' ')),
    details: tokenize(p.details ?? ''),
    description: tokenize(p.description ?? ''),
  }
  indexCache.set(p, fields)
  return fields
}

// How well one typed word matches one list of product words: the best match found, or null.
function matchWord(
  word: string,
  words: string[],
  isLast: boolean,
  minPrefix: number
): { kind: MatchKind; at: string } | null {
  let best: { kind: MatchKind; at: string } | null = null
  const consider = (kind: MatchKind, at: string) => {
    if (!best || MATCH_QUALITY[kind] > MATCH_QUALITY[best.kind]) best = { kind, at }
  }
  const alternatives = SYNONYMS.get(word)

  for (const w of words) {
    if (w === word) return { kind: 'exact', at: w }
    if (alternatives?.has(w)) consider('synonym', w)
    // Start of a word. Only for the word still being typed. A lone first letter would match nearly
    // everything, so it needs 2 letters, unless other words are already narrowing it down ("black j").
    else if (isLast && word.length >= minPrefix && w.startsWith(word)) consider('prefix', w)
    // One typo. Only for words of 5+ letters, because short words are too easy to mix up.
    else if (word.length >= 5 && withinOneEdit(word, w)) consider('typo', w)
  }
  return best
}

export interface SearchHit<T> {
  item: T
  score: number
  // Where the match came from, so the dropdown can say why an item showed up when the name doesn't show it.
  matchedIn: Field[]
  // A short piece of the details/description around the match, when the name alone doesn't explain it.
  snippet: string | null
}

// Finds the part of a longer text that holds the typed word, for showing under a suggestion.
function snippetFor(text: string | null, words: string[]): string | null {
  if (!text) return null
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    const lineWords = tokenize(line)
    if (words.some((w) => lineWords.some((lw) => lw === w || lw.startsWith(w)))) {
      return line.length > 70 ? line.slice(0, 67).trimEnd() + '…' : line
    }
  }
  return null
}

// Returns the products that match every typed word, best match first. An empty search returns nothing.
// Products with equal scores stay in the order given (the shop already sorts newest first).
export function searchProducts<T extends SearchableProduct>(products: T[], query: string): SearchHit<T>[] {
  const words = tokenize(query)
  if (words.length === 0) return []

  const hits: SearchHit<T>[] = []
  const minPrefix = words.length > 1 ? 1 : 2

  for (const item of products) {
    const fields = indexFields(item)
    let total = 0
    const matchedIn = new Set<Field>()
    let allFound = true

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const isLast = i === words.length - 1
      let bestForWord = 0

      for (const field of Object.keys(FIELD_WEIGHT) as Field[]) {
        const m = matchWord(word, fields[field], isLast, minPrefix)
        if (!m) continue
        const value = FIELD_WEIGHT[field] * MATCH_QUALITY[m.kind]
        if (value > bestForWord) bestForWord = value
        matchedIn.add(field)
      }

      if (bestForWord === 0) {
        allFound = false
        break
      }
      total += bestForWord
    }
    if (!allFound) continue

    // Small bonuses: the whole phrase appears in the name, or the name starts with it.
    const joinedName = normalize(item.name)
    const joinedQuery = normalize(query)
    if (joinedName.includes(joinedQuery)) total += 6
    if (joinedName.startsWith(joinedQuery)) total += 4

    const inName = matchedIn.has('name')
    const snippet = inName
      ? null
      : snippetFor(item.details, words) ?? snippetFor(item.description, words)

    hits.push({ item, score: total, matchedIn: [...matchedIn], snippet })
  }

  // Array.sort is stable, so equal scores keep the newest-first order.
  return hits.sort((a, b) => b.score - a.score)
}

// ---------- suggested searches ----------
// What the dropdown shows as you type: short phrases you could search for (like "black hoodie"), and
// "in <category>" rows that narrow the same words to one category. They are built from the items that
// really match, so a suggestion always leads to at least one result.

export interface QuerySuggestion {
  text: string // the words to search for
  categoryId?: string // set on an "in <category>" row
  categoryName?: string
}

export function suggestQueries<T extends SearchableProduct>(products: T[], query: string, limit = 8): QuerySuggestion[] {
  const typed = normalize(query)
  if (typed.length < 2) return []
  const typedWords = typed.split(' ')
  const last = typedWords[typedWords.length - 1]
  const head = typedWords.slice(0, -1).join(' ')

  const hits = searchProducts(products, query)
  if (hits.length === 0) return []

  const scores = new Map<string, number>()
  const add = (text: string, score: number) => {
    const t = text.trim()
    if (!t || t === typed) return
    scores.set(t, (scores.get(t) ?? 0) + score)
  }
  const withHead = (...words: string[]) => [head, ...words].filter(Boolean).join(' ')

  const categoryCounts = new Map<string, { name: string; count: number }>()

  for (const { item, score } of hits) {
    const nameWords = normalize(item.name).split(' ')
    const bonus = Math.min(score, 30) * 0.05

    // Finish the word being typed ("bla" -> "black"), and offer it together with the rest of the name
    // ("black leather jacket").
    nameWords.forEach((w, i) => {
      if (!w.startsWith(last) || STOP_WORDS.has(w)) return
      add(withHead(w), 3 + bonus)
      const tail = nameWords.slice(i, i + 3)
      if (tail.length > 1) add(withHead(...tail), 2 + bonus)
    })

    // Colours and the category name can finish the word too ("bla" -> "black").
    const extra = [
      ...(item.categories?.name ? normalize(item.categories.name).split(' ') : []),
      ...item.product_variants.filter((v) => v.is_active && v.color).flatMap((v) => normalize(v.color!).split(' ')),
    ]
    for (const w of extra) if (w.startsWith(last) && !STOP_WORDS.has(w)) add(withHead(w), 1.5 + bonus)

    // A close match with a different spelling or word ("jaket", "trousers") still gets its full name offered.
    if (hits.length <= 3 || scores.size < 3) add(nameWords.join(' '), 1 + bonus)

    if (item.category_id && item.categories?.name) {
      const c = categoryCounts.get(item.category_id) ?? { name: item.categories.name, count: 0 }
      c.count++
      categoryCounts.set(item.category_id, c)
    }
  }

  // "in <category>" rows, only when the matches are spread over more than one category.
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1].count - a[1].count)
  const categoryRows: QuerySuggestion[] =
    categories.length >= 2
      ? categories.slice(0, 2).map(([id, c]) => ({ text: typed, categoryId: id, categoryName: c.name }))
      : []

  // "black jacket" and "black jackets" are the same search, so only the better-scoring one is kept.
  const seen = new Set<string>()
  const phrases: QuerySuggestion[] = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .filter(([text]) => {
      const key = tokenize(text).join(' ')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit - categoryRows.length)
    .map(([text]) => ({ text }))

  return [...phrases, ...categoryRows]
}
