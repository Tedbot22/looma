// The owner's dashboard numbers and customer list. Both are worked out inside the database, so the page
// downloads a few kilobytes rather than every order.

import { supabase } from '../lib/supabase'
import type { CustomerRow, DashboardData } from '../lib/adminMetrics'
import { unwrap } from './db'

export const fetchAdminDashboard = (days: number): Promise<DashboardData> =>
  unwrap<DashboardData>(supabase.rpc('admin_dashboard', { p_days: days }))

export interface CustomerPage {
  total: number // everyone matching the search, not just this page
  rows: CustomerRow[]
}

export const fetchAdminCustomers = (search: string, limit: number, offset: number): Promise<CustomerPage> =>
  unwrap<CustomerPage>(
    supabase.rpc('admin_customers', { p_search: search || null, p_limit: limit, p_offset: offset })
  )
