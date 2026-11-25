// The logged-in customer's own details: profile, saved addresses, vouchers and referrals.

import { supabase } from '../lib/supabase'
import type { Coupon } from '../lib/coupons'
import type { SavedAddress } from '../lib/types'
import { errorMessage, run, unwrap } from './db'

/* -------------------------------- profile -------------------------------- */

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  referral_code: string
  is_admin: boolean
}

export const fetchProfile = (userId: string): Promise<Profile> =>
  unwrap(supabase.from('profiles').select('id, full_name, phone, referral_code, is_admin').eq('id', userId).single())

export const updateProfile = (userId: string, details: { name: string; phone: string }) =>
  run(supabase.from('profiles').update({ full_name: details.name, phone: details.phone }).eq('id', userId))

// Notes that the customer was just here (used to find customers who have gone quiet). Fire and forget:
// a failure here must never bother the customer.
export function touchLastSeen(): void {
  supabase.rpc('touch_last_seen').then(
    () => {},
    () => {}
  )
}

// Closes the customer's account. The database refuses while an order is in progress, and for owner accounts.
export const deactivateMyAccount = () => run(supabase.rpc('deactivate_my_account'))

export type DeactivateProblem = 'active_orders' | 'admin_account' | 'other'

export function classifyDeactivateError(err: unknown): DeactivateProblem {
  const message = errorMessage(err)
  if (message.includes('ACTIVE_ORDERS')) return 'active_orders'
  if (message.includes('ADMIN_ACCOUNT')) return 'admin_account'
  return 'other'
}

/* ------------------------------- addresses ------------------------------- */

export interface AddressValues {
  zoneId: string // the Home delivery option
  details: string // the address text
  latitude: number
  longitude: number
  note?: string
  isDefault?: boolean
}

// Saved delivery locations, default first, then oldest first.
export const fetchAddresses = (userId: string): Promise<SavedAddress[]> =>
  unwrap(
    supabase
      .from('addresses')
      .select('id, zone_id, details, latitude, longitude, note, is_default, created_at, delivery_zones(id, name, fee, is_active, sort_order, kind)')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at')
  ) as unknown as Promise<SavedAddress[]>

// Saves a new address and returns its id, so checkout can select it straight away.
export async function addAddress(userId: string, values: AddressValues): Promise<string> {
  const row = await unwrap<{ id: string }>(
    supabase
      .from('addresses')
      .insert({
        user_id: userId,
        zone_id: values.zoneId,
        details: values.details.trim(),
        latitude: values.latitude,
        longitude: values.longitude,
        note: values.note?.trim() || null,
        is_default: values.isDefault ?? false,
      })
      .select('id')
      .single()
  )
  return row.id
}

export const updateAddress = (id: string, values: AddressValues) =>
  run(
    supabase
      .from('addresses')
      .update({
        zone_id: values.zoneId,
        details: values.details.trim(),
        latitude: values.latitude,
        longitude: values.longitude,
        note: values.note?.trim() || null,
        ...(values.isDefault ? { is_default: true } : {}),
      })
      .eq('id', id)
  )

export const deleteAddress = (id: string) => run(supabase.from('addresses').delete().eq('id', id))

// The database un-defaults the customer's other addresses by itself.
export const makeAddressDefault = (id: string) => run(supabase.from('addresses').update({ is_default: true }).eq('id', id))

/* ------------------------------ vouchers & referrals ------------------------------ */

// All of the customer's vouchers (active, used and expired), soonest to expire first.
export const fetchMyCoupons = (userId: string): Promise<Coupon[]> =>
  unwrap(supabase.from('coupons').select('*').eq('user_id', userId).order('expires_at'))

// How many invited friends have a delivered order big enough to count towards the next voucher.
export const fetchReferralProgress = (): Promise<number> => unwrap<number>(supabase.rpc('my_referral_progress'))
