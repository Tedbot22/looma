import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { NavLink, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import { fetchSearchCandidates, fetchShopPage, SEARCH_CANDIDATE_LIMIT, SHOP_PAGE_SIZE } from '../api/shop'
import { formatNaira } from '../lib/format'
import { searchProducts } from '../lib/search'
import { pageTitle, useSeo } from '../lib/seo'
import { STORE_NAME } from '../config'
import ProductCard from '../components/ProductCard'
import { PRODUCT_GRID } from '../lib/layout'
import { ChipsSkeleton, ProductGridSkeleton } from '../components/Skeleton'
import { fetchCategories } from '../api/catalog'
import { queryKeys } from '../api/queryKeys'

const chipClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'border-brand bg-brand text-white'
      : 'border-gray-200 text-gray-600 hover:border-brand'
  }`

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand'

// Handy one-tap price ranges.
const QUICK_RANGES = [
  { label: 'Under ₦2,000', min: '', max: '2000' },
  { label: '₦2,000 to ₦5,000', min: '2000', max: '5000' },
  { label: '₦5,000 to ₦10,000', min: '5000', max: '10000' },
  { label: 'Over ₦10,000', min: '10000', max: '' },
]

// "" -> no limit; a valid amount -> number; anything else -> null (ignored)
const toNumber = (value: string): number | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function Shop() {
  // The category comes from the path (/shop or /shop/<categoryId>).
  // The search words (typed in the top bar) and the price range live in the address
  // (?q=...&min=...&max=...), so a search can be shared and survives the back button.
  const { categoryId } = useParams()
  const { search } = useLocation()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const minParam = params.get('min') ?? ''
  const maxParam = params.get('max') ?? ''
  const minNum = toNumber(minParam)
  const maxNum = toNumber(maxParam)
  const hasPrice = minNum !== null || maxNum !== null

  // A new random number every time the shop page opens. The database uses it for the shuffle, so the
  // order stays the same from one page of results to the next.
  const [shuffleSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647))

  const [panelOpen, setPanelOpen] = useState(false)
  const [minInput, setMinInput] = useState(minParam)
  const [maxInput, setMaxInput] = useState(maxParam)
  const [filterError, setFilterError] = useState<string | null>(null)

  function applyPrice(min: string, max: string) {
    const a = toNumber(min)
    const b = toNumber(max)
    if ((min.trim() !== '' && a === null) || (max.trim() !== '' && b === null)) {
      setFilterError('Please enter valid amounts.')
      return
    }
    if (a !== null && b !== null && a > b) {
      setFilterError("The lowest price can't be higher than the highest price.")
      return
    }
    setFilterError(null)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (a !== null) next.set('min', String(a))
        else next.delete('min')
        if (b !== null) next.set('max', String(b))
        else next.delete('max')
        return next
      },
      { replace: true }
    )
    setPanelOpen(false)
  }

  function clearAll() {
    setMinInput('')
    setMaxInput('')
    setFilterError(null)
    setParams({}, { replace: true })
  }

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories(), // same key as Home and the footer, so it's cached and not refetched
    queryFn: fetchCategories,
  })

  const term = q.replace(/\s+/g, ' ').trim()
  const searching = term !== ''
  const filters = useMemo(() => ({ categoryId: categoryId ?? null, min: minNum, max: maxNum }), [categoryId, minNum, maxNum])

  // BROWSING (no search words): the database sends one page at a time, in the shop's usual shuffled order
  // (newer and discounted items nudged up). More pages load as you scroll.
  const browse = useInfiniteQuery({
    queryKey: queryKeys.products.shop(categoryId ?? null, minNum, maxNum, shuffleSeed),
    enabled: !searching,
    initialPageParam: 0,
    placeholderData: keepPreviousData, // keep showing the last results while new ones load
    queryFn: ({ pageParam }) => fetchShopPage(shuffleSeed, filters, pageParam),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.items.length, 0)
      return last.items.length > 0 && loaded < last.total ? loaded : undefined
    },
  })

  // SEARCHING: the database finds every item that could match the words. They are then ranked on the device
  // (see lib/search.ts: name first, then category, colour and size, details, description, with typos and
  // alternative words allowed) and shown a page at a time.
  const candidates = useQuery({
    queryKey: queryKeys.products.search(term, categoryId ?? null, minNum, maxNum),
    enabled: searching,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchSearchCandidates(term, filters),
  })
  // Ranking 120 items is quick, and the words of each item are remembered by searchProducts() itself.
  const ranked = candidates.data ? searchProducts(candidates.data, term).map((h) => h.item) : undefined

  // How many ranked search results are on screen. It starts again whenever the search or filters change.
  const resetKey = [term, categoryId ?? '', minNum, maxNum].join('|')
  const [shownState, setShownState] = useState({ key: resetKey, count: SHOP_PAGE_SIZE })
  const shown = shownState.key === resetKey ? shownState.count : SHOP_PAGE_SIZE

  const browsed = useMemo(() => {
    if (!browse.data) return undefined
    // A new item added while you scroll can move things by one place, so make sure none shows twice.
    const seen = new Map(browse.data.pages.flatMap((page) => page.items).map((p) => [p.id, p]))
    return [...seen.values()]
  }, [browse.data])

  const products = searching ? ranked?.slice(0, shown) : browsed
  const totalFound = searching ? ranked?.length : browse.data?.pages[0]?.total
  const capped = searching && (candidates.data?.length ?? 0) >= SEARCH_CANDIDATE_LIMIT
  const hasMore = searching ? (ranked?.length ?? 0) > shown : Boolean(browse.hasNextPage)
  const isLoading = searching ? candidates.isLoading : browse.isLoading
  const isPlaceholderData = searching ? candidates.isPlaceholderData : browse.isPlaceholderData
  const loadingMore = !searching && browse.isFetchingNextPage
  const error = searching ? candidates.error : browse.error

  const loadMore = () => {
    if (searching) setShownState({ key: resetKey, count: shown + SHOP_PAGE_SIZE })
    else if (!browse.isFetchingNextPage) void browse.fetchNextPage()
  }

  // Load the next page just before the bottom of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && !isPlaceholderData) loadMore()
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  })

  const filtering = term !== '' || hasPrice

  // A category page gets its own title for Google (the plain /shop page is handled in RouteSeo).
  const category = categoryId ? categories?.find((c) => c.id === categoryId) : undefined
  useSeo(
    category
      ? {
          title: pageTitle(`${category.name} | Thrift Clothing`),
          description: `Shop thrift ${category.name.toLowerCase()} at ${STORE_NAME}. Affordable proces delivered in Nigeria.`,
          path: `/shop/${category.id}`,
          noindex: filtering,
        }
      : null
  )
  const priceLabel =
    minNum !== null && maxNum !== null
      ? `${formatNaira(minNum)} to ${formatNaira(maxNum)}`
      : minNum !== null
        ? `${formatNaira(minNum)} and above`
        : maxNum !== null
          ? `Up to ${formatNaira(maxNum)}`
          : ''

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{term ? `Results for “${q.trim()}”` : (category?.name ?? 'All ')}</h1>

        <button
          type="button"
          onClick={() => {
            setMinInput(minParam)
            setMaxInput(maxParam)
            setFilterError(null)
            setPanelOpen((open) => !open)
          }}
          aria-expanded={panelOpen}
          className={`flex shrink-0 items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium ${
            hasPrice || panelOpen ? 'border-brand text-brand' : 'border-gray-200 text-gray-600 hover:border-brand'
          }`}
        >
          <SlidersHorizontal size={16} />
          Filter
          {hasPrice && <span className="h-2 w-2 rounded-full bg-brand" aria-label="Filter active" />}
        </button>
      </div>

      {panelOpen && (
        <div className="mb-5 max-w-xl rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-3 text-sm font-semibold">Price (₦)</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Lowest</label>
              <input className={inputClass} inputMode="numeric" placeholder="0" value={minInput} onChange={(e) => setMinInput(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Highest</label>
              <input className={inputClass} inputMode="numeric" placeholder="No limit" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  setMinInput(r.min)
                  setMaxInput(r.max)
                  applyPrice(r.min, r.max)
                }}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-brand hover:text-brand"
              >
                {r.label}
              </button>
            ))}
          </div>

          {filterError && <p className="mt-3 text-sm text-red-600">{filterError}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => applyPrice(minInput, maxInput)}
              className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-light"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setMinInput('')
                setMaxInput('')
                applyPrice('', '')
              }}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:border-brand"
            >
              Clear price
            </button>
          </div>
        </div>
      )}

      {/* Category chips (scrollable on small screens). They keep the search and price filter. */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <NavLink to={`/shop${search}`} end className={chipClass}>
          All
        </NavLink>
        {categories ? (
          categories.map((c) => (
            <NavLink key={c.id} to={`/shop/${c.id}${search}`} className={chipClass}>
              {c.name}
            </NavLink>
          ))
        ) : (
          <ChipsSkeleton count={4} />
        )}
      </div>

      {/* What is being applied, with a way to remove it */}
      {filtering && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          {hasPrice && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-2 text-gray-700">
              {priceLabel}
              <button
                type="button"
                aria-label="Remove price filter"
                onClick={() => {
                  setMinInput('')
                  setMaxInput('')
                  applyPrice('', '')
                }}
                className="rounded-full p-0.5 text-gray-400 hover:text-gray-800"
              >
                <X size={14} />
              </button>
            </span>
          )}
          <button type="button" onClick={clearAll} className="font-medium text-brand underline">
            Clear search and filters
          </button>
          {totalFound !== undefined && (
            <span className="text-gray-500">
              · {totalFound}
              {capped ? '+' : ''} {totalFound === 1 ? 'item' : 'items'} found
            </span>
          )}
        </div>
      )}

      {isLoading && <ProductGridSkeleton />}
      {error && <p className="text-red-600">Couldn't load products: {(error as Error).message}</p>}

      {products && products.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-500">{filtering ? 'No items match your search.' : 'Nothing here yet. Check back soon!'}</p>
          {filtering && (
            <button type="button" onClick={clearAll} className="mt-3 font-medium text-brand underline">
              Clear search and filters
            </button>
          )}
        </div>
      )}

      <div
        className={`${PRODUCT_GRID} transition-opacity ${
          isPlaceholderData ? 'opacity-60' : ''
        }`}
      >
        {products?.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinel} className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:border-brand disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
      {capped && !hasMore && (
        <p className="mt-6 text-center text-sm text-gray-500">
          Showing the best matches. Add another word to narrow the search.
        </p>
      )}
    </div>
  )
}
