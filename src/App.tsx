import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from '../../looma/src/components/Layout'
import Home from '../../looma/src/pages/Home'
import Shop from '../../looma/src/pages/Shop'
import ProductPage from '../../looma/src/pages/ProductPage'
import Cart from '../../looma/src/pages/Cart'
import Wishlist from '../../looma/src/pages/Wishlist'
import AccountLayout from '../../looma/src/pages/account/AccountLayout'
import AccountHome from '../../looma/src/pages/account/AccountHome'
import AccountOrders from '../../looma/src/pages/account/AccountOrders'
import Vouchers from '../../looma/src/pages/account/Vouchers'
import RecentlyViewed from '../../looma/src/pages/account/RecentlyViewed'
import EditProfile from '../../looma/src/pages/account/EditProfile'
import Invite from '../../looma/src/pages/account/Invite'
import Auth from '../../looma/src/pages/Auth'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import RequireAuth from '../../looma/src/components/RequireAuth'
import RequireAdmin from '../../looma/src/components/RequireAdmin'
import AdminLayout from '../../looma/src/pages/admin/AdminLayout'
import AdminOrders from '../../looma/src/pages/admin/AdminOrders'
import AdminProducts from '../../looma/src/pages/admin/AdminProducts'
import AdminProductEdit from '../../looma/src/pages/admin/AdminProductEdit'
import ProductForm from '../../looma/src/pages/admin/ProductForm'
import AdminCoupons from '../../looma/src/pages/admin/AdminCoupons'
import AdminDelivery from '../../looma/src/pages/admin/AdminDelivery'
import ComingSoon from '../../looma/src/pages/ComingSoon'

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
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:productId" element={<AdminProductEdit />} />
          <Route path="delivery" element={<AdminDelivery />} />
          <Route path="vouchers" element={<AdminCoupons />} />
        </Route>

        {/* Everything inside Layout gets the shared header and footer */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:categoryId" element={<Shop />} />
          <Route path="/product/:productId" element={<ProductPage />} />
          <Route path="/cart" element={<Cart />} />
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
          <Route path="*" element={<ComingSoon title="Page not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
