import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useSearchSuggestions } from '../hooks/useSearchSuggestions'
import { formatNaira } from '../lib/format'

// The search box in the top bar. Pressing Enter takes you to the shop with your search. While you are
// already on the shop it updates the results as you type, keeping your category and price filter.
export default function HeaderSearch({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const onShop = pathname === '/shop' || pathname.startsWith('/shop/')
  const urlQuery = new URLSearchParams(search).get('q') ?? ''

  const [text, setText] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLFormElement>(null)

  // Autocomplete dropdown: open while the box is focused and has text; -1 means no row highlighted.
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const { suggestions, loading, term } = useSearchSuggestions(text, open)
  const showList = open && term !== '' && (suggestions.length > 0 || !loading)
  // Rows: each suggestion, then a final "See all results" row.
  const rowCount = suggestions.length + 1

  // Keep the box showing the current search when something else changes it (like "Clear all" on the
  // shop), but never overwrite what the person is in the middle of typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(urlQuery)
  }, [urlQuery, pathname])

  function go(term: string, replace: boolean) {
    // On the shop, keep the category and the price filter. From anywhere else, start a fresh search.
    const params = new URLSearchParams(onShop ? search : '')
    if (term) params.set('q', term)
    else params.delete('q')
    const queryString = params.toString()
    navigate({ pathname: onShop ? pathname : '/shop', search: queryString ? `?${queryString}` : '' }, { replace })
  }

  // Live results while on the shop, after a short pause in typing.
  useEffect(() => {
    if (!onShop) return
    const timer = setTimeout(() => {
      const term = text.trim()
      if (term !== urlQuery) go(term, true)
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

  useEffect(() => setActive(-1), [suggestions])

  function close() {
    setOpen(false)
    setActive(-1)
    inputRef.current?.blur()
  }

  function pickSuggestion(id: string) {
    close()
    navigate(`/product/${id}`)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Enter on a highlighted suggestion opens that item; otherwise it searches the typed words.
    if (showList && active >= 0 && active < suggestions.length) {
      pickSuggestion(suggestions[active].id)
      return
    }
    go(text.trim(), false)
    close()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'ArrowDown' && showList) {
      e.preventDefault()
      setActive((a) => (a + 1) % rowCount)
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? rowCount - 1 : a - 1))
    }
  }

  return (
    <form ref={boxRef} onSubmit={handleSubmit} role="search" className={`relative ${className}`}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
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
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`search-option-${i}`}
              role="option"
              aria-selected={active === i}
              onPointerDown={(e) => e.preventDefault()} // keep focus so the tap registers
              onClick={() => pickSuggestion(s.id)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${active === i ? 'bg-gray-100' : ''}`}
            >
              <span className="h-10 w-8 shrink-0 overflow-hidden rounded bg-gray-100">
                {s.image && <img src={s.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
              <span className="shrink-0 text-sm font-medium text-gray-600">{formatNaira(s.price)}</span>
            </li>
          ))}
          <li
            id={`search-option-${suggestions.length}`}
            role="option"
            aria-selected={active === suggestions.length}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              go(text.trim(), false)
              close()
            }}
            onMouseEnter={() => setActive(suggestions.length)}
            className={`cursor-pointer border-t border-gray-100 px-3 py-2.5 text-sm font-medium text-brand ${
              active === suggestions.length ? 'bg-gray-100' : ''
            }`}
          >
            {suggestions.length === 0 ? `No matches. Search all for “${text.trim()}”` : `See all results for “${text.trim()}”`}
          </li>
        </ul>
      )}
    </form>
  )
}
