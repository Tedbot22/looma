import { useState, type FormEvent } from 'react'
import LocationFields from './LocationFields'
import { useAppSettings } from '../hooks/useAppSettings'
import type { AddressValues } from '../hooks/useAddresses'
import type { Place } from '../lib/geoapify'
import type { DeliveryZone } from '../lib/types'

interface Props {
  zone: DeliveryZone // the Home delivery option
  initial?: { details: string; latitude: number; longitude: number; note: string; isDefault: boolean }
  submitLabel: string
  onSubmit: (values: AddressValues) => Promise<void>
  onCancel: () => void
}

// A small form to add or edit a saved home delivery address (shown on Edit profile).
export default function AddressForm({ zone, initial, submitLabel, onSubmit, onCancel }: Props) {
  const { data: settings } = useAppSettings()
  const [text, setText] = useState(initial?.details ?? '')
  // When editing, the address is already a chosen place. Typing something else clears it.
  const [place, setPlace] = useState<Place | null>(
    initial ? { formatted: initial.details, lat: initial.latitude, lon: initial.longitude } : null
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [saving, setSaving] = useState(false)

  const originLat = Number(settings?.delivery_origin_lat)
  const originLon = Number(settings?.delivery_origin_lon)
  const bias = settings?.delivery_origin_lat && !Number.isNaN(originLat) ? { lat: originLat, lon: originLon } : undefined

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!place) return
    setSaving(true)
    try {
      await onSubmit({
        zoneId: zone.id,
        details: place.formatted,
        latitude: place.lat,
        longitude: place.lon,
        note,
        isDefault,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <LocationFields
        text={text}
        place={place}
        note={note}
        bias={bias}
        onTextChange={(next) => {
          setText(next)
          if (place && next !== place.formatted) setPlace(null)
        }}
        onPick={(picked) => {
          setText(picked.formatted)
          setPlace(picked)
        }}
        onNoteChange={setNote}
      />

      {/* A customer's first address is made the default automatically. */}
      {!initial?.isDefault && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Make this my default address
        </label>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !place}
          className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium hover:border-brand"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
