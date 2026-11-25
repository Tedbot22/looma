// Delivery: price quotes, the customer's delivery code, and the owner's rider tools.

import { supabase } from '../lib/supabase'
import type { DeliveryEvent } from '../lib/adminDelivery'
import type { Quote } from '../lib/delivery'
import type { DeliveryZone } from '../lib/types'
import { run, unwrap } from './db'
import { callFunction } from './functions'

/* ------------------------------ price quote ------------------------------ */

// Asks the server to price delivery to one exact address. The quote is saved on the server and checkout
// only sends its id, so the fee can never be changed from the browser.
export const requestQuote = (args: { lat: number; lon: number; address: string; note?: string }) =>
  callFunction<Quote>('delivery-quote', args)

/* --------------------------- the customer's side --------------------------- */

export interface MyDelivery {
  status: 'assigned' | 'out_for_delivery' | 'qr_verified' | 'delivered' | 'failed' | 'cancelled' | 'reassigned'
  rider_name: string
  rider_phone: string
  dispatch_company: string | null
  active: boolean
  qr_verified: boolean
}

// Who is delivering this order and how far verification has got. Null when no rider is assigned.
export async function fetchMyDelivery(orderId: string): Promise<MyDelivery | null> {
  const data = await unwrap<MyDelivery | null>(supabase.rpc('my_delivery', { p_order_id: orderId }))
  return data ?? null
}

export interface DeliveryQrReply {
  token: string
  expires_in_seconds: number
}

// Makes a fresh QR code for the rider to scan. Making one cancels any earlier one.
export const createDeliveryQr = (orderId: string) =>
  unwrap<DeliveryQrReply | null>(supabase.rpc('create_delivery_qr', { p_order_id: orderId }))

/* ---------------------------- the owner's side ---------------------------- */

// The audit trail of one order's delivery, oldest first.
export const fetchDeliveryEvents = (orderId: string): Promise<DeliveryEvent[]> =>
  unwrap(
    supabase
      .from('delivery_events')
      .select('id, event_type, outcome, actor, detail, created_at')
      .eq('order_id', orderId)
      .order('created_at')
  )

// The rider actions the owner can take. Each is checked again by the database.
export type DeliveryAction = 'assign_rider' | 'reassign_rider' | 'replace_delivery_link' | 'cancel_assignment'

export const runDeliveryAction = (action: DeliveryAction, args: Record<string, unknown>) =>
  unwrap<unknown>(supabase.rpc(action, args))

/* ------------------------------ delivery options ------------------------------ */

// The delivery options customers can choose right now (the owner can switch them on and off).
export const fetchActiveZones = (): Promise<DeliveryZone[]> =>
  unwrap(supabase.from('delivery_zones').select('*').eq('is_active', true).order('sort_order'))

// Every option, switched-off ones included (the owner's access rules allow it).
export const fetchAllZones = (): Promise<DeliveryZone[]> =>
  unwrap(supabase.from('delivery_zones').select('*').order('sort_order'))

export interface ZoneChanges {
  name: string
  fee?: number
  latitude?: number | null
  longitude?: number | null
}

export const updateZone = (id: string, changes: ZoneChanges) =>
  run(supabase.from('delivery_zones').update(changes).eq('id', id))

export const setZoneActive = (id: string, active: boolean) =>
  run(supabase.from('delivery_zones').update({ is_active: active }).eq('id', id))

export const addCampusZone = (zone: { name: string; fee: number; sortOrder: number; latitude: number | null; longitude: number | null }) =>
  run(
    supabase.from('delivery_zones').insert({
      name: zone.name,
      fee: zone.fee,
      kind: 'campus',
      sort_order: zone.sortOrder,
      latitude: zone.latitude,
      longitude: zone.longitude,
    })
  )
