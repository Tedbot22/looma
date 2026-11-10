import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductPage from './pages/ProductPage'
import Cart from './pages/Cart'
import Wishlist from './pages/Wishlist'
import AccountLayout from './pages/account/AccountLayout'
import AccountHome from './pages/account/AccountHome'
import AccountOrders from './pages/account/AccountOrders'
import Vouchers from './pages/account/Vouchers'
import RecentlyViewed from './pages/account/RecentlyViewed'
import EditProfile from './pages/account/EditProfile'
import Invite from './pages/account/Invite'
import Auth from './pages/Auth'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import ContentPage from './pages/ContentPage'
import Contact from './pages/Contact'
import Recommended from './pages/Recommended'
import Reviews from './pages/Reviews'
import SubmitReview from './pages/SubmitReview'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOrders from './pages/admin/AdminOrders'
import AdminProducts from './pages/admin/AdminProducts'
import AdminCategories from './pages/admin/AdminCategories'
import AdminProductEdit from './pages/admin/AdminProductEdit'
import ProductForm from './pages/admin/ProductForm'
import AdminCoupons from './pages/admin/AdminCoupons'
import AdminDelivery from './pages/admin/AdminDelivery'
import AdminBanners from './pages/admin/AdminBanners'
import AdminStore from './pages/admin/AdminStore'
import AdminReviews from './pages/admin/AdminReviews'
import AdminPaymentIssues from './pages/admin/AdminPaymentIssues'
import ComingSoon from './pages/ComingSoon'
import RiderDelivery from './pages/RiderDelivery'

export default function App() {
  return (
    <BrowserRouter>
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
          <Route index element={<AdminOrders />} />
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
    </BrowserRouter>
  )
}
