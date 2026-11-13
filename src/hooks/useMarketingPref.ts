import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Whether this customer wants "offers & reminders" (cart reminders, promotions, we-miss-you).
// Order updates are separate and are never affected by this. No saved choice means yes.
export function useMarketingPref() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = ['push-marketing', user?.id]

  const { data: enabled = true, isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('push_preferences').select('marketing').eq('user_id', user!.id).maybeSingle()
      if (error) throw error
      return data?.marketing ?? true
    },
  })

  const update = useMutation({
    mutationFn: async (marketing: boolean) => {
      const { error } = await supabase
        .from('push_preferences')
        .upsert({ user_id: user!.id, marketing, updated_at: new Date().toISOString() })
      if (error) throw error
      return marketing
    },
    onSuccess: (marketing) => queryClient.setQueryData(key, marketing),
    onError: (err) => toast.error((err as Error).message),
  })

  return { enabled, isLoading, busy: update.isPending, set: (v: boolean) => update.mutate(v) }
}
