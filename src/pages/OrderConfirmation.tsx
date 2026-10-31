import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatNaira } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'
import type { OrderWithItems } from '../lib/types'

const STATUS_LABEL: Record<OrderWithItems['status'], string> = {
  pending_payment: 'Awaiting payment',
  placed: 'Order received',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export default function OrderConfirmation() {
  const { orderId } = useParams()

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
  })

  if (isLoading) return <p className="py-20 text-center text-gray-400">Loading your order…</p>
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

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-green-600" size={48} />
        <h1 className="mt-3 text-2xl font-bold">Thank you! Your order is in.</h1>
        <p className="mt-1 text-gray-500">
          Order <span className="font-semibold">#{order.order_number}</span> ·{' '}
          {STATUS_LABEL[order.status]}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          We'll contact you on {order.phone} to confirm delivery.
        </p>
      </div>

      <div className="mt-8 space-y-4 rounded-xl bg-gray-50 p-5">
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

        <div className="flex justify-between border-t border-gray-200 pt-3 font-semibold">
          <span>Total</span>
          <span>{formatNaira(order.total)}</span>
        </div>

        <dl className="space-y-1 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Payment</dt>
            <dd>{order.payment_method === 'on_delivery' ? 'Pay on delivery' : 'Online'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Deliver to</dt>
            <dd className="text-right">{order.delivery_address}</dd>
          </div>
        </dl>
      </div>

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
