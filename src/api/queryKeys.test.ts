import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { invalidateAll, queryKeys } from './queryKeys'

const startsWith = (key: readonly unknown[], root: readonly unknown[]) => root.every((part, i) => key[i] === part)

describe('queryKeys', () => {
  it('keeps every product list under "products", so live stock updates and admin edits refresh them all', () => {
    const root = queryKeys.products.root()
    const everyProductKey = [
      queryKeys.products.pool(),
      queryKeys.products.recent(['a', 'b']),
      queryKeys.products.shop(null, null, null, 1),
      queryKeys.products.search('jacket', 'cat', 1000, 5000),
      queryKeys.products.suggest('jac'),
    ]
    for (const key of everyProductKey) expect(startsWith(key, root), JSON.stringify(key)).toBe(true)
  })

  it('keeps single products and stock look-ups under their own roots', () => {
    expect(startsWith(queryKeys.product.detail('p1'), queryKeys.product.root())).toBe(true)
    expect(startsWith(queryKeys.variantInfo.forIds(['v1']), queryKeys.variantInfo.root())).toBe(true)
  })

  it('gives each shop view its own cache entry', () => {
    const base = queryKeys.products.shop('cat', 1000, 5000, 7)
    expect(queryKeys.products.shop('other', 1000, 5000, 7)).not.toEqual(base)
    expect(queryKeys.products.shop('cat', 2000, 5000, 7)).not.toEqual(base)
    expect(queryKeys.products.shop('cat', 1000, 6000, 7)).not.toEqual(base)
    expect(queryKeys.products.shop('cat', 1000, 5000, 8)).not.toEqual(base)
    expect(queryKeys.products.shop('cat', 1000, 5000, 7)).toEqual(base)
  })

  it('writes "no category" the same way everywhere', () => {
    expect(queryKeys.products.shop(null, null, null, 1)[2]).toBe('all')
    expect(queryKeys.products.search('x', null, null, null)[3]).toBe('all')
  })

  it('has no two different things sharing one key', () => {
    const keys = [
      queryKeys.categories(),
      queryKeys.banners(),
      queryKeys.products.root(),
      queryKeys.product.root(),
      queryKeys.variantInfo.root(),
      queryKeys.admin.categories(),
      queryKeys.admin.products(),
      queryKeys.admin.product('p'),
      queryKeys.admin.banners(),
      queryKeys.cart.root(),
      queryKeys.wishlist.root(),
      queryKeys.orders.detail('o'),
      queryKeys.orders.events('o'),
      queryKeys.orders.mine('u'),
      queryKeys.orders.purchaseHistory('u'),
      queryKeys.delivery.mine('o'),
      queryKeys.admin.ordersRoot(),
      queryKeys.admin.paymentIssues(),
      queryKeys.admin.deliveryEvents('o'),
      queryKeys.admin.counts.newOrders(),
      queryKeys.admin.counts.paymentIssues(),
      queryKeys.admin.counts.support(),
      queryKeys.appSettings(),
      queryKeys.deliveryZones(),
      queryKeys.sitePage('faq'),
      queryKeys.account.profile('u'),
      queryKeys.account.addresses('u'),
      queryKeys.account.coupons('u'),
      queryKeys.account.referralProgress('u'),
      queryKeys.delivery.quote('a', 1, 2, null),
      queryKeys.admin.zones(),
      queryKeys.admin.sitePages(),
      queryKeys.admin.templates(),
      queryKeys.admin.referrals('u'),
      queryKeys.admin.coupons(),
      queryKeys.admin.couponStats(),
      queryKeys.admin.customers('', 0),
      queryKeys.admin.dashboard(30),
    ].map((k) => JSON.stringify(k))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('queryKeys for a customer and the owner', () => {
  it('keeps each customer’s cart and wishlist under a shared root, so live stock updates reach them', () => {
    expect(startsWith(queryKeys.cart.forUser('u1'), queryKeys.cart.root())).toBe(true)
    expect(startsWith(queryKeys.wishlist.forUser(null), queryKeys.wishlist.root())).toBe(true)
  })

  it('keeps every order list refreshable from one place', () => {
    expect(startsWith(queryKeys.admin.orders('placed'), queryKeys.admin.ordersRoot())).toBe(true)
    expect(startsWith(queryKeys.admin.orders('all'), queryKeys.admin.ordersRoot())).toBe(true)
  })

  it('keeps one customer’s data apart from another’s', () => {
    expect(queryKeys.cart.forUser('u1')).not.toEqual(queryKeys.cart.forUser('u2'))
    expect(queryKeys.orders.mine('u1')).not.toEqual(queryKeys.orders.mine('u2'))
  })
})

describe('queryKeys for the account', () => {
  it('lets one call refresh all of a customer’s addresses, vouchers or quotes', () => {
    expect(startsWith(queryKeys.account.addresses('u1'), queryKeys.account.addressesRoot())).toBe(true)
    expect(startsWith(queryKeys.account.coupons('u1'), queryKeys.account.couponsRoot())).toBe(true)
    expect(startsWith(queryKeys.delivery.quote('a', 1, 2, 'n'), queryKeys.delivery.quoteRoot())).toBe(true)
  })

  it('keeps one customer’s data apart from another’s', () => {
    expect(queryKeys.account.profile('u1')).not.toEqual(queryKeys.account.profile('u2'))
    expect(queryKeys.account.addresses('u1')).not.toEqual(queryKeys.account.addresses('u2'))
  })
})

describe('invalidateAll', () => {
  it('refreshes every key it is given and waits for all of them', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    await invalidateAll(client, [queryKeys.categories(), queryKeys.products.root()])
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['categories'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['products'] })
  })
})
