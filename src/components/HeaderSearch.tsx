import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpLeft, Clock, Search, X } from 'lucide-react'
import { useSearchSuggestions } from '../hooks/useSearchSuggestions'
import { normalize } from '../lib/search'
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from '../lib/recentSearches'

// One line in the dropdown: something you could search for.
interface Row {
  kind: 'recent' | 'phrase' | 'category'
  text: string
  categoryId?: string
  categoryName?: string
}

// "bla" + "black hoodie" -> "bla" in normal weight and "ck hoodie" in bold, the way shopping apps do it.
function PhraseText({ text, typed }: { text: string; typed: string }) {
  const t = normalize(typed)
  if (t && text.toLowerCase().startsWith(t)) {
    return (
      <>
        <span>{text.slice(0, t.length)}</span>
        <strong className="font-semibold text-gray-900">{text.slice(t.length)}</strong>
      </>
    )
  }
  return <strong className="font-semibold text-gray-900">{text}</strong>
}

// The search box in the top bar. It suggests searches as you type (and your recent searches when the box
// is empty). Pressing Enter, or picking a suggestion, takes you to the shop with that search. While you
// are already on the shop it updates the results as you type, keeping your category and price filter.
export default function HeaderSearch({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const onShop = pathname === '/shop' || pathname.startsWith('/shop/')
  const urlQuery = new URLSearchParams(search).get('q') ?? ''

  const [text, setText] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLFormElement>(null)

  // Dropdown: open while the box is focused; -1 means no row highlighted.
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState<string[]>([])
  const { suggestions, loading, term } = useSearchSuggestions(text, open)

  const typing = text.trim().length >= 2
  const rows: Row[] = typing
    ? term !== ''
      ? suggestions.map((s) => ({ kind: s.categoryId ? ('category' as const) : ('phrase' as const), ...s }))
      : []
    : recent.map((r) => ({ kind: 'recent' as const, text: r }))
  // Nothing to suggest: still offer to search the typed words, so Enter-less taps work too.
  const fallback = typing && term !== '' && rows.length === 0 && !loading
  const showList = open && (rows.length > 0 || fallback)

  // Keep the box showing the current search when something else changes it (like "Clear all" on the
  // shop), but never overwrite what the person is in the middle of typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(urlQuery)
  }, [urlQuery, pathname])

  function go(term: string, replace: boolean, categoryId?: string) {
    // On the shop, keep the category and the price filter. From anywhere else, start a fresh search.
    const params = new URLSearchParams(onShop ? search : '')
    if (term) params.set('q', term)
    else params.delete('q')
    const queryString = params.toString()
    const target = categoryId ? `/shop/${categoryId}` : onShop ? pathname : '/shop'
    navigate({ pathname: target, search: queryString ? `?${queryString}` : '' }, { replace })
  }

  // The live-results timer below fires later, so it must use the newest values, not the ones from when
  // it was set (otherwise it could undo a suggestion that was just picked).
  const latest = useRef({ go, urlQuery })
  useEffect(() => {
    latest.current = { go, urlQuery }
  })

  // Live results while on the shop, after a short pause in typing.
  useEffect(() => {
    if (!onShop) return
    const timer = setTimeout(() => {
      const t = text.trim()
      if (t !== latest.current.urlQuery) latest.current.go(t, true)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // Close the dropdown when the person taps anywhere outside the search box.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => setActive(-1), [suggestions, typing, recent])

  function openList() {
    setRecent(getRecentSearches())
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setActive(-1)
    inputRef.current?.blur()
  }

  function search_(row: { text: string; categoryId?: string }) {
    setText(row.text)
    setRecent(addRecentSearch(row.text))
    go(row.text, false, row.categoryId)
    close()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Enter on a highlighted row searches that row; otherwise it searches the typed words.
    if (showList && active >= 0 && active < rows.length) {
      search_(rows[active])
      return
    }
    const t = text.trim()
    if (t) setRecent(addRecentSearch(t))
    go(t, false)
    close()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const count = rows.length
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'ArrowDown' && showList && count > 0) {
      e.preventDefault()
      setActive((a) => (a + 1) % count)
    } else if (e.key === 'ArrowUp' && showList && count > 0) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? count - 1 : a - 1))
    }
  }

  const rowClass = (i: number) =>
    `flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-gray-600 ${active === i ? 'bg-gray-100' : ''}`

  return (
    <form ref={boxRef} onSubmit={handleSubmit} role="search" className={`relative ${className}`}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (!open) openList()
        }}
        onFocus={openList}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `search-option-${active}` : undefined}
        autoComplete="off"
        placeholder="Search for items…"
        aria-label="Search for items"
        className="w-full rounded-full border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-10 text-sm outline-none focus:border-brand focus:bg-white"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            if (onShop) go('', true)
            inputRef.current?.focus()
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      )}

      {showList && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {!typing && rows.length > 0 && (
            <li role="presentation" className="flex items-center justify-between px-4 pb-1 pt-2 text-xs font-medium text-gray-400">
              Recent searches
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setRecent(clearRecentSearches())}
                className="text-gray-500 underline hover:text-gray-800"
              >
                Clear
              </button>
            </li>
          )}

          {rows.map((row, i) => (
            <li
              key={`${row.kind}-${row.text}-${row.categoryId ?? ''}`}
              id={`search-option-${i}`}
              role="option"
              aria-selected={active === i}
              onPointerDown={(e) => e.preventDefault()} // keep focus so the tap registers
              onClick={() => search_(row)}
              onMouseEnter={() => setActive(i)}
              className={rowClass(i)}
            >
              {row.kind === 'recent' ? (
                <Clock size={16} className="shrink-0 text-gray-400" />
              ) : (
                <Search size={16} className="shrink-0 text-gray-400" />
              )}

              <span className="min-w-0 flex-1 truncate">
                {row.kind === 'phrase' && <PhraseText text={row.text} typed={text} />}
                {row.kind === 'recent' && row.text}
                {row.kind === 'category' && (
                  <>
                    <span>{row.text}</span> <span className="text-gray-400">in</span>{' '}
                    <span className="font-semibold text-brand">{row.categoryName}</span>
                  </>
                )}
              </span>

              {row.kind === 'recent' ? (
                <button
                  type="button"
                  aria-label={`Remove ${row.text} from recent searches`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRecent(removeRecentSearch(row.text))
                  }}
                  className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-800"
                >
                  <X size={14} />
                </button>
              ) : (
                row.kind === 'phrase' && (
                  // Puts the suggestion in the box without searching, so you can keep typing from it.
                  <button
                    type="button"
                    aria-label={`Use ${row.text} in the search box`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setText(row.text + ' ')
                      inputRef.current?.focus()
                    }}
                    className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-800"
                  >
                    <ArrowUpLeft size={16} />
                  </button>
                )
              )}
            </li>
          ))}

          {fallback && (
            <li
              role="option"
              aria-selected={false}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => search_({ text: text.trim() })}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Search size={16} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">
                Search for “<strong className="font-semibold text-gray-900">{text.trim()}</strong>”
              </span>
            </li>
          )}
        </ul>
      )}
    </form>
  )
}
