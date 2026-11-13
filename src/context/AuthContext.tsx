import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { detachThisDevice } from '../lib/push'

interface AuthContextValue {
  user: User | null
  loading: boolean // true until we know whether someone is logged in
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Restore an existing session (Supabase keeps it in the browser).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

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
      supabase.rpc('touch_last_seen').then(
        () => {},
        () => {}
      )
    }
    ping()
    const onVisible = () => document.visibilityState === 'visible' && ping()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId])

  const value: AuthContextValue = {
    user: session?.user ?? null,
    loading,
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
