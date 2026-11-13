// Helpers for browser push notifications.
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// The browser wants the public key as raw bytes, but we store it as URL-safe base64 text.
export function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

// Waits for the service worker, but gives up instead of hanging forever (e.g. if it failed to register).
export async function readyRegistration(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

// A subscription is tied to the VAPID public key it was created with. If the key was ever changed
// (new keys generated, a different Vercel/Supabase value), the old subscription is still "on" in the
// browser but the push service rejects every message sent to it. We spot that and start fresh.
export function subscriptionMatchesKey(subscription: PushSubscription): boolean {
  const current = subscription.options?.applicationServerKey
  if (!current || !VAPID_PUBLIC_KEY) return true // can't tell, so assume fine
  const a = new Uint8Array(current)
  const b = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  return a.length === b.length && a.every((value, i) => value === b[i])
}

// Returns this device's subscription, creating it if needed. A subscription made with an old key is
// replaced. Pass fresh = true to throw the current one away first (used to recover from a rejected push).
export async function getOrCreateSubscription(
  registration: ServiceWorkerRegistration,
  fresh = false
): Promise<PushSubscription> {
  if (!VAPID_PUBLIC_KEY) throw new Error('Notifications are not set up yet (missing VITE_VAPID_PUBLIC_KEY).')
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    if (!fresh && subscriptionMatchesKey(existing)) return existing
    await existing.unsubscribe()
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
}

// Remembers that a customer switched notifications off on purpose, so we never nag them to turn them back on.
const optOutKey = (userId: string) => `looma_push_off:${userId}`
export function isOptedOut(userId: string): boolean {
  try {
    return localStorage.getItem(optOutKey(userId)) === '1'
  } catch {
    return false
  }
}
export function setOptedOut(userId: string, off: boolean): void {
  try {
    if (off) localStorage.setItem(optOutKey(userId), '1')
    else localStorage.removeItem(optOutKey(userId))
  } catch {
    /* storage blocked: nothing to remember */
  }
}

// Called when someone logs out: stop sending THEIR order updates to this device, so the next
// person using a shared phone or computer doesn't see them. (The browser's permission stays.)
export async function detachThisDevice(): Promise<void> {
  try {
    if (!isPushSupported()) return
    const registration = await readyRegistration(1500)
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await supabase.from('customer_push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    }
  } catch {
    /* logging out must never fail because of notifications */
  }
}
