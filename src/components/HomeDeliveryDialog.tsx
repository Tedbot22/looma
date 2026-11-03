import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import LocationFields from './LocationFields'
import { useAppSettings } from '../hooks/useAppSettings'
import type { AddressValues } from '../hooks/useAddresses'
import type { Place } from '../lib/geoapify'
import { formatKm, requestQuote, type Quote } from '../lib/delivery'
import { formatNaira } from '../lib/format'
import type { DeliveryZone } from '../lib/types'

interface Props {
  zone: DeliveryZone // the Home delivery option
  onSave: (values: AddressValues, quote: Quote) => Promise<void>
  onCancel: () => void
}

// Opens when the customer chooses "Home delivery". They search for their address, pick a suggestion,
// and see the delivery fee right away. Saving stores the address in their profile and the checkout
// menu selects it automatically. Cancelling changes nothing.
export default function HomeDeliveryDialog({ zone, onSave, onCancel }: Props) {
  const { data: settings } = useAppSettings()
  const [text, setText] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const [note, setNote] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const latest = useRef(0) // so a slow answer for an address they've since changed is ignored

  // Show suggestions near the store first.
  const originLat = Number(settings?.delivery_origin_lat)
  const originLon = Number(settings?.delivery_origin_lon)
  const bias = settings?.delivery_origin_lat && !Number.isNaN(originLat) ? { lat: originLat, lon: originLon } : undefined

  const valid = !!place && !!quote && !quoting

  // Escape closes the box, like Cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleTextChange(next: string) {
    setText(next)
    // Typing anything different from the chosen suggestion means they must choose again.
    if (place && next !== place.formatted) {
      setPlace(null)
      setQuote(null)
      setQuoteError(null)
      latest.current++
    }
  }

  async function handlePick(picked: Place) {
    setText(picked.formatted)
    setPlace(picked)
    setQuote(null)
    setQuoteError(null)
    setQuoting(true)
    const mine = ++latest.current

    try {
      // The server measures the route and works out the fee.
      const result = await requestQuote({ lat: picked.lat, lon: picked.lon, address: picked.formatted, note })
      if (mine === latest.current) setQuote(result)
    } catch (err) {
      if (mine === latest.current) setQuoteError((err as Error).message)
    } finally {
      if (mine === latest.current) setQuoting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !place || !quote) return
    setSaving(true)
    try {
      await onSave(
        { zoneId: zone.id, details: place.formatted, latitude: place.lat, longitude: place.lon, note },
        quote
      )
    } catch (err) {
      toast.error((err as Error).message)
      setSaving(false) // stay open so they can try again
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Home delivery address"
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">Home delivery</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500">
          Enter where we should deliver. It's saved to your profile, so next time it's one tap.
        </p>

        <LocationFields
          text={text}
          place={place}
          note={note}
          bias={bias}
          onTextChange={handleTextChange}
          onPick={handlePick}
          onNoteChange={setNote}
        />

        {/* The fee, as soon as an address is chosen */}
        {place && (
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            {quoting && <span className="text-gray-500">Calculating your delivery fee…</span>}
            {quote && (
              <span>
                <span className="font-semibold">{formatNaira(quote.fee)}</span>
                <span className="text-gray-500"> delivery · {formatKm(quote.distance_m)} from our store</span>
              </span>
            )}
            {quoteError && <span className="text-red-600">{quoteError}</span>}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={!valid || saving}
            className="flex-1 rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-5 py-3 font-medium hover:border-brand disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
