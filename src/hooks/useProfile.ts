import { useQuery } from '@tanstack/react-query'
import { fetchProfile } from '../api/account'
import { queryKeys } from '../api/queryKeys'
import { useAuth } from '../context/AuthContext'

// The logged-in user's profile row. Several pages need it, so they all share this one query
// (same cache key = one request, not many).
export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.account.profile(user?.id),
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  })
}
