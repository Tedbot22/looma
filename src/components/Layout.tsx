import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { ShoppingCart, User } from 'lucide-react'
import { REFERRAL_KEY } from '../config'
import { PAGE_WIDTH } from '../lib/layout'
import { useCart } from '../context/CartContext'
import { useProfile } from '../hooks/useProfile'
import { useRealtimeStock } from '../hooks/useRealtimeStock'
import { useAuth } from '../context/AuthContext'
import HeaderSearch from './HeaderSearch'
import Logos from './Logos'
import Footer from './Footer'
import ReviewPromptBanner from '../components/ReviewPromptBanner'
import SupportChat from './SupportChat'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-brand' : 'text-gray-500 hover:text-brand'
  }`
// Pages where the footer is just noise: sign-in, checkout/order steps, the account area and 404.
// To hide it somewhere else, add the path start here. To bring it back, remove it.
   // "Focused" pages: sign-in, checkout/order steps, review submission and the account area.
   // They hide the footer and the header search so people stay on the task.
   // To hide them somewhere else, add the path start here. To bring them back, remove it.
   const FOCUSED_PREFIXES = ['/login', '/signup', '/checkout', '/order', '/review', '/account']
   const FOOTER_PAGES = ['/', '/shop', '/product', '/cart', '/about', '/faq', '/privacy', '/terms', '/contact', '/recommended', '/recently-viewed', '/reviews', '/wishlist']

   const matches = (pathname: string, base: string) =>
     base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(base + '/')

   const isFocusedPage = (pathname: string) => FOCUSED_PREFIXES.some((p) => matches(pathname, p))

   // Footer only on known public pages (so the "Page not found" screen doesn't get one).
   const shouldShowFooter = (pathname: string) =>
     !isFocusedPage(pathname) && FOOTER_PAGES.some((p) => matches(pathname, p))

export default function Layout() {
  const { count } = useCart()
  const { data: profile } = useProfile()
  useRealtimeStock() // items flip to "Sold out" live, without a refresh
  const { user } = useAuth()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const showFooter = shouldShowFooter(pathname)
  const showSearch = !isFocusedPage(pathname)


  // Invite links look like https://yourstore.com/?ref=AB12CD34.
  // Remember the code so it can pre-fill the signup form, even if they browse first.
  useEffect(() => {
    const ref = params.get('ref')
    if (ref) {
      try {
        localStorage.setItem(REFERRAL_KEY, ref.toUpperCase())
      } catch {
        /* storage blocked: they can still type the code by hand */
      }
    }
  }, [params])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        {/* On a phone the search drops to its own full-width row; on a larger screen it sits in the middle. */}
        <div className={`${PAGE_WIDTH} flex flex-wrap items-center gap-x-4 gap-y-3 py-3 md:grid md:grid-cols-[1fr_minmax(0,36rem)_1fr] md:gap-x-8`}>
          <Link to="/" aria-label="Home" className="order-1 justify-self-start">
            <Logos />
          </Link>

            {showSearch && <HeaderSearch className="order-3 w-full min-w-0 md:order-2" />}

          <nav className="order-2 ml-auto flex items-center gap-5 md:order-3 md:ml-0 md:justify-self-end md:gap-6">
            <NavLink to="/" end className={`${navLinkClass} hidden md:block`}>
              Home
            </NavLink>
            <NavLink to="/shop" className={navLinkClass}>
              Shop
            </NavLink>
            <Link to="/cart" aria-label="Cart" className="relative text-brand">
              <ShoppingCart size={22} />
              {count > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
            {profile?.is_admin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            {user ? (
              <Link to="/account" aria-label="Your account" className="text-brand">
                <User size={22} />
              </Link>
            ) : (
              <NavLink to="/login" className={navLinkClass}>
                Log in
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      {/* <Outlet /> is where the current page renders */}
      <main className={`${PAGE_WIDTH} flex-1 py-6`}>
        <Outlet />
      </main>

      <ReviewPromptBanner />
      <SupportChat />
      {showFooter && <Footer />}
    </div>
  )
}
