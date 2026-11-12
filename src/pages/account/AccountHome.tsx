import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, CircleHelp, Clock, FileText, Gift, Headset, Heart, Info, LogOut, Package, ShieldCheck, Ticket, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWishlist } from '../../context/WishlistContext'
import { useProfile } from '../../hooks/useProfile'
import { useCoupons } from '../../hooks/useCoupons'
import { couponStatus } from '../../lib/coupons'
import OrderAlertsCard from '../../components/OrderAlertsCard'
import InstallApp from '../../components/InstallApp'
import { useDialog } from '../../context/DialogContext'

interface MenuItem {
  to: string
  label: string
  hint: string
  icon: LucideIcon
}

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
      {items.map(({ to, label, hint, icon: Icon }) => (
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
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  )
}

export default function AccountHome() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { items: wishlist } = useWishlist()
  const { data: coupons = [] } = useCoupons()
  const activeVouchers = coupons.filter((c) => couponStatus(c) === 'active').length
  const navigate = useNavigate()
  const dialog = useDialog()

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

  const customerCare: MenuItem[] = [
    { to: '/faq', label: 'FAQ', hint: 'Answers to common questions', icon: CircleHelp },
    { to: '/contact', label: 'Contact us', hint: 'Get in touch with us', icon: Headset },
  ]

  const legal: MenuItem[] = [
    { to: '/about', label: 'About us', hint: 'Who we are', icon: Info },
    { to: '/privacy', label: 'Privacy Policy', hint: 'How We Protect Your Data', icon: ShieldCheck },
    { to: '/terms', label: 'Terms and Conditions', hint: 'Store Guidelines', icon: FileText },
  ]

  async function handleSignOut() {
    const ok = await dialog.confirm({
      title: 'Log out?',
      message: "Are you sure you want to log out?.",
      confirmLabel: 'Confirm',
    })
    if (!ok) return
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

      <MenuList items={menu} />

      <div className="mt-4 space-y-3">
        <OrderAlertsCard />
        <InstallApp variant="card" />
      </div>

      <Section title="Customer care">
        <MenuList items={customerCare} />
      </Section>

      <Section title="Legal">
        <MenuList items={legal} />
      </Section>

      <button
        onClick={handleSignOut}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:border-sale hover:text-sale"
      >
        <LogOut size={16} /> Log out
      </button>

    </div>
  )
}
