import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ExternalLink,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  Star,
  Tag,
  Ticket,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { STORE_NAME } from '../../config'
import PushToggle from './PushToggle'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // The mobile menu closes itself after you pick a page.
  useEffect(() => setOpen(false), [location.pathname])

  // How many payment problems are waiting for the owner (shown as a count next to Payments).
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

  // New orders waiting to be confirmed.
  const { data: newOrders } = useQuery({
    queryKey: ['new-orders-count'],
    queryFn: async () => {
      const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'placed')
      return count ?? 0
    },
    refetchInterval: 30_000,
  })

  const groups: { title: string; items: NavItem[] }[] = [
    { title: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    {
      title: 'Sales',
      items: [
        { to: '/admin/orders', label: 'Orders', icon: ReceiptText, badge: newOrders ?? 0 },
        { to: '/admin/payments', label: 'Payments', icon: Wallet, badge: openIssues ?? 0 },
        { to: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
      ],
    },
    {
      title: 'Catalog',
      items: [
        { to: '/admin/products', label: 'Products', icon: Package },
        { to: '/admin/categories', label: 'Categories', icon: Tag },
        { to: '/admin/banners', label: 'Banners', icon: ImageIcon },
      ],
    },
    {
      title: 'Customers',
      items: [
        { to: '/admin/customers', label: 'Customers', icon: Users },
        { to: '/admin/reviews', label: 'Reviews', icon: Star },
        { to: '/admin/support', label: 'Support', icon: MessageCircle, badge: waiting ?? 0 },
      ],
    },
    {
      title: 'Settings',
      items: [
        { to: '/admin/delivery', label: 'Delivery', icon: Truck },
        { to: '/admin/store', label: 'Store', icon: Settings },
      ],
    },
  ]

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
    }`

  const menu = (
    <nav aria-label="Admin" className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={linkClass}>
                  <item.icon size={18} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{item.badge}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )

  const viewStore = (
    <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-brand">
      <ShoppingBag size={18} /> View store <ExternalLink size={13} />
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Wide screens: a menu that stays on the left */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-4">
          <span className="mb-5 px-3 text-lg font-bold text-brand">{STORE_NAME} Admin</span>
          {menu}
          <div className="mt-auto border-t border-gray-100 pt-3">{viewStore}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phones and tablets: a top bar with a menu button */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
          <span className="font-bold text-brand">{STORE_NAME} Admin</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open admin menu"
            className="relative rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          >
            <Menu size={22} />
            {(!!newOrders || !!openIssues || !!waiting) && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-600" />}
          </button>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-5 flex items-center justify-between px-3">
                <span className="text-lg font-bold text-brand">{STORE_NAME} Admin</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 hover:bg-gray-100">
                  <X size={20} />
                </button>
              </div>
              {menu}
              <div className="mt-6 border-t border-gray-100 pt-3">{viewStore}</div>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <PushToggle />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
