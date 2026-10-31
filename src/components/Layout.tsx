import { useEffect } from 'react'
import { Link, NavLink, Outlet, useSearchParams } from 'react-router-dom'
import { Heart, ShoppingBag } from 'lucide-react'
import { REFERRAL_KEY, STORE_NAME } from '../config'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { useProfile } from '../hooks/useProfile'
import { useRealtimeStock } from '../hooks/useRealtimeStock'
import { useAuth } from '../context/AuthContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-brand' : 'text-gray-500 hover:text-brand'
  }`

export default function Layout() {
  const { count } = useCart()
  const { items: wishItems } = useWishlist()
  const { data: profile } = useProfile()
  useRealtimeStock() // items flip to "Sold out" live, without a refresh
  const { user, signOut } = useAuth()
  const [params] = useSearchParams()

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
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-brand">
            {STORE_NAME}
          </Link>

          <nav className="flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/shop" className={navLinkClass}>
              Shop
            </NavLink>
            <Link to="/wishlist" aria-label="Wishlist" className="relative text-brand">
              <Heart size={22} />
              {wishItems.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-700 px-1 text-[10px] font-bold text-white">
                  {wishItems.length}
                </span>
              )}
            </Link>
            <Link to="/cart" aria-label="Cart" className="relative text-brand">
              <ShoppingBag size={22} />
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
              <button onClick={signOut} className="text-sm font-medium text-gray-500 hover:text-brand">
                Log out
              </button>
            ) : (
              <NavLink to="/login" className={navLinkClass}>
                Log in
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      {/* <Outlet /> is where the current page renders */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} {STORE_NAME}. Affordable style for students.
      </footer>
    </div>
  )
}
