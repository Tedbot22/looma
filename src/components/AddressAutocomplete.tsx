import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MapPin } from 'lucide-react'
import { GEOAPIFY_KEY, searchAddresses, type Place } from '../lib/geoapify'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand'

interface Props {
  value: string // what is typed in the box
  onTextChange: (text: string) => void
  onPick: (place: Place) => void // the customer chose a suggestion
  bias?: { lat: number; lon: number } // show results near here first (the store)
  placeholder?: string
}

// A text box that suggests real addresses as you type (Geoapify). Choosing a suggestion gives
// us the address's exact longitude and latitude, which is what the delivery fee is based on.
export default function AddressAutocomplete({ value, onTextChange, onPick, bias, placeholder }: Props) {
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const justPicked = useRef(false)

  const text = value.trim()
  const canSearch = !!GEOAPIFY_KEY && text.length >= 3

  useEffect(() => {
    // Picking a suggestion fills the box with its text; don't search for that again.
    if (justPicked.current) {
      justPicked.current = false
      return
    }
    if (!canSearch) return

    const controller = new AbortController()
    // Wait for a short pause in typing, so we don't search on every keystroke.
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchAddresses(text, controller.signal, bias))
        setActive(-1)
        setOpen(true)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 0)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, canSearch, bias?.lat, bias?.lon])

  function pick(place: Place) {
    justPicked.current = true
    setOpen(false)
    setResults([])
    onPick(place)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault() // don't submit the form: choose the highlighted address
      pick(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  if (!GEOAPIFY_KEY) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Address search isn't set up yet (missing VITE_GEOAPIFY_KEY).
      </p>
    )
  }

  const showList = open && canSearch && results.length > 0

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
      />

      {loading && <span className="absolute right-3 top-3 text-xs text-gray-400">Searching…</span>}

      {showList && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {results.map((p, i) => (
            <li
              key={`${p.lat},${p.lon},${p.formatted}`}
              role="option"
              aria-selected={i === active}
              // mouse-down (not click) so it happens before the box loses focus and the list closes
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
              <span>{p.formatted}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
