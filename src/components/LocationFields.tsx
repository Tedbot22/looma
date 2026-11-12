import AddressAutocomplete from './AddressAutocomplete'
import type { Place } from '../lib/geoapify'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand'

interface Props {
  text: string // what is typed in the address box
  place: Place | null // the suggestion the customer picked (null until they pick one)
  note: string
  bias?: { lat: number; lon: number }
  onTextChange: (text: string) => void
  onPick: (place: Place) => void
  onNoteChange: (note: string) => void
}

// The fields for a home delivery address: a searchable address, plus an optional landmark note.
export default function LocationFields({ text, place, note, bias, onTextChange, onPick, onNoteChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Delivery address</label>
        <AddressAutocomplete
          value={text}
          onTextChange={onTextChange}
          onPick={onPick}
          bias={bias}
          placeholder="e.g Ada George Road, Port-Harcourt"
        />
        {text.trim().length > 0 && !place ? (
          <p className="hidden mt-1 text-xs text-amber-600">Select your address from the suggestions.</p>
        ) : (
          <p className="hidden mt-1 text-xs text-gray-400 ">Start typing and select your address from the suggestions.</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Landmark or directions <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          className={inputClass}
          value={note}
          maxLength={300}
          placeholder="e.g. Blue gate, second floor"
          onChange={(e) => onNoteChange(e.target.value)}
        />
      </div>
    </div>
  )
}
