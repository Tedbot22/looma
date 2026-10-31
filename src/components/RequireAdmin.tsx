import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../hooks/useProfile'

// Only lets the store owner through. Everyone else is sent to the homepage.
// Remember: this only hides the page. The real protection is RLS and the
// is_admin() check inside the database functions.
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const location = useLocation()

  if (loading || (user && isLoading)) {
    return <p className="py-20 text-center text-gray-400">Loading…</p>
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (!profile?.is_admin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
