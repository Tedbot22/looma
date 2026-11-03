import { Check, X } from 'lucide-react'
import type { Order, OrderEvent } from '../lib/types'

// The usual journey of an order, in order.
const STEPS: { key: Order['status']; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed by the store' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
]

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })

interface Props {
  events: OrderEvent[]
  status: Order['status']
}

export default function OrderTimeline({ events, status }: Props) {
  // The most recent event for each status (an order only passes through each once).
  const latest = new Map<string, OrderEvent>()
  for (const e of events) latest.set(e.status, e)

  const cancelled = status === 'cancelled'
  const awaitingPayment = status === 'pending_payment' || latest.has('pending_payment')

  // How far along are we? The last normal step that has an event.
  let reached = -1
  STEPS.forEach((s, i) => {
    if (latest.has(s.key)) reached = i
  })

  return (
    <ol className="space-y-0">
      {awaitingPayment && (
        <Row
          label="Awaiting payment"
          done={status !== 'pending_payment'}
          current={status === 'pending_payment'}
          event={latest.get('pending_payment')}
        />
      )}

      {STEPS.map((step, i) => (
        <Row
          key={step.key}
          label={step.label}
          // A step counts as done if we've reached it or gone past it (even if the store skipped it).
          done={i <= reached}
          current={!cancelled && i === reached && status !== 'delivered'}
          event={latest.get(step.key)}
          muted={cancelled && i > reached}
          last={!cancelled && i === STEPS.length - 1}
        />
      ))}

      {cancelled && (
        <Row label="Cancelled" done failed event={latest.get('cancelled')} last />
      )}
    </ol>
  )
}

function Row({
  label,
  done,
  current,
  failed,
  muted,
  event,
  last,
}: {
  label: string
  done: boolean
  current?: boolean
  failed?: boolean
  muted?: boolean
  event?: OrderEvent
  last?: boolean
}) {
  const dot = failed
    ? 'bg-red-600 text-white'
    : done
      ? 'bg-brand text-white'
      : 'border-2 border-gray-200 bg-white text-transparent'

  return (
    <li className={`flex gap-3 ${muted ? 'opacity-40' : ''}`}>
      <div className="flex flex-col items-center">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dot} ${
            current ? 'ring-4 ring-gray-200' : ''
          }`}
        >
          {failed ? <X size={14} /> : <Check size={14} />}
        </span>
        {!last && <span className={`w-0.5 flex-1 ${done && !failed ? 'bg-brand' : 'bg-gray-200'}`} />}
      </div>

      <div className="pb-6">
        <p className={`text-sm font-medium ${done ? 'text-gray-900' : 'text-gray-400'}`}>{label}</p>
        {event && <p className="text-xs text-gray-400">{when(event.created_at)}</p>}
        {event?.note && <p className="mt-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-sm text-gray-600">{event.note}</p>}
      </div>
    </li>
  )
}
