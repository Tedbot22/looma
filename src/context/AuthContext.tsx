import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { detachThisDevice } from '../api/push'
import { touchLastSeen } from '../api/account'

interface AuthContextValue {
  user: User | null
  loading: boolean // true until we know whether someone is logged in
  // Best guess at "is someone logged in?" that is right from the very first paint. While the real check is
  // still running (slow network, expired token being refreshed) it uses the session saved on this device,
  // so the header doesn't show "Log in" for a moment and then flip to the account icon.
  likelyLoggedIn: boolean
  signOut: () => Promise<void>
}

// Supabase keeps the session in localStorage under sb-<project>-auth-token. Reading it is instant and needs no network.
function hasSavedSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && /^sb-.+-auth-token$/.test(key) && localStorage.getItem(key)) return true
    }
  } catch {
    /* storage blocked: treat as logged out */
  }
  return false
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedSession] = useState(hasSavedSession) // read once, before the first paint

  useEffect(() => {
    // 1. Restore an existing session (Supabase keeps it in the browser).
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false)) // never leave the app stuck on "checking"

    // 2. Stay in sync: fires on login, logout and token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Tell the server this customer is around (drives the "we miss you" message). The database
  // writes at most once an hour, and a failure here must never get in the customer's way.
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let last = 0
    const ping = () => {
      if (Date.now() - last < 60 * 60 * 1000) return
      last = Date.now()
      touchLastSeen()
    }
    ping()
    const onVisible = () => document.visibilityState === 'visible' && ping()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId])

  const value: AuthContextValue = {
    user: session?.user ?? null,
    loading,
    likelyLoggedIn: loading ? savedSession : !!session?.user,
    signOut: async () => {
      await detachThisDevice() // needs the login, so it runs first
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
