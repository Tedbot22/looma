// Notifications: which devices to send to, what a customer agreed to receive, and the owner's tools for
// reminders and promotions. (Browser-only helpers, like asking permission, stay in lib/push.ts.)

import { supabase } from '../lib/supabase'
import { isPushSupported, readyRegistration } from '../lib/push'
import { run, unwrap } from './db'
import { callFunctionWithDetails } from './functions'

/* ---------------------------- a customer's device ---------------------------- */

// Is this browser saved under the logged-in account? A read that fails counts as "no".
export async function isDeviceSavedForCustomer(endpoint: string): Promise<boolean> {
  const { data } = await supabase.from('customer_push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
  return !!data
}

// Saves this browser under the logged-in customer. The database sets the owner from the login.
export const registerCustomerSubscription = (subscription: PushSubscriptionJSON) =>
  run(supabase.rpc('register_push_subscription', { p_subscription: subscription }))

// Stops sending order updates to this browser. Best effort: if it fails, the browser is still told to
// forget the subscription, and the server drops it the next time a push is rejected.
export async function removeCustomerSubscription(endpoint: string): Promise<void> {
  await supabase.from('customer_push_subscriptions').delete().eq('endpoint', endpoint)
}

// Called when someone logs out: stop sending THEIR order updates to this device, so the next person using
// a shared phone or computer doesn't see them. (The browser's permission stays.)
export async function detachThisDevice(): Promise<void> {
  try {
    if (!isPushSupported()) return
    const registration = await readyRegistration(1500)
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) await removeCustomerSubscription(subscription.endpoint)
  } catch {
    /* logging out must never fail because of notifications */
  }
}

/* ------------------------------- preferences ------------------------------- */

// Whether this customer wants "offers & reminders". Order updates are separate and never affected.
// No saved choice means yes.
export async function fetchMarketingPref(userId: string): Promise<boolean> {
  const row = await unwrap<{ marketing: boolean } | null>(
    supabase.from('push_preferences').select('marketing').eq('user_id', userId).maybeSingle()
  )
  return row?.marketing ?? true
}

export const saveMarketingPref = (userId: string, marketing: boolean) =>
  run(supabase.from('push_preferences').upsert({ user_id: userId, marketing, updated_at: new Date().toISOString() }))

/* --------------------------- the owner's own devices --------------------------- */

// Saves a browser as a place to send the owner's new-order alerts.
export const saveOwnerDevice = (userId: string, subscription: unknown) =>
  run(
    supabase
      .from('device_tokens')
      .upsert({ user_id: userId, token: JSON.stringify(subscription), platform: 'web' }, { onConflict: 'token' })
  )

// Removes this browser from the owner's alert devices. Matches by the browser's address, which is more
// reliable than comparing the whole saved text. Best effort, like removeCustomerSubscription.
export async function removeOwnerDevice(userId: string, endpoint: string): Promise<void> {
  const { data: rows } = await supabase.from('device_tokens').select('id, token').eq('user_id', userId)
  const mine = (rows ?? []).filter((r) => {
    try {
      return JSON.parse(r.token).endpoint === endpoint
    } catch {
      return false
    }
  })
  if (mine.length > 0)
    await supabase
      .from('device_tokens')
      .delete()
      .in('id', mine.map((r) => r.id))
}

export interface TestAlertReport {
  sent?: number
  registered?: number
  errors?: string[]
}

// Sends a test order alert to the owner's saved devices.
export const sendTestAlert = () => callFunctionWithDetails<TestAlertReport | null>('notify-order', { test: true })

/* ----------------------- the owner's reminders and promotions ----------------------- */

export interface PushSettings {
  cart_enabled: boolean
  cart_first_hours: number
  cart_second_hours: number
  confirm_enabled: boolean
  confirm_after_min: number
  inactive_enabled: boolean
  inactive_after_days: number
  promo_weekly_cap: number
  quiet_start_hour: number
  quiet_end_hour: number
}

export const fetchPushSettings = (): Promise<PushSettings> =>
  unwrap(supabase.from('push_settings').select('*').eq('id', 1).single())

export const savePushSettings = (changes: Partial<PushSettings>) =>
  run(supabase.from('push_settings').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', 1))

export interface Promo {
  id: string
  title: string
  body: string
  url: string
  scheduled_for: string
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled'
  recipients: number | null
  skipped_cap: number | null
}

// The 20 most recent promotions, newest first.
export const fetchPromos = (): Promise<Promo[]> =>
  unwrap(
    supabase
      .from('promo_messages')
      .select('id, title, body, url, scheduled_for, status, recipients, skipped_cap')
      .order('scheduled_for', { ascending: false })
      .limit(20)
  )

// Saves a promotion to go out at a set time and returns its id.
export async function createPromo(promo: { title: string; body: string; url: string; scheduledFor: Date }): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  const row = await unwrap<{ id: string }>(
    supabase
      .from('promo_messages')
      .insert({
        title: promo.title,
        body: promo.body,
        url: promo.url,
        scheduled_for: promo.scheduledFor.toISOString(),
        created_by: auth.user?.id ?? null,
      })
      .select('id')
      .single()
  )
  return row.id
}

// Only a promotion that has not started sending can be cancelled.
export const cancelPromo = (id: string) =>
  run(supabase.from('promo_messages').update({ status: 'cancelled' }).eq('id', id).eq('status', 'scheduled'))

export interface PromoReport {
  id: string
  delivered?: number
  failed?: number
  noDevice?: number
  audience?: number
  skippedCap?: number
  errors?: string[]
  error?: string
}

// Asks the scheduler to send exactly this promotion now, instead of waiting for its next 5-minute turn.
export const sendPromoNow = (promoId: string) =>
  callFunctionWithDetails<{ promos?: PromoReport[] } | null>('push-scheduler', { task: 'promos', promo_id: promoId })

export interface PushActivity {
  cart: number
  promo: number
  inactive: number
}

// What went out in the last 7 days.
export async function fetchPushActivity(): Promise<PushActivity> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const rows = await unwrap<{ kind: string }[]>(supabase.from('push_log').select('kind').gte('sent_at', since).limit(10000))
  const count = (kinds: string[]) => rows.filter((r) => kinds.includes(r.kind)).length
  return { cart: count(['cart_1', 'cart_2']), promo: count(['promo']), inactive: count(['inactive']) }
}
