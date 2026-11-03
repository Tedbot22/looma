import { Link, Outlet, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

// Wraps every page under /account. The menu page stands alone; every other page gets a back link.
export default function AccountLayout() {
  const { pathname } = useLocation()
  const isMenu = pathname.replace(/\/$/, '') === '/account'

  return (
    <div className={`mx-auto ${isMenu ? 'max-w-xl' : 'max-w-3xl'}`}>
      {!isMenu && (
        <Link to="/account" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand">
          <ChevronLeft size={16} /> Account
        </Link>
      )}
      <Outlet />
    </div>
  )
}
