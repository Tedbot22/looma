import { Link, NavLink, Outlet } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { STORE_NAME } from '../../config'
import PushToggle from './PushToggle'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-1.5 text-sm font-medium ${
    isActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
  }`

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <span className="font-bold text-brand">{STORE_NAME} Admin</span>
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
            View store <ExternalLink size={14} />
          </Link>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-2 px-4 pb-3">
          <NavLink to="/admin" end className={tabClass}>
            Orders
          </NavLink>
          <NavLink to="/admin/products" className={tabClass}>
            Products
          </NavLink>
          <NavLink to="/admin/delivery" className={tabClass}>
            Delivery
          </NavLink>
          <NavLink to="/admin/vouchers" className={tabClass}>
            Vouchers
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
