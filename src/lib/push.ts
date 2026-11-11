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
