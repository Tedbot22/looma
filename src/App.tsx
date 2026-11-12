import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
const Shop = lazy(() => import('./pages/Shop'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const Cart = lazy(() => import('./pages/Cart'))
const Wishlist = lazy(() => import('./pages/Wishlist'))
const AccountLayout = lazy(() => import('./pages/account/AccountLayout'))
const AccountHome = lazy(() => import('./pages/account/AccountHome'))
const AccountOrders = lazy(() => import('./pages/account/AccountOrders'))
const Vouchers = lazy(() => import('./pages/account/Vouchers'))
const RecentlyViewed = lazy(() => import('./pages/account/RecentlyViewed'))
const EditProfile = lazy(() => import('./pages/account/EditProfile'))
const Invite = lazy(() => import('./pages/account/Invite'))
const Auth = lazy(() => import('./pages/Auth'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'))
const ContentPage = lazy(() => import('./pages/ContentPage'))
const Contact = lazy(() => import('./pages/Contact'))
const TodaysDeals = lazy(() => import('./pages/TodaysDeals'))
const Recommended = lazy(() => import('./pages/Recommended'))
const Reviews = lazy(() => import('./pages/Reviews'))
const SubmitReview = lazy(() => import('./pages/SubmitReview'))
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'))
const AdminProductEdit = lazy(() => import('./pages/admin/AdminProductEdit'))
const ProductForm = lazy(() => import('./pages/admin/ProductForm'))
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'))
const AdminDelivery = lazy(() => import('./pages/admin/AdminDelivery'))
const AdminBanners = lazy(() => import('./pages/admin/AdminBanners'))
const AdminStore = lazy(() => import('./pages/admin/AdminStore'))
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'))
const AdminPaymentIssues = lazy(() => import('./pages/admin/AdminPaymentIssues'))
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'))
const ComingSoon = lazy(() => import('./pages/ComingSoon'))
const RiderDelivery = lazy(() => import('./pages/RiderDelivery'))
import ScrollToTop from './components/ScrollToTop'
import RouteSeo from './components/RouteSeo'

function PageFallback() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-[40vh] items-center justify-center">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
    <ScrollToTop />
    <RouteSeo />
      {/* Each page is its own chunk, downloaded the first time it is visited. */}
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Admin area: its own layout, only for the owner */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:productId" element={<AdminProductEdit />} />
          <Route path="delivery" element={<AdminDelivery />} />
          <Route path="banners" element={<AdminBanners />} />
          <Route path="store" element={<AdminStore />} />
          <Route path="vouchers" element={<AdminCoupons />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="payments" element={<AdminPaymentIssues />} />
          <Route path="support" element={<AdminSupport />} />
        </Route>

        {/* Rider delivery page: no login, no store header/footer. The secret link is the credential. */}
        <Route path="/rider/:token" element={<RiderDelivery />} />

        {/* Everything inside Layout gets the shared header and footer */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:categoryId" element={<Shop />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/cart" element={<Cart />} />
          {/* Help and company pages (the owner edits their text in Admin, then Store) */}
          <Route path="/about" element={<ContentPage slug="about" />} />
          <Route path="/faq" element={<ContentPage slug="faq" accordion />} />
          <Route path="/privacy" element={<ContentPage slug="privacy" />} />
          <Route path="/terms" element={<ContentPage slug="terms" />} />
          <Route path="/contact" element={<Contact />} />

          {/* The full lists behind the home page's "View all" buttons (open to everyone) */}
          <Route path="/todays-deals" element={<TodaysDeals />} />
          <Route path="/recommended" element={<Recommended />} />
          <Route path="/recently-viewed" element={<RecentlyViewed />} />

          {/* The wishlist now lives inside the account area; old links still work */}
          <Route path="/wishlist" element={<Navigate to="/account/wishlist" replace />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AccountHome />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="vouchers" element={<Vouchers />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="recently-viewed" element={<RecentlyViewed />} />
            <Route path="invite" element={<Invite />} />
            <Route path="profile" element={<EditProfile />} />
          </Route>
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route
            path="/checkout"
            element={
              <RequireAuth>
                <Checkout />
              </RequireAuth>
            }
          />
          <Route
            path="/order/:orderId"
            element={
              <RequireAuth>
                <OrderConfirmation />
              </RequireAuth>
            }
          />
          <Route path="/reviews" element={<Reviews />} />
          <Route
            path="/review/:orderId"
            element={
              <RequireAuth>
                <SubmitReview />
              </RequireAuth>
            }
          />
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
