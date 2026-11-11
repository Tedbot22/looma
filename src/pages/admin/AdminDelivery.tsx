import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import type { DeliveryZone } from '../../lib/types'
import { parseLatLon } from '../../lib/coordinates'
import DistancePricingPanel from './DistancePricingPanel'

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'

function friendly(err: { code?: string; message: string }) {
  return err.code === '23505' ? 'An option with that name already exists.' : err.message
}

// One delivery option: rename it, change its fee, or switch it off.
function ZoneCard({ zone, onChanged }: { zone: DeliveryZone; onChanged: () => void }) {
  const [name, setName] = useState(zone.name)
  const [fee, setFee] = useState(String(zone.fee))
  const savedLoc = zone.latitude != null && zone.longitude != null ? `${zone.latitude}, ${zone.longitude}` : ''
  const [loc, setLoc] = useState(savedLoc)
  const [busy, setBusy] = useState(false)

  const isHome = zone.kind === 'home'
  // Home delivery is priced by distance, so it has no flat fee to edit.
  const changed = name.trim() !== zone.name || (!isHome && (Number(fee) !== Number(zone.fee) || loc.trim() !== savedLoc))

  async function save() {
    const feeNumber = Number(fee)
    if (!name.trim()) return toast.error('Please enter a name.')
    if (!isHome && (fee === '' || Number.isNaN(feeNumber) || feeNumber < 0)) return toast.error('Enter a valid fee (0 or more).')

    let point: { lat: number; lon: number } | null = null
    if (!isHome && loc.trim()) {
      point = parseLatLon(loc)
      if (!point) return toast.error('Location not understood. Paste it like 4.9009, 6.9063 or 4°54\'03.3"N 6°54\'22.7"E.')
    }

    setBusy(true)
    const { error } = await supabase
      .from('delivery_zones')
      .update(
        isHome
          ? { name: name.trim() }
          : { name: name.trim(), fee: feeNumber, latitude: point?.lat ?? null, longitude: point?.lon ?? null }
      )
      .eq('id', zone.id)
    setBusy(false)
    if (error) return toast.error(friendly(error))
    toast.success('Saved')
    onChanged()
  }

  async function toggleActive() {
    setBusy(true)
    const { error } = await supabase.from('delivery_zones').update({ is_active: !zone.is_active }).eq('id', zone.id)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(zone.is_active ? 'Switched off. Customers can no longer choose it.' : 'Switched on.')
    onChanged()
  }

  return (
    <li className={`rounded-xl border p-4 ${zone.is_active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {isHome ? 'Home delivery' : 'Campus delivery'}
      </p>

      <div className={isHome ? '' : 'grid grid-cols-[1fr_7rem] gap-3'}>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!isHome && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Fee (₦)</label>
            <input className={inputClass} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        )}
      </div>
      {!isHome && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-500">Delivery location (latitude, longitude)</label>
          <input
            className={inputClass}
            placeholder={`4.9009, 6.9063  or  4°54'03.3"N 6°54'22.7"E`}
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
          />
        </div>
      )}
      {isHome && <p className="mt-2 text-xs text-gray-500">The fee is worked out from the distance (see pricing above).</p>}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={toggleActive}
          disabled={busy}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand disabled:opacity-60"
        >
          {zone.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
          {zone.is_active ? 'Available to customers' : 'Switched off'}
        </button>
        <button
          onClick={save}
          disabled={busy || !changed}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </li>
  )
}

export default function AdminDelivery() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newFee, setNewFee] = useState('')
  const [newLoc, setNewLoc] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: zones, isLoading, error } = useQuery({
    queryKey: ['admin-zones'],
    queryFn: async (): Promise<DeliveryZone[]> => {
      // The admin's access rules let the owner see switched-off options too.
      const { data, error } = await supabase.from('delivery_zones').select('*').order('sort_order')
      if (error) throw error
      return data as DeliveryZone[]
    },
  })

  // Customers' pages cache these lists, so refresh them everywhere after a change.
  const refresh = () =>
    Promise.all(
      ['admin-zones', 'delivery-zones', 'addresses'].map((k) => queryClient.invalidateQueries({ queryKey: [k] }))
    )

  async function addCampus() {
    const feeNumber = Number(newFee)
    if (!newName.trim()) return toast.error('Please enter a name.')
    if (newFee === '' || Number.isNaN(feeNumber) || feeNumber < 0) return toast.error('Enter a valid fee (0 or more).')

    let point: { lat: number; lon: number } | null = null
    if (newLoc.trim()) {
      point = parseLatLon(newLoc)
      if (!point) return toast.error('Location not understood. Paste it like 4.9009, 6.9063 or 4°54\'03.3"N 6°54\'22.7"E.')
    }

    setAdding(true)
    const nextOrder = Math.max(0, ...(zones ?? []).map((z) => z.sort_order)) + 1
    const { error } = await supabase
      .from('delivery_zones')
      .insert({ name: newName.trim(), fee: feeNumber, kind: 'campus', sort_order: nextOrder, latitude: point?.lat ?? null, longitude: point?.lon ?? null })
    setAdding(false)
    if (error) return toast.error(friendly(error))

    toast.success('Campus added')
    setNewName('')
    setNewFee('')
    setNewLoc('')
    refresh()
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-bold">Delivery</h1>
      <p className="mb-5 mt-1 text-sm text-gray-500">
        Customers choose a <strong>campus</strong> (a ready-made option with a flat fee) or <strong>home delivery</strong>{' '}
        (the customer enters an address, and the fee follows the distance). Switch an option off instead of deleting
        it, so customers' saved addresses and past orders stay intact.
      </p>

      <DistancePricingPanel />

      <h2 className="mb-3 font-semibold">Delivery options</h2>

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-600">Couldn't load options: {(error as Error).message}</p>}

      <ul className="space-y-3">
        {zones?.map((z) => (
          <ZoneCard key={z.id} zone={z} onChanged={refresh} />
        ))}
      </ul>

      <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-4">
        <p className="mb-3 text-sm font-medium">Add a campus</p>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <input className={inputClass} placeholder="Campus name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className={inputClass} placeholder="Fee (₦)" inputMode="decimal" value={newFee} onChange={(e) => setNewFee(e.target.value)} />
        </div>
        <input
          className={`${inputClass} mt-3`}
          placeholder={`Location (optional): 4.9009, 6.9063  or  4°54'03.3"N 6°54'22.7"E`}
          value={newLoc}
          onChange={(e) => setNewLoc(e.target.value)}
        />
        <button
          onClick={addCampus}
          disabled={adding}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-gray-50 disabled:opacity-60"
        >
          <Plus size={14} /> Add campus
        </button>
      </div>
    </div>
  )
}
