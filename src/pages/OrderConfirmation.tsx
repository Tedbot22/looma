import { useEffect, useRef, useState } from 'react'
import { OrderSkeleton } from '../components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabase'
import { formatNaira } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'
import { useCart } from '../context/CartContext'
import { cancelOrder, startPayment, verifyPayment } from '../lib/payments'
import OrderTimeline from '../components/OrderTimeline'
import DeliveryQr from '../components/DeliveryQr'
import { OrderReviewSection } from '../components/RateOrder'
import OrderAlertsCard from '../components/OrderAlertsCard'
import type { OrderEvent, OrderWithItems } from '../lib/types'

const STATUS_LABEL: Record<OrderWithItems['status'], string> = {
  pending_payment: 'Awaiting payment',
  placed: 'Order received',
  confirmed: 'Confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export default function OrderConfirmation() {
  const dialog = useDialog()
  const { orderId } = useParams()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [paying, setPaying] = useState(false)
  const verifying = useRef(false)
  const { removeItems } = useCart()
  // True only when the customer arrived from Paystack in this visit (the address had ?reference=...).
  const cameFromPaystack = useRef(false)
  // Stays on screen (a toast disappears in seconds) when we could not confirm a payment.
  const [paymentProblem, setPaymentProblem] = useState<{ reference: string; message: string } | null>(null)

  const justOrdered = (location.state as { justOrdered?: boolean } | null)?.justOrdered === true
  // Paystack sends the customer back with ?reference=... (and ?trxref=...).
  const reference = params.get('reference') ?? params.get('trxref')
  if (reference) cameFromPaystack.current = true

  const {
    data: order,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async (): Promise<OrderWithItems | null> => {
      // RLS guarantees you can only read your own orders.
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId!)
        .maybeSingle()
      if (error) throw error
      return data as OrderWithItems | null
    },
    enabled: !!orderId,
    // While we wait for a payment to be confirmed, check every few seconds.
    refetchInterval: (query) => (query.state.data?.status === 'pending_payment' ? 4000 : false),
  })

  const { data: events = [] } = useQuery({
    queryKey: ['order-events', orderId],
    queryFn: async (): Promise<OrderEvent[]> => {
      const { data, error } = await supabase
        .from('order_events')
        .select('*')
        .eq('order_id', orderId!)
        .order('created_at')
      if (error) throw error
      return data as OrderEvent[]
    },
    enabled: !!orderId,
  })

  // LIVE TRACKING: when the store changes this order, refresh instantly (no reload needed).
  useEffect(() => {
    if (!orderId) return
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', orderId] })
          queryClient.invalidateQueries({ queryKey: ['order-events', orderId] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, queryClient])

  // Just came back from Paystack? Ask the server to confirm the payment right away.
  useEffect(() => {
    if (!orderId || !reference || verifying.current) return
    verifying.current = true

    const showProblem = (message: string) => setPaymentProblem({ reference, message })

    verifyPayment(orderId, reference)
      .then((result) => {
        if (result.status === 'paid' || result.status === 'already_paid') {
          setPaymentProblem(null)
          toast.success('Payment received. Thank you!')
        } else if (result.status === 'not_paid') {
          showProblem("We couldn't confirm a payment for this attempt. If you were charged, don't pay again: send us the reference below and we'll sort it out.")
        } else if (result.status === 'refunded') {
          showProblem('Your order was cancelled before the payment arrived, so the payment is being refunded. This can take a few business days.')
        } else if (result.status === 'duplicate_refunded') {
          toast.success('Your order is paid. You were charged twice by mistake, and the extra payment is being refunded.')
        } else if (result.status === 'mismatch') {
          showProblem(result.message ?? 'The amount paid did not match your order, so it is being refunded.')
        } else if (result.status === 'refund_failed') {
          showProblem(result.message ?? 'There was a problem with your payment. The store has been alerted and will sort it out.')
        } else {
          showProblem(result.message ?? 'We could not confirm your payment yet. If you were charged, send us the reference below.')
        }
      })
      .catch((err) => showProblem((err as Error).message))
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ['order', orderId] })
        queryClient.invalidateQueries({ queryKey: ['order-events', orderId] })
        setParams({}, { replace: true }) // tidy the address bar
      })
  }, [orderId, reference, queryClient, setParams])

  // The cart is only emptied once Paystack payment is confirmed. (Checkout leaves online orders'
  // items in the cart so nothing is lost if the payment page fails or is abandoned.)
  const cartCleared = useRef(false)
  const paidOnline = order?.payment_method === 'online' && order?.payment_status === 'paid'
  useEffect(() => {
    if (!order || !paidOnline || !cameFromPaystack.current || cartCleared.current) return
    cartCleared.current = true
    const ids = order.order_items.map((i) => i.variant_id).filter((id): id is string => !!id)
    if (ids.length > 0) removeItems(ids)
  }, [order, paidOnline, removeItems])

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(orderId!),
    onSuccess: (result) => {
      if (result.refund === 'failed') toast.warning(result.message)
      else toast.success(result.message)
    },
    onError: (err) => toast.error((err as Error).message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-events', orderId] })
    },
  })

  async function cancelThisOrder() {
    const paidOnline = order?.payment_method === 'online' && order?.payment_status === 'paid'
    const ok = await dialog.confirm({
      title: 'Cancel this order?',
      message: paidOnline
        ? 'Your payment will be refunded, which can take a few business days.'
        : 'The items will go back on sale for other customers.',
      confirmLabel: 'Yes, cancel order',
      cancelLabel: 'Keep order',
      danger: true,
    })
    if (ok) cancelMutation.mutate()
  }

  async function payNow() {
    if (!orderId) return
    setPaying(true)
    try {
      window.location.href = await startPayment(orderId)
    } catch (err) {
      toast.error((err as Error).message)
      setPaying(false)
    }
  }

  if (isLoading) return <OrderSkeleton />
  if (error || !order) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">We couldn't find that order.</p>
        <Link to="/shop" className="mt-3 inline-block font-medium text-brand underline">
          Back to shop
        </Link>
      </div>
    )
  }

  const careMessage = `Hi! I have a question about my order #${order.order_number} (ID: ${order.id}).`
  const awaitingPayment = order.status === 'pending_payment'
  const holdUntil = order.expires_at
    ? new Date(order.expires_at).toLocaleTimeString('en-NG', { timeStyle: 'short' })
    : null

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        {order.status === 'cancelled' ? null : awaitingPayment ? (
          <Clock className="mx-auto text-amber-500" size={44} />
        ) : (
          <CheckCircle2 className="mx-auto text-green-600" size={48} />
        )}
        <h1 className="mt-3 text-2xl font-bold">
          {awaitingPayment
            ? 'Complete your payment'
            : order.status === 'cancelled'
              ? `Order #${order.order_number} was cancelled`
              : justOrdered
                ? 'Thank you! Your order is in.'
                : `Order #${order.order_number}`}
        </h1>
        <p className="mt-1 text-gray-500">
          Order <span className="font-semibold">#{order.order_number}</span> · {STATUS_LABEL[order.status]}
        </p>
      </div>

      {order.refund_needs_details && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">We need your bank details to finish your refund</p>
              <p className="mt-1">
                Your payment method can’t be refunded automatically. Please contact customer care and send us your account name,
                account number and bank. You can also tell us about any problem with the order.
              </p>
              <a
                href={whatsappLink(
                  `Hi! My refund for order #${order.order_number} (ID: ${order.id}) needs my bank details. I would like to send them now.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
              >
                <MessageCircle size={16} /> Contact customer care
              </a>
            </div>
          </div>
        </div>
      )}

      {paymentProblem && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={20} />
            <div className="min-w-0 text-sm text-red-900">
              <p className="font-semibold">There was a problem with your payment</p>
              <p className="mt-1">{paymentProblem.message}</p>
              <p className="mt-3 text-xs text-red-700">Payment reference (keep this):</p>
              <p className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-700">{paymentProblem.reference}</p>
              <a
                href={whatsappLink(
                  `Hi! I had a problem paying for order #${order.order_number} (ID: ${order.id}). Payment reference: ${paymentProblem.reference}`
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
              >
                <MessageCircle size={16} /> Message us on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {awaitingPayment && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-900">
            Your items are reserved{holdUntil ? ` until ${holdUntil}` : ' for a short while'}. Pay to confirm the
            order.
          </p>
          <button
            onClick={payNow}
            disabled={paying}
            className="mt-3 w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
          >
            {paying ? 'Opening payment…' : `Pay ${formatNaira(order.total)} now`}
          </button>
        </div>
      )}

      {/* Delivery verification: appears only while a rider is assigned */}
      {!awaitingPayment && order.status !== 'cancelled' && order.status !== 'delivered' && (
        <DeliveryQr orderId={order.id} />
      )}

      {/* Once delivered (the QR block above is gone by then): invite a voluntary review */}
      {order.status === 'delivered' && (
        <div className="mt-6">
          <OrderReviewSection orderId={order.id} orderNumber={order.order_number} />
        </div>
      )}

      {/* Offer notifications while the order is still on its way */}
      {(order.status === 'placed' || order.status === 'confirmed' || order.status === 'out_for_delivery') && (
        <div className="mt-6">
          <OrderAlertsCard variant="compact" />
        </div>
      )}

      {/* Tracking */}
      <section className="mt-8">
        <h2 className="mb-4 font-semibold">Tracking</h2>
        <OrderTimeline events={events} status={order.status} />
      </section>

      {/* Details */}
      <div className="mt-2 space-y-4 rounded-xl bg-gray-50 p-5">
        <ul className="space-y-2 text-sm">
          {order.order_items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="text-gray-600">
                {i.name} × {i.quantity}
              </span>
              <span className="shrink-0 font-medium">{formatNaira(i.unit_price * i.quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Subtotal</dt>
            <dd>{formatNaira(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Delivery{order.delivery_zone ? ` (${order.delivery_zone})` : ''}</dt>
            <dd>{formatNaira(order.delivery_fee)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-green-700">
              <dt>Voucher</dt>
              <dd>-{formatNaira(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatNaira(order.total)}</dd>
          </div>
        </dl>

        <dl className="space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Payment</dt>
            <dd>
              {order.payment_method === 'on_delivery'
                ? order.payment_status === 'paid'
                  ? 'Paid by bank transfer'
                  : 'Pay on delivery'
                : order.payment_status === 'paid'
                  ? 'Paid online'
                  : order.payment_status === 'refund_pending'
                    ? 'Refund in progress (can take a few business days)'
                    : order.payment_status === 'refund_failed'
                      ? 'Refund being arranged by the store'
                      : order.payment_status === 'refunded'
                        ? 'Refunded'
                        : 'Online (not paid yet)'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Deliver to</dt>
            <dd className="text-right">
              {[order.delivery_zone, order.delivery_address].filter(Boolean).join(': ')}
              {order.delivery_note && <span className="block text-xs text-gray-500">{order.delivery_note}</span>}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Phone</dt>
            <dd>{order.phone}</dd>
          </div>
        </dl>
      </div>

      {(order.status === 'pending_payment' || order.status === 'placed' || order.status === 'confirmed') && (
        <button
          onClick={cancelThisOrder}
          disabled={cancelMutation.isPending}
          className="mt-6 w-full rounded-lg border border-red-200 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {cancelMutation.isPending ? 'Cancelling…' : 'Cancel this order'}
        </button>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappLink(careMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 font-medium hover:border-brand"
        >
          <MessageCircle size={18} /> Contact customer care
        </a>
        <Link
          to="/shop"
          className="flex-1 rounded-lg bg-brand py-3 text-center font-semibold text-white hover:bg-brand-light"
        >
          Keep shopping
        </Link>
      </div>
    </div>
  )
}
