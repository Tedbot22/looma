import { useQuery } from '@tanstack/react-query'
import { fetchAdminDashboard } from '../api/adminReports'
import { queryKeys } from '../api/queryKeys'

// The owner's dashboard numbers for the last `days` days, refreshed every minute.
export function useAdminDashboard(days: number) {
  return useQuery({
    queryKey: queryKeys.admin.dashboard(days),
    refetchInterval: 60_000,
    queryFn: () => fetchAdminDashboard(days),
  })
}
