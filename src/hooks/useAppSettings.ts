import { useQuery } from '@tanstack/react-query'
import { fetchAppSettings } from '../api/settings'
import { queryKeys } from '../api/queryKeys'

// Business rules stored in the app_settings table (referral minimum, referral target, ...).
// Reading them from the database means the owner can change a rule without a new app release.
export function useAppSettings() {
  return useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
  })
}
