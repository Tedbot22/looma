import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { SavedAddress } from '../lib/types'

// The logged-in customer's saved delivery locations, default first.
export function useAddresses() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: async (): Promise<SavedAddress[]> => {
      const { data, error } = await supabase
        .from('addresses')
        .select('id, zone_id, details, latitude, longitude, note, is_default, created_at, delivery_zones(id, name, fee, is_active, sort_order, kind)')
        .eq('user_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data as unknown as SavedAddress[]
    },
    enabled: !!user,
  })
}

export interface AddressValues {
  zoneId: string // the Home delivery option
  details: string // the address text
  latitude: number
  longitude: number
  note?: string
  isDefault?: boolean
}

// Add, edit, delete and set-default, each refreshing the list afterwards.
export function useAddressActions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] })

  return {
    // Returns the new address's id, so checkout can select it straight away.
    async add(values: AddressValues): Promise<string> {
      const { data, error } = await supabase
        .from('addresses')
        .insert({
          user_id: user!.id,
          zone_id: values.zoneId,
          details: values.details.trim(),
          latitude: values.latitude,
          longitude: values.longitude,
          note: values.note?.trim() || null,
          is_default: values.isDefault ?? false,
        })
        .select('id')
        .single()
      if (error) throw error
      await refresh()
      return data.id as string
    },

    async update(id: string, values: AddressValues) {
      const { error } = await supabase
        .from('addresses')
        .update({
          zone_id: values.zoneId,
          details: values.details.trim(),
          latitude: values.latitude,
          longitude: values.longitude,
          note: values.note?.trim() || null,
          ...(values.isDefault ? { is_default: true } : {}),
        })
        .eq('id', id)
      if (error) throw error
      await refresh()
    },

    async remove(id: string) {
      const { error } = await supabase.from('addresses').delete().eq('id', id)
      if (error) throw error
      await refresh()
    },

    async makeDefault(id: string) {
      // The database un-defaults the others by itself (see the addresses trigger).
      const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id)
      if (error) throw error
      await refresh()
    },
  }
}
