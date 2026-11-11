// The numbers on the admin dashboard. They are worked out inside the database (admin_dashboard in
// supabase/phase9_admin_metrics_and_review_media.sql), so the page downloads a few KB, not every order.

import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Order } from './types'

export interface DashboardData {
  days: number
  revenue: number
  orders: number
  avg_order: number
  prev_revenue: number
  prev_orders: number
  new_users: number
  prev_new_users: number
  total_users: number
  repeat_customers: number
  waiting_orders: number
  cancelled: number
  daily: { day: string; revenue: number; orders: number; users: number }[]
  by_status: Partial<Record<Order['status'], number>>
  by_payment: { method: Order['payment_method']; orders: number; revenue: number }[]
  top_products: { name: string; units: number; revenue: number }[]
  low_stock: { product_id: string; name: string; color: string | null; size: string | null; stock: number }[]
  reviews: { count: number; average: number }
}

export function useAdminDashboard(days: number) {
  return useQuery({
    queryKey: ['admin-dashboard', days],
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardData> => {
      const { data, error } = await supabase.rpc('admin_dashboard', { p_days: days })
      if (error) throw error
      return data as DashboardData
    },
  })
}

export interface CustomerRow {
  id: string
  email: string | null
  joined_at: string
  full_name: string | null
  phone: string | null
  is_admin: boolean
  orders: number
  spent: number
  last_order_at: string | null
}

// Percent change from the previous period. null when there is nothing to compare with.
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / before) * 100)
}
