import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { DeliveryZone } from '../lib/types'

// The campuses we currently deliver to (the owner can switch them on and off).
export function useDeliveryZones() {
  return useQuery({
    queryKey: ['delivery-zones'],
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as DeliveryZone[]
    },
    staleTime: 5 * 60_000,
  })
}
