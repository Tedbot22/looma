import { Link } from 'react-router-dom'
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

export default function AccountOrders() {
  const { user } = useAuth()
  const { data: reviewedIds } = useMyReviewedOrderIds()

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

      <ul className="space-y-3">
        {orders?.map((o) => (
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
    </div>
  )
}
