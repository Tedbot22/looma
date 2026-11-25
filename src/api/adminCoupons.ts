// The owner's side of vouchers: the pool of rewards customers can win, who has which voucher, and
// who was referred by whom. Customers never call these.

import { supabase } from '../lib/supabase'
import type { Coupon, CouponKind } from '../lib/coupons'
import { run, unwrap } from './db'

/* ----------------------------- the reward pool ----------------------------- */

export interface Template {
  id: string
  name: string
  kind: CouponKind
  value: number
  max_discount: number
  min_order: number
  weight: number
  is_active: boolean
}

export type TemplateInput = Pick<Template, 'name' | 'kind' | 'value' | 'max_discount' | 'min_order' | 'weight'>

export const fetchTemplates = (): Promise<Template[]> =>
  unwrap(supabase.from('coupon_templates').select('*').order('created_at'))

// Adds a reward, or changes one when its id is given.
export const saveTemplate = (row: TemplateInput, id?: string) =>
  run(id ? supabase.from('coupon_templates').update(row).eq('id', id) : supabase.from('coupon_templates').insert(row))

export const setTemplateActive = (id: string, active: boolean) =>
  run(supabase.from('coupon_templates').update({ is_active: active }).eq('id', id))

// Vouchers already given out keep working.
export const deleteTemplate = (id: string) => run(supabase.from('coupon_templates').delete().eq('id', id))

/* ----------------------------- vouchers given out ----------------------------- */

export type IssuedCoupon = Coupon & {
  user_id: string
  profiles: { full_name: string | null; phone: string | null } | null
}

// The 100 most recently given vouchers, with who has them.
export const fetchIssuedCoupons = (): Promise<IssuedCoupon[]> =>
  unwrap(
    supabase.from('coupons').select('*, profiles(full_name, phone)').order('issued_at', { ascending: false }).limit(100)
  ) as unknown as Promise<IssuedCoupon[]>

export interface CouponStats {
  issued: number
  used: number
  cost: number // what used vouchers have actually taken off orders
}

export async function fetchCouponStats(): Promise<CouponStats> {
  const rows = await unwrap<{ used_at: string | null; discount_applied: number | null }[]>(
    supabase.from('coupons').select('used_at, discount_applied').limit(5000)
  )
  return {
    issued: rows.length,
    used: rows.filter((r) => r.used_at).length,
    cost: rows.reduce((sum, r) => sum + (r.used_at ? Number(r.discount_applied ?? 0) : 0), 0),
  }
}

/* -------------------------------- referrals -------------------------------- */

export interface ReferredPerson {
  id: string
  full_name: string | null
  phone: string | null
  orders: { order_number: number; subtotal: number; status: string; delivery_address: string }[]
}

// The friends a customer invited, with their orders.
export const fetchReferredPeople = (userId: string): Promise<ReferredPerson[]> =>
  unwrap(
    supabase
      .from('profiles')
      .select('id, full_name, phone, orders(order_number, subtotal, status, delivery_address)')
      .eq('referred_by', userId)
  ) as unknown as Promise<ReferredPerson[]>
