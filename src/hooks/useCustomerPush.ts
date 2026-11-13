import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from './useProfile'
import {
  VAPID_PUBLIC_KEY,
  getOrCreateSubscription,
  isPushSupported,
  readyRegistration,
  setOptedOut,
  subscriptionMatchesKey,
} from '../lib/push'
import { isIOS, isStandalone } from '../lib/install'

export type PushState =
  | 'checking'
  | 'unsupported' // this browser can't do notifications
  | 'needs-install' // iPhone: only works after "Add to Home Screen"
  | 'unconfigured'
  | 'blocked' // the person said "Block" in the browser
  | 'off'
  | 'on'

// Order-update notifications for a logged-in customer on this device.
export function useCustomerPush() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const [state, setState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!isPushSupported()) return setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported')
    if (!VAPID_PUBLIC_KEY) return setState('unconfigured')
    if (Notification.permission === 'denied') return setState('blocked')

    const registration = await readyRegistration()
    if (!registration) return setState('unsupported')
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription || !user) return setState('off')
    // Made with an old key: the push service would reject it, so treat it as off and let the next "turn on" replace it.
    if (!subscriptionMatchesKey(subscription)) return setState('off')

    // "On" means THIS device is saved under THIS account on the server.
    const { data } = await supabase
      .from('customer_push_subscriptions')
      .select('id')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle()
    setState(data ? 'on' : 'off')
  }, [user])

  useEffect(() => {
    refresh().catch(() => setState('unsupported'))
  }, [refresh])

  // Resolves to true when this device is now saved under the customer's account.
  async function enable(): Promise<boolean> {
    if (!user || !VAPID_PUBLIC_KEY) return false
    setBusy(true)
    try {
      // 1. Ask permission (the browser shows its own prompt; this must come from a tap).
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return false
      }

      // 2. Subscribe this device (reuses the existing subscription if there is one).
      const registration = await readyRegistration()
      if (!registration) throw new Error('The app is still loading. Try again in a moment.')
      const subscription = await getOrCreateSubscription(registration)

      // 3. Save it under this customer. The database function sets the owner from the login.
      const { error } = await supabase.rpc('register_push_subscription', { p_subscription: subscription.toJSON() })
      if (error) throw error

      setOptedOut(user.id, false)
      setState('on')
      toast.success("Order updates are on. We'll notify you as your order moves.")
      return true
    } catch (err) {
      toast.error(`Couldn't turn on notifications: ${(err as Error).message}`)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await readyRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await supabase.from('customer_push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        // The owner's order alerts use the same browser subscription, so only fully remove it for customers.
        if (!profile?.is_admin) await subscription.unsubscribe()
      }
      if (user) setOptedOut(user.id, true) // they chose this: don't ask again
      setState('off')
      toast.success('Order updates are off on this device')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return { state, busy, enable, disable }
}
