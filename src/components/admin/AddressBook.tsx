import { useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AddressForm from '../AddressForm'
import { useAddressActions, useAddresses, type AddressValues } from '../../hooks/useAddresses'
import { useDeliveryZones } from '../../hooks/useDeliveryZones'

// Manage saved home delivery addresses (shown on the Edit profile page).
export default function AddressBook() {
  const { data: addresses = [], isLoading } = useAddresses()
  const { data: zones = [] } = useDeliveryZones()
  const actions = useAddressActions()
  const homeZone = zones.find((z) => z.kind === 'home') ?? null

  // 'new', an address id (being edited), or null (just viewing)
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  async function run(task: () => Promise<void>, success: string) {
    try {
      await task()
      toast.success(success)
      setEditing(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const save = (values: AddressValues) =>
    editing === 'new'
      ? run(async () => { await actions.add(values) }, 'Address saved')
      : run(() => actions.update(editing!, values), 'Address updated')

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-lg font-semibold">Home delivery addresses</h2>
      <p className="mb-4 text-sm text-gray-500">
        Save your address once and pick it in one tap at checkout. The delivery fee is worked out from the distance.
      </p>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

      <ul className="space-y-3">
        {addresses.map((a) => {
          if (editing === a.id && homeZone) {
            return (
              <li key={a.id}>
                <AddressForm
                  zone={homeZone}
                  initial={{
                    details: a.details,
                    latitude: a.latitude,
                    longitude: a.longitude,
                    note: a.note ?? '',
                    isDefault: a.is_default,
                  }}
                  submitLabel="Save changes"
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
              </li>
            )
          }

          return (
            <li key={a.id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-4">
              <MapPin size={18} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {a.details}
                  {a.is_default && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                      Default
                    </span>
                  )}
                </p>
                {a.note && <p className="text-sm text-gray-600">{a.note}</p>}
                {!a.delivery_zones && (
                  <p className="text-xs text-amber-600">Home delivery isn't available right now.</p>
                )}
                {!a.is_default && (
                  <button
                    onClick={() => run(() => actions.makeDefault(a.id), 'Default address updated')}
                    className="mt-1 text-xs font-medium text-brand hover:underline"
                  >
                    Make default
                  </button>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  aria-label="Edit address"
                  onClick={() => setEditing(a.id)}
                  disabled={!homeZone}
                  className="rounded p-1.5 text-gray-400 hover:text-brand disabled:opacity-40"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label="Delete address"
                  onClick={() => {
                    if (window.confirm('Delete this address?')) run(() => actions.remove(a.id), 'Address deleted')
                  }}
                  className="rounded p-1.5 text-gray-400 hover:text-sale"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {!homeZone ? (
        <p className="mt-3 text-sm text-gray-500">Home delivery isn't available right now, so addresses can't be added.</p>
      ) : editing === 'new' ? (
        <div className="mt-3">
          <AddressForm zone={homeZone} submitLabel="Save address" onSubmit={save} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <button
          onClick={() => setEditing('new')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-brand hover:text-brand"
        >
          <Plus size={16} /> Add new address
        </button>
      )}
    </section>
  )
}
