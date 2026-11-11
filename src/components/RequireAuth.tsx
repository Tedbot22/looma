import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wrap any page that needs a logged-in user:
//   <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Don't redirect while we're still checking for a saved session,
  // or logged-in users would be bounced to /login on every refresh.
  if (loading) return <p className="py-20 text-center text-gray-400">Loading…</p>

  if (!user) {
    // Keep the ?query too, so coming back from Paystack (/order/:id?reference=...) still verifies the payment after login.
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  return <>{children}</>
}
