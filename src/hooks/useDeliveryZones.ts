import { useQuery } from '@tanstack/react-query'
import { fetchActiveZones } from '../api/delivery'
import { queryKeys } from '../api/queryKeys'

// The campuses we currently deliver to (the owner can switch them on and off).
export function useDeliveryZones() {
  return useQuery({
    queryKey: queryKeys.deliveryZones(),
    queryFn: fetchActiveZones,
    staleTime: 5 * 60_000,
  })
}
