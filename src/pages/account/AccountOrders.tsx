import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListSkeleton } from '../../components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useMyReviewedOrderIds } from '../../hooks/useReviews'
import type { Order } from '../../lib/types'

type MyOrder = Pick<Order, 'id' | 'order_number' | 'total' | 'status' | 'created_at'>

const STATUS_LABEL: Record<Order['status'], string> = {
  pending_payment: 'Awaiting payment',
  placed: 'Order received',
  confirmed: 'Confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<Order['status'], string> = {
  pending_payment: 'bg-gray-100 text-gray-600',
  placed: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

// The pages of the viewpager. "Order received" also covers orders still awaiting payment or confirmation,
// so no order is ever missing from every page.
const PAGES: { key: string; label: string; empty: string; statuses: Order['status'][] }[] = [
  { key: 'received', label: 'Order received', empty: 'No orders waiting to be delivered.', statuses: ['pending_payment', 'placed', 'confirmed'] },
  { key: 'out_for_delivery', label: 'Out for delivery', empty: 'Nothing is on the way right now.', statuses: ['out_for_delivery'] },
  { key: 'delivered', label: 'Delivered', empty: 'No delivered orders yet.', statuses: ['delivered'] },
  { key: 'cancelled', label: 'Cancelled', empty: 'No cancelled orders.', statuses: ['cancelled'] },
]

const PAGE_STORAGE_KEY = 'account-orders-page'

// Which page to open on: the one in the address (?tab=...), else the last one used in this browser session,
// else the first. Keeping it there means coming back from an order returns to the same page.
function readPage(param: string | null): number {
  const fromParam = PAGES.findIndex((p) => p.key === param)
  if (fromParam >= 0) return fromParam
  try {
    const fromStorage = PAGES.findIndex((p) => p.key === sessionStorage.getItem(PAGE_STORAGE_KEY))
    if (fromStorage >= 0) return fromStorage
  } catch {
    // storage can be unavailable (private mode): fall through to the first page
  }
  return 0
}

export default function AccountOrders() {
  const { user } = useAuth()
  const { data: reviewedIds } = useMyReviewedOrderIds()

  // The viewpager: swipe sideways (or tap a tab) to move between pages.
  const pager = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(() => readPage(params.get('tab')))

  // Remember the page, in the address and for the session (replace, so Back leaves instead of stepping through pages).
  function remember(i: number) {
    try {
      sessionStorage.setItem(PAGE_STORAGE_KEY, PAGES[i].key)
    } catch {
      // not fatal: the address still remembers it
    }
    setParams({ tab: PAGES[i].key }, { replace: true })
  }

  function goTo(i: number) {
    const el = pager.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  function handleScroll() {
    const el = pager.current
    if (!el || el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== page) {
      setPage(next)
      remember(next)
    }
  }

  // Keep the active tab visible when the tab row itself is scrolled (small phones).
  useEffect(() => {
    tabRefs.current[page]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [page])

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['my-orders', user?.id],
    queryFn: async (): Promise<MyOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total, status, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as MyOrder[]
    },
    enabled: !!user,
  })

  // The pager only exists once the orders have loaded: jump (without animating) to the remembered page then.
  const hasOrders = (orders?.length ?? 0) > 0
  useLayoutEffect(() => {
    const el = pager.current
    if (hasOrders && el) el.scrollTo({ left: page * el.clientWidth, behavior: 'auto' })
    // only when the pager first appears; later page changes come from the person swiping or tapping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOrders])

  const inPage = (statuses: Order['status'][]) => (orders ?? []).filter((o) => statuses.includes(o.status))

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Orders</h1>

      {isLoading && <ListSkeleton rows={4} />}
      {error && <p className="text-red-600">Couldn't load your orders.</p>}

      {orders && orders.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-400">You haven't placed any orders yet.</p>
          <Link to="/shop" className="mt-3 inline-block font-medium text-brand underline">
            Start shopping
          </Link>
        </div>
      )}

      {orders && orders.length > 0 && (
        <>
          <div
            role="tablist"
            className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {PAGES.map((p, i) => {
              const active = i === page
              return (
                <button
                  key={p.key}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${
                    active ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {p.label} <span className="text-xs text-gray-400">{inPage(p.statuses).length}</span>
                </button>
              )
            })}
          </div>

          <div
            ref={pager}
            onScroll={handleScroll}
            className="flex w-full snap-x snap-mandatory items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {PAGES.map((p) => {
              const list = inPage(p.statuses)
              return (
                <div key={p.key} role="tabpanel" className="w-full shrink-0 snap-center snap-always px-0.5">
                  {list.length === 0 ? (
                    <p className="py-12 text-center text-gray-400">{p.empty}</p>
                  ) : (
                    <ul className="space-y-3">
                      {list.map((o) => (
                        <li key={o.id}>
                          <Link
                            to={`/order/${o.id}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-brand"
                          >
                            <div>
                              <p className="font-medium">Order #{o.order_number}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(o.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{formatNaira(o.total)}</p>
                              <span className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>
                                {STATUS_LABEL[o.status]}
                              </span>
                              {o.status === 'delivered' && reviewedIds && !reviewedIds.includes(o.id) && (
                                <p className="mt-1 text-xs font-medium text-brand">★ Rate this order</p>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
