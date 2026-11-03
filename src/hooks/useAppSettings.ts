import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Business rules stored in the app_settings table (referral minimum, referral target, ...).
// Reading them from the database means the owner can change a rule without a new app release.
export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('app_settings').select('key, value')
      if (error) throw error
      return Object.fromEntries(data.map((r) => [r.key, r.value]))
    },
    staleTime: 5 * 60_000,
  })
}
