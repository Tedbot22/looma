import { useState } from 'react'
import { ListSkeleton } from '../../components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, MessageCircle, Phone, Route } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { whatsappLinkTo } from '../../lib/whatsapp'
import { formatKm, routeUrl } from '../../lib/delivery'
import { cancelOrder } from '../../lib/payments'
import type { OrderWithItems } from '../../lib/types'
import AdminDeliveryPanel from '../../components/AdminDeliveryPanel'
import { ACTIVE_STATUSES, type DeliveryAssignment } from '../../lib/adminDelivery'

type AdminOrder = OrderWithItems & {
  profiles: { full_name: string | null; phone: string | null } | null
  delivery_assignments: DeliveryAssignment[]
}

const TABS = [
  { key: 'placed', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'out_for_delivery', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
] as const

const STATUS_STYLE: Record<OrderWithItems['status'], string> = {
  pending_payment: 'bg-gray-100 text-gray-600',
  placed: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<OrderWithItems['status'], string> = {
  pending_payment: 'Awaiting payment',
  placed: 'New',
  confirmed: 'Confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

// Turn the database's error codes into plain language.
const ERROR_TEXT: Record<string, string> = {
  ORDER_CLOSED: 'This order is already delivered or cancelled.',
  INVALID_TRANSITION: "That change isn't allowed for this order's current status.",
  NOT_ADMIN: "You don't have permission to do that.",
  USE_CANCEL_ORDER: 'Use the Cancel button, so any payment is refunded.',
}

function friendlyError(message: string): string {
  const code = Object.keys(ERROR_TEXT).find((c) => message.includes(c))
  return code ? ERROR_TEXT[code] : 'Something went wrong. Please try again.'
}

export default function AdminOrders() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('placed')
  const queryClient = useQueryClient()

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['admin-orders', tab],
    queryFn: async (): Promise<AdminOrder[]> => {
      let query = supabase
        .from('orders')
        .select(
          '*, order_items(*), profiles(full_name, phone), ' +
            'delivery_assignments(id, order_id, rider_name, rider_phone, dispatch_company, status, expires_at, qr_verified_at, completed_at, closed_reason, created_at)'
        )
        .order('created_at', { ascending: false })
        .limit(100)

      if (tab !== 'all') query = query.eq('status', tab)

      const { data, error } = await query
      if (error) throw error
      return data as unknown as AdminOrder[]
    },
    refetchInterval: 15_000, // check for new orders every 15 seconds (push alerts come later)
  })

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: string
      status: 'confirmed' | 'out_for_delivery' | 'delivered'
      note?: string
    }) => {
      const { error } = await supabase.rpc('set_order_status', {
        p_order_id: id,
        p_status: status,
        p_note: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Order updated')
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
    },
    onError: (err) => toast.error(friendlyError((err as Error).message)),
  })

  // Cancelling goes through the server so a paid order is refunded and stock is restored together.
  const cancelMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => cancelOrder(id, note),
    onSuccess: (result) => {
      if (result.refund === 'failed') toast.warning(result.message)
      else toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['payment-issues'] })
    },
    onError: (err) => toast.error((err as Error).message),
  })

  // The note is shown to the customer on their tracking page (e.g. who is bringing the order).
  function sendOut(order: AdminOrder) {
    const note = window.prompt('Note for the customer (optional), e.g. rider name and phone number:')
    if (note === null) return // cancelled
    updateStatus.mutate({ id: order.id, status: 'out_for_delivery', note })
  }

  // With a rider assigned, "delivered" should come from the QR check. Doing it by hand skips that, so warn first.
  function markDelivered(order: AdminOrder, hasRider: boolean) {
    if (
      hasRider &&
      !window.confirm(
        'A rider is assigned to this order. Marking it delivered by hand SKIPS the customer QR check, ' +
          "ends the rider's link, and is recorded as a manual override. Continue?"
      )
    )
      return
    updateStatus.mutate({ id: order.id, status: 'delivered' })
  }

  function cancel(order: AdminOrder) {
    const refundable = order.payment_method === 'online' && order.payment_status === 'paid'
    const warning = refundable
      ? `Cancel order #${order.order_number}? Its items go back into stock and ${formatNaira(order.total)} is refunded to the customer.`
      : `Cancel order #${order.order_number}? Its items will go back into stock.`
    if (!window.confirm(warning)) return
    const note = window.prompt('Reason for the customer (optional). They will see it on their order page:')
    if (note === null) return // changed their mind
    cancelMutation.mutate({ id: order.id, note })
  }

  return (
    <div>
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t.key
                ? 'border-brand bg-brand text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <p className="text-red-600">Couldn't load orders: {(error as Error).message}</p>}
      {orders && orders.length === 0 && (
        <p className="py-16 text-center text-gray-400">No orders here yet.</p>
      )}

      <div className="space-y-4">
        {orders?.map((order) => {
          const customerName = order.profiles?.full_name || 'Customer'
          const closed = order.status === 'delivered' || order.status === 'cancelled'
          const hasRider = (order.delivery_assignments ?? []).some((a) => ACTIVE_STATUSES.includes(a.status))
          const message = `Hi ${customerName}, this is about your order #${order.order_number}.`

          return (
            <article key={order.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Order #{order.order_number}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleString('en-NG', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[order.status]}`}
                >
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              <ul className="mt-4 space-y-1 text-sm">
                {order.order_items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>
                      {i.name} <span className="text-gray-400">× {i.quantity}</span>
                    </span>
                    <span className="shrink-0 text-gray-600">{formatNaira(i.unit_price * i.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm font-semibold">
                <span>
                  Total{' '}
                  <span className="font-normal text-gray-400">
                    ({order.payment_method === 'on_delivery' ? 'pay on delivery' : 'online'},{' '}
                    {order.payment_status.replace('_', ' ')})
                  </span>
                </span>
                <span>{formatNaira(order.total)}</span>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-gray-600">
                <p className="font-medium text-gray-900">{customerName}</p>
                <p className="flex items-center gap-2">
                  <Phone size={14} className="shrink-0 text-gray-400" /> {order.phone}
                </p>
                <p className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>
                    {order.delivery_zone && <span className="font-medium text-gray-900">{order.delivery_zone}</span>}
                    {order.delivery_zone && order.delivery_address ? ': ' : ''}
                    {order.delivery_address}
                  </span>
                </p>
                {order.delivery_note && (
                  <p className="pl-6 text-sm text-gray-600">Note: {order.delivery_note}</p>
                )}
                {order.delivery_lat != null && order.delivery_lon != null && (
                  <p className="pl-6 text-xs text-gray-400">
                    Location: {order.delivery_lat}, {order.delivery_lon}
                    {order.delivery_distance_m != null && ` · ${formatKm(order.delivery_distance_m)} from the store`}
                  </p>
                )}
                {order.delivery_fee > 0 && (
                  <p className="pl-6 text-xs text-gray-400">Includes {formatNaira(order.delivery_fee)} delivery fee</p>
                )}
                {order.discount > 0 && (
                  <p className="pl-6 text-xs font-medium text-green-700">
                    Voucher used: {formatNaira(order.discount)} off (already taken off the total)
                  </p>
                )}
              </div>

              <AdminDeliveryPanel
                orderId={order.id}
                orderNumber={order.order_number}
                orderStatus={order.status}
                assignments={order.delivery_assignments ?? []}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })}
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={whatsappLinkTo(order.phone, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-brand"
                >
                  <MessageCircle size={15} /> Message customer
                </a>

                {order.delivery_lat != null &&
                  order.delivery_lon != null &&
                  order.origin_lat != null &&
                  order.origin_lon != null && (
                    <a
                      href={routeUrl(
                        { lat: order.origin_lat, lon: order.origin_lon },
                        { lat: order.delivery_lat, lon: order.delivery_lon }
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-brand"
                    >
                      <Route size={15} /> View route
                    </a>
                  )}

                {order.status === 'placed' && (
                  <button
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: order.id, status: 'confirmed' })}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                  >
                    Confirm
                  </button>
                )}
                {(order.status === 'placed' || order.status === 'confirmed') && !hasRider && (
                  <button
                    disabled={updateStatus.isPending}
                    onClick={() => sendOut(order)}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
                  >
                    Out for delivery
                  </button>
                )}
                {(order.status === 'placed' || order.status === 'confirmed' || order.status === 'out_for_delivery') && (
                  <button
                    disabled={updateStatus.isPending}
                    onClick={() => markDelivered(order, hasRider)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    Mark delivered
                  </button>
                )}
                {!closed && (
                  <button
                    disabled={updateStatus.isPending || cancelMutation.isPending}
                    onClick={() => cancel(order)}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
