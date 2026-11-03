import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, Gift, Heart, LogOut, Package, Ticket, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWishlist } from '../../context/WishlistContext'
import { useProfile } from '../../hooks/useProfile'
import { useCoupons } from '../../hooks/useCoupons'
import { couponStatus } from '../../lib/coupons'

interface MenuItem {
  to: string
  label: string
  hint: string
  icon: LucideIcon
}

export default function AccountHome() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { items: wishlist } = useWishlist()
  const { data: coupons = [] } = useCoupons()
  const activeVouchers = coupons.filter((c) => couponStatus(c) === 'active').length
  const navigate = useNavigate()

  const name = profile?.full_name || 'Your account'

  const menu: MenuItem[] = [
    { to: '/account/orders', label: 'Orders', hint: 'Track and review your orders', icon: Package },
    { to: '/account/vouchers', label: 'Vouchers', hint: activeVouchers > 0 ? `${activeVouchers} available` : 'Coupons you have earned', icon: Ticket },
    {
      to: '/account/wishlist',
      label: 'Wishlist',
      hint: wishlist.length > 0 ? `${wishlist.length} saved` : 'Items you saved for later',
      icon: Heart,
    },
    { to: '/account/recently-viewed', label: 'Recently viewed', hint: 'Pick up where you left off', icon: Clock },
    { to: '/account/invite', label: 'Invite friends', hint: 'Share your link and earn rewards', icon: Gift },
    { to: '/account/profile', label: 'Edit profile', hint: 'Name, phone and delivery locations', icon: User },
  ]

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{name}</h1>
          <p className="truncate text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
        {menu.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50">
              <Icon size={20} className="shrink-0 text-gray-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-gray-500">{hint}</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-gray-300" />
            </Link>
          </li>
        ))}
      </ul>

      <button
        onClick={handleSignOut}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:border-sale hover:text-sale"
      >
        <LogOut size={16} /> Log out
      </button>
    </div>
  )
}
