import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Coupon } from '../lib/coupons'

// All of the logged-in customer's coupons (active, used and expired). Soonest-to-expire first.
export function useCoupons() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['coupons', user?.id],
    queryFn: async (): Promise<Coupon[]> => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('user_id', user!.id)
        .order('expires_at')
      if (error) throw error
      return data as Coupon[]
    },
    enabled: !!user,
    staleTime: 30_000,
  })
}
