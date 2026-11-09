import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'

// The search box in the top bar. Pressing Enter takes you to the shop with your search. While you are
// already on the shop it updates the results as you type, keeping your category and price filter.
export default function HeaderSearch({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const onShop = pathname === '/shop' || pathname.startsWith('/shop/')
  const urlQuery = new URLSearchParams(search).get('q') ?? ''

  const [text, setText] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    go(text.trim(), false)
    inputRef.current?.blur()
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={`relative ${className}`}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
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
    </form>
  )
}
