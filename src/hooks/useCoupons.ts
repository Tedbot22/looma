import { useQuery } from '@tanstack/react-query'
import { fetchMyCoupons } from '../api/account'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../context/AuthContext'

// All of the logged-in customer's coupons (active, used and expired). Soonest-to-expire first.
export function useCoupons() {
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.account.coupons(user?.id),
    queryFn: () => fetchMyCoupons(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  })
}
