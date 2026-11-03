import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { calculateFee } from '../../lib/delivery'
import { useAppSettings } from '../../hooks/useAppSettings'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import type { Place } from '../../lib/geoapify'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'

// The owner's inputs for the delivery fee:  fee = round( base + cost per km x distance , to a step )
export default function DistancePricingPanel() {
  const { data: settings } = useAppSettings()
  const queryClient = useQueryClient()

  // null = "not edited yet", so the saved value is shown.
  const [baseInput, setBaseInput] = useState<string | null>(null)
  const [perKmInput, setPerKmInput] = useState<string | null>(null)
  const [roundInput, setRoundInput] = useState<string | null>(null)
  const [originText, setOriginText] = useState<string | null>(null)
  const [origin, setOrigin] = useState<Place | null>(null) // set once a new store address is picked
  const [litresPerKm, setLitresPerKm] = useState('')
  const [pricePerLitre, setPricePerLitre] = useState('')
  const [saving, setSaving] = useState(false)

  const base = baseInput ?? settings?.delivery_base_fee ?? ''
  const perKm = perKmInput ?? settings?.delivery_cost_per_km ?? ''
  const roundTo = roundInput ?? settings?.delivery_round_to ?? ''
  const savedLabel = settings?.delivery_origin_label ?? ''
  const originBox = originText ?? savedLabel
  const originSet = !!settings?.delivery_origin_lat && !!settings?.delivery_origin_lon

  const changed =
    baseInput !== null || perKmInput !== null || roundInput !== null || origin !== null

  // A helper: work out cost per km from how much fuel the delivery vehicle uses.
  const fuelCost = Number(litresPerKm) * Number(pricePerLitre)
  const fuelCostValid = fuelCost > 0 && Number.isFinite(fuelCost)

  const b = Number(base)
  const p = Number(perKm)
  const r = Number(roundTo)
  const previewOk = base !== '' && perKm !== '' && !Number.isNaN(b) && !Number.isNaN(p) && !Number.isNaN(r)

  async function save() {
    if (base === '' || Number.isNaN(b) || b < 0) return toast.error('Enter a valid base fee.')
    if (perKm === '' || Number.isNaN(p) || p < 0) return toast.error('Enter a valid cost per kilometre.')
    if (roundTo === '' || Number.isNaN(r) || r < 0) return toast.error('Enter a valid rounding step (0 for none).')
    if (!originSet && !origin) return toast.error('Choose your store location first.')

    const rows = [
      { key: 'delivery_base_fee', value: String(b) },
      { key: 'delivery_cost_per_km', value: String(p) },
      { key: 'delivery_round_to', value: String(r) },
      ...(origin
        ? [
            { key: 'delivery_origin_label', value: origin.formatted },
            { key: 'delivery_origin_lat', value: String(origin.lat) },
            { key: 'delivery_origin_lon', value: String(origin.lon) },
          ]
        : []),
    ]

    setSaving(true)
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    setSaving(false)
    if (error) return toast.error(error.message)

    toast.success('Delivery pricing saved')
    setBaseInput(null)
    setPerKmInput(null)
    setRoundInput(null)
    setOriginText(null)
    setOrigin(null)
    queryClient.invalidateQueries({ queryKey: ['app-settings'] })
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold">Home delivery pricing</h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        The fee is worked out from the driving distance between your store and the customer's address:
        <br />
        <span className="font-mono text-xs">fee = base fee + (cost per km × distance), rounded</span>
      </p>

      {!originSet && !origin && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Set your store location below. Until you do, customers can't choose home delivery.
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Store location (where deliveries start)</label>
          <AddressAutocomplete
            value={originBox}
            onTextChange={(text) => {
              setOriginText(text)
              if (origin && text !== origin.formatted) setOrigin(null)
            }}
            onPick={(picked) => {
              setOriginText(picked.formatted)
              setOrigin(picked)
            }}
            placeholder="Search for your store's address…"
          />
          {origin ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
              <MapPin size={12} /> New location chosen. Press Save to use it.
            </p>
          ) : originSet ? (
            <p className="mt-1 text-xs text-gray-400">
              Saved location: {settings?.delivery_origin_lat}, {settings?.delivery_origin_lon}. Search to change it.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Base fee (₦)</label>
            <input className={inputClass} inputMode="decimal" value={base} onChange={(e) => setBaseInput(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Cost per km (₦)</label>
            <input className={inputClass} inputMode="decimal" value={perKm} onChange={(e) => setPerKmInput(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Round to (₦)</label>
            <input className={inputClass} inputMode="decimal" value={roundTo} onChange={(e) => setRoundInput(e.target.value)} />
          </div>
        </div>

        {/* Optional helper for the cost per km */}
        <details className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-gray-600">Work out cost per km from fuel</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Litres of fuel per km</label>
              <input className={inputClass} inputMode="decimal" placeholder="e.g. 0.025" value={litresPerKm} onChange={(e) => setLitresPerKm(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Fuel price per litre (₦)</label>
              <input className={inputClass} inputMode="decimal" placeholder="e.g. 1350" value={pricePerLitre} onChange={(e) => setPricePerLitre(e.target.value)} />
            </div>
          </div>
          {fuelCostValid && (
            <p className="mt-2 text-gray-600">
              That is <strong>{formatNaira(fuelCost)}</strong> per km ({fuelCost.toFixed(2)}).{' '}
              <button
                type="button"
                onClick={() => setPerKmInput(String(fuelCost))}
                className="font-medium text-brand underline"
              >
                Use this
              </button>
            </p>
          )}
        </details>

        {/* A live example, so the owner can sanity-check the numbers */}
        {previewOk && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <p className="mb-1 text-xs font-medium text-gray-500">Example fees with these numbers</p>
            <ul className="grid grid-cols-4 gap-2 text-center">
              {[2, 5, 10, 20].map((km) => (
                <li key={km} className="rounded-md bg-white px-2 py-1.5">
                  <p className="text-xs text-gray-400">{km} km</p>
                  <p className="font-semibold">{formatNaira(calculateFee(b, p, km, r))}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving || !changed}
        className="mt-4 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save pricing'}
      </button>
    </section>
  )
}
