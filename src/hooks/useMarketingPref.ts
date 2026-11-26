import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchMarketingPref, saveMarketingPref } from '../api/push'
import { errorMessage } from '../api/db'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../context/AuthContext'

// Whether this customer wants "offers & reminders" (cart reminders, promotions, we-miss-you).
// Order updates are separate and are never affected by this. No saved choice means yes.
export function useMarketingPref() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.account.marketingPref(user?.id)

  const { data: enabled = true, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: () => fetchMarketingPref(user!.id),
  })

  const update = useMutation({
    mutationFn: async (marketing: boolean) => {
      await saveMarketingPref(user!.id, marketing)
      return marketing
    },
    onSuccess: (marketing) => queryClient.setQueryData(key, marketing),
    onError: (err) => toast.error(errorMessage(err)),
  })

  return { enabled, isLoading, busy: update.isPending, set: (v: boolean) => update.mutate(v) }
}
