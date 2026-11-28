// Every cache key the app uses for server data, in one place.
//
// Why: the same key used to be typed out by hand in many files, so a typo or a changed key meant a screen
// quietly stopped refreshing. Now a key is written once here and imported everywhere.
//
// How the keys work: React Query refreshes every cache entry whose key STARTS with the key you give it.
// So invalidating `products.root()` also refreshes the pool, the recent list, the shop pages and the search
// results, because all of those start with 'products'. Keep that in mind when adding keys: put new product
// lists under products.*, so live stock updates reach them.

import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const queryKeys = {
  categories: () => ['categories'] as const,
  banners: () => ['banners'] as const,

  products: {
    root: () => ['products'] as const,
    pool: () => ['products', 'pool'] as const,
    recent: (ids: string[]) => ['products', 'recent', ids] as const,
    shop: (categoryId: string | null, min: number | null, max: number | null, seed: number) =>
      ['products', 'shop', categoryId ?? 'all', min, max, seed] as const,
    search: (term: string, categoryId: string | null, min: number | null, max: number | null) =>
      ['products', 'search', term, categoryId ?? 'all', min, max] as const,
    suggest: (term: string) => ['products', 'suggest', term] as const,
  },

  product: {
    root: () => ['product'] as const,
    detail: (productId: string | undefined) => ['product', productId] as const,
  },

  variantInfo: {
    root: () => ['variant-info'] as const,
    forIds: (ids: string[]) => ['variant-info', ids] as const,
  },

  appSettings: () => ['app-settings'] as const,
  deliveryZones: () => ['delivery-zones'] as const,
  sitePage: (slug: string) => ['site-page', slug] as const,

  account: {
    profile: (userId: string | undefined) => ['profile', userId] as const,
    addresses: (userId: string | undefined) => ['addresses', userId] as const,
    addressesRoot: () => ['addresses'] as const,
    coupons: (userId: string | undefined) => ['coupons', userId] as const,
    couponsRoot: () => ['coupons'] as const,
    referralProgress: (userId: string | undefined) => ['referral-progress', userId] as const,
    marketingPref: (userId: string | undefined) => ['push-marketing', userId] as const,
  },

  reviews: {
    stats: () => ['review-stats'] as const,
    store: (filters: unknown) => ['store-reviews', filters] as const,
    product: (productId: string | undefined) => ['product-reviews', productId] as const,
    products: (reviewIds: string[]) => ['review-products', reviewIds.join(',')] as const,
    media: (reviewIds: string[]) => ['review-media', reviewIds.join(',')] as const,
    reviewedOrders: (userId: string | undefined) => ['my-reviewed-orders', userId] as const,
    promptOrders: (userId: string | undefined) => ['review-prompt-orders', userId] as const,
    orderReview: (orderId: string | undefined) => ['my-review', orderId] as const,
    orderToReview: (orderId: string | undefined) => ['order-to-review', orderId] as const,
    // Everything that shows reviews, so one new review (or one hidden review) appears everywhere.
    allShown: () =>
      [
        ['review-stats'],
        ['store-reviews'],
        ['product-reviews'],
        ['review-products'],
        ['review-media'],
        ['my-reviewed-orders'],
        ['my-review'],
        ['admin-reviews'],
      ] as const,
  },

  cart: {
    root: () => ['cart'] as const,
    forUser: (userId: string | null) => ['cart', userId] as const,
  },

  wishlist: {
    root: () => ['wishlist'] as const,
    forUser: (userId: string | null) => ['wishlist', userId] as const,
  },

  orders: {
    detail: (orderId: string | undefined) => ['order', orderId] as const,
    events: (orderId: string | undefined) => ['order-events', orderId] as const,
    mine: (userId: string | undefined) => ['my-orders', userId] as const,
    purchaseHistory: (userId: string | undefined) => ['purchase-history', userId] as const,
  },

  delivery: {
    mine: (orderId: string) => ['my-delivery', orderId] as const,
    quote: (addressId: unknown, latitude: unknown, longitude: unknown, note: unknown) =>
      ['delivery-quote', addressId, latitude, longitude, note] as const,
    quoteRoot: () => ['delivery-quote'] as const,
  },

  admin: {
    orders: (status: string) => ['admin-orders', status] as const,
    ordersRoot: () => ['admin-orders'] as const,
    paymentIssues: () => ['payment-issues'] as const,
    deliveryEvents: (orderId: string) => ['delivery-events', orderId] as const,
    zones: () => ['admin-zones'] as const,
    reviews: () => ['admin-reviews'] as const,
    support: (status: string) => ['admin-support', status] as const,
    supportRoot: () => ['admin-support'] as const,
    supportMessages: (chatId: string) => ['admin-support-messages', chatId] as const,
    pushSettings: () => ['push-settings'] as const,
    jobOverview: () => ['job-overview'] as const,
    promos: () => ['admin-promos'] as const,
    pushActivity: () => ['push-activity'] as const,
    sitePages: () => ['admin-site-pages'] as const,
    templates: () => ['admin-templates'] as const,
    referrals: (userId: string) => ['admin-referrals', userId] as const,
    coupons: () => ['admin-coupons'] as const,
    couponStats: () => ['admin-coupon-stats'] as const,
    customers: (search: string, page: number) => ['admin-customers', search, page] as const,
    dashboard: (days: number) => ['admin-dashboard', days] as const,
    counts: {
      newOrders: () => ['new-orders-count'] as const,
      paymentIssues: () => ['payment-issues-count'] as const,
      support: () => ['support-count'] as const,
    },
    categories: () => ['admin-categories'] as const,
    products: () => ['admin-products'] as const,
    product: (productId: string | undefined) => ['admin-product', productId] as const,
    banners: () => ['admin-banners'] as const,
  },
}

// Refreshes several groups of cached data at once, and resolves when they have all refreshed.
export function invalidateAll(queryClient: QueryClient, keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
