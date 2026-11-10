import { Link, NavLink, Outlet } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { STORE_NAME } from '../../config'
import PushToggle from './PushToggle'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ${
    isActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
  }`

export default function AdminLayout() {
  // How many payment problems are waiting for the owner (shown as a count on the tab).
  const { data: openIssues } = useQuery({
    queryKey: ['payment-issues-count'],
    queryFn: async () => {
      const { count } = await supabase.from('payment_issues').select('id', { count: 'exact', head: true }).is('resolved_at', null)
      return count ?? 0
    },
    refetchInterval: 30_000,
  })

  // How many customers the AI has handed over and are still waiting for the owner.
  const { data: waiting } = useQuery({
    queryKey: ['support-count'],
    queryFn: async () => {
      const { count } = await supabase.from('support_conversations').select('id', { count: 'exact', head: true }).eq('status', 'escalated')
      return count ?? 0
    },
    refetchInterval: 30_000,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <span className="font-bold text-brand">{STORE_NAME} Admin</span>
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
            View store <ExternalLink size={14} />
          </Link>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 pb-3">
          <NavLink to="/admin" end className={tabClass}>
            Orders
          </NavLink>
          <NavLink to="/admin/payments" className={tabClass}>
            Payments
            {!!openIssues && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{openIssues}</span>
            )}
          </NavLink>
          <NavLink to="/admin/support" className={tabClass}>
            Support
            {!!waiting && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{waiting}</span>
            )}
          </NavLink>
          <NavLink to="/admin/products" className={tabClass}>
            Products
          </NavLink>
          <NavLink to="/admin/delivery" className={tabClass}>
            Delivery
          </NavLink>
          <NavLink to="/admin/banners" className={tabClass}>
            Banners
          </NavLink>
          <NavLink to="/admin/store" className={tabClass}>
            Store
          </NavLink>
          <NavLink to="/admin/vouchers" className={tabClass}>
            Vouchers
          </NavLink>
          <NavLink to="/admin/reviews" className={tabClass}>
            Reviews
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <PushToggle />
        <Outlet />
      </main>
    </div>
  )
}
