import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import AddressBook from '../../components/AddressBook'

const inputClass =
  'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand'

export default function EditProfile() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()

  // null = "not edited yet", so the saved value is shown. No effect needed.
  const [nameInput, setNameInput] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!profile || !user) return <p className="py-20 text-center text-gray-400">Loading…</p>

  const name = nameInput ?? profile.full_name ?? ''
  const phone = phoneInput ?? profile.phone ?? ''
  const changed = nameInput !== null || phoneInput !== null

  async function save(e: FormEvent) {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15) {
      toast.error('Please enter a valid phone number.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim() })
      .eq('id', user!.id)
    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['profile', user!.id] })
    setNameInput(null)
    setPhoneInput(null)
    toast.success('Profile saved')
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold">Edit profile</h1>

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Full name</label>
          <input className={inputClass} value={name} onChange={(e) => setNameInput(e.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Phone number</label>
          <input
            className={inputClass}
            type="tel"
            value={phone}
            onChange={(e) => setPhoneInput(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input className={`${inputClass} bg-gray-50 text-gray-500`} value={user.email ?? ''} disabled />
        </div>

        <button
          type="submit"
          disabled={saving || !changed}
          className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <AddressBook />
    </div>
  )
}
