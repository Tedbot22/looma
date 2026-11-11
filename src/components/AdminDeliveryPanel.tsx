import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bike, Copy, History, Link2, RefreshCw, Send, UserRoundPlus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useDialog } from '../context/DialogContext'
import { supabase } from '../lib/supabase'
import { whatsappLinkTo } from '../lib/whatsapp'
import {
  ACTIVE_STATUSES, ASSIGNMENT_LABEL, ASSIGNMENT_STYLE, EVENT_LABEL, eventDetail, friendlyDeliveryError,
  isValidRider, riderLink, riderMessage, when,
  type DeliveryAssignment, type DeliveryEvent, type LinkResult,
} from '../lib/adminDelivery'

// The owner's delivery tools for ONE order: assign a rider, share the link on WhatsApp,
// replace a lost link, reassign, cancel, and read the audit history.
// Every rule is enforced by the database; this panel only asks and shows the answer.

interface Props {
  orderId: string
  orderNumber: number
  orderStatus: string
  assignments: DeliveryAssignment[]
  onChanged: () => void // refresh the orders list
}

// The secret link exists only right after it is created. It is kept in memory only, never saved.
interface FreshLink {
  assignmentId: string
  url: string
}

export default function AdminDeliveryPanel({ orderId, orderNumber, orderStatus, assignments, onChanged }: Props) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<FreshLink | null>(null)
  const [reassigning, setReassigning] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const sorted = [...assignments].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const active = sorted.find((a) => ACTIVE_STATUSES.includes(a.status))
  const past = sorted.filter((a) => a !== active)
  const canAssign = !active && ['placed', 'confirmed', 'out_for_delivery'].includes(orderStatus)

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['delivery-events', orderId],
    queryFn: async (): Promise<DeliveryEvent[]> => {
      const { data, error } = await supabase
        .from('delivery_events')
        .select('id, event_type, outcome, actor, detail, created_at')
        .eq('order_id', orderId)
        .order('created_at')
      if (error) throw error
      return data as DeliveryEvent[]
    },
    enabled: showHistory,
    refetchInterval: showHistory ? 10_000 : false,
  })

  // One place that calls the database, handles errors, and refreshes.
  async function call(fn: string, args: Record<string, unknown>, onOk?: (data: unknown) => void) {
    if (busy) return false
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) {
      toast.error(friendlyDeliveryError(error.message))
      return false
    }
    onOk?.(data)
    onChanged()
    return true
  }

  const keepLink = (data: unknown) => {
    const r = data as LinkResult
    setFresh({ assignmentId: r.assignment_id, url: riderLink(r.token) })
  }

  const assign = (name: string, phone: string, company: string) =>
    call('assign_rider', { p_order_id: orderId, p_name: name, p_phone: phone, p_company: company || null }, (d) => {
      keepLink(d)
      toast.success('Rider assigned. Now send them the link.')
    })

  const reassign = async (name: string, phone: string, company: string) => {
    if (!active) return
    const ok = await call(
      'reassign_rider',
      { p_assignment_id: active.id, p_name: name, p_phone: phone, p_company: company || null },
      (d) => {
        keepLink(d)
        toast.success('Rider changed. The old link no longer works.')
      }
    )
    if (ok) setReassigning(false)
  }

  async function newLink() {
    if (!active) return
    const ok = await dialog.confirm({
      title: 'Create a new rider link?',
      message: 'The current link will stop working straight away. Send the new one to the rider.',
      confirmLabel: 'Create new link',
    })
    if (!ok) return
    call('replace_delivery_link', { p_assignment_id: active.id }, (d) => {
      keepLink(d)
      toast.success('New link created. Send it to the rider.')
    })
  }

  async function cancelAssignment() {
    if (!active) return
    const reason = await dialog.prompt({
      title: 'Cancel this delivery assignment?',
      message: "The rider's link will stop working. The order itself stays as it is.",
      label: 'Reason (optional)',
      placeholder: 'e.g. Rider is no longer available',
      confirmLabel: 'Cancel assignment',
      cancelLabel: 'Keep assignment',
      danger: true,
      multiline: true,
    })
    if (reason === null) return
    call('cancel_assignment', { p_assignment_id: active.id, p_reason: reason }, () => {
      setFresh(null)
      toast.success('Assignment cancelled. The rider link no longer works.')
    })
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy. Use the WhatsApp button instead.")
    }
  }

  // Nothing to show on orders that can't have a rider and never had one.
  if (!active && !canAssign && past.length === 0) return null

  const linkExpired = !!active && new Date(active.expires_at).getTime() < Date.now()
  const showFresh = fresh && active && fresh.assignmentId === active.id ? fresh : null

  return (
    <section className="mt-4 rounded-lg border border-purple-100 bg-purple-50/50 p-4" aria-label="Delivery">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Bike size={16} /> Delivery rider
      </p>

      {/* ---- A rider is assigned ---- */}
      {active && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm">
              <p className="font-medium">{active.rider_name}</p>
              <p className="text-gray-600">
                {active.rider_phone}
                {active.dispatch_company ? ` · ${active.dispatch_company}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">Assigned {when(active.created_at)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ASSIGNMENT_STYLE[active.status]}`}>
              {ASSIGNMENT_LABEL[active.status]}
            </span>
          </div>

          <p className={`text-xs ${linkExpired ? 'font-medium text-red-600' : 'text-gray-500'}`}>
            {linkExpired ? 'The rider link has expired. Create a new one.' : `Rider link works until ${when(active.expires_at)}`}
            {active.qr_verified_at && ` · QR verified ${when(active.qr_verified_at)}`}
          </p>

          {showFresh ? (
            <div className="space-y-2 rounded-lg border border-green-200 bg-white p-3">
              <p className="text-sm font-medium text-green-800">Link ready. Send it to {active.rider_name.split(' ')[0]}:</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={whatsappLinkTo(active.rider_phone, riderMessage(active.rider_name, orderNumber, showFresh.url))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  <Send size={15} /> Share Delivery Link
                </a>
                <button
                  onClick={() => copyLink(showFresh.url)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-brand"
                >
                  <Copy size={15} /> Copy link
                </button>
              </div>
              <p className="text-xs text-gray-500">
                This link is shown only now, for your eyes only. If you lose it, create a new one.
              </p>
            </div>
          ) : (
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <Link2 size={14} className="mt-0.5 shrink-0" />
              The link can't be shown again for safety. Need to send it again? Create a new link.
            </p>
          )}

          {!reassigning && (
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={newLink}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:border-brand disabled:opacity-60"
              >
                <RefreshCw size={15} /> New link
              </button>
              <button
                disabled={busy}
                onClick={() => setReassigning(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:border-brand disabled:opacity-60"
              >
                <UserRoundPlus size={15} /> Change rider
              </button>
              <button
                disabled={busy}
                onClick={cancelAssignment}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <XCircle size={15} /> Cancel delivery
              </button>
            </div>
          )}

          {reassigning && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {active.rider_name}'s link and the customer's current QR code stop working immediately.
              </p>
              <RiderForm
                busy={busy}
                submitLabel="Change rider and create link"
                onSubmit={reassign}
                onCancel={() => setReassigning(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* ---- No rider yet ---- */}
      {!active && canAssign && (
        <div>
          {past[0] && (past[0].status === 'failed' || past[0].status === 'cancelled') && (
            <p className="mb-3 flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              The last attempt ({past[0].rider_name}) ended as "{ASSIGNMENT_LABEL[past[0].status].toLowerCase()}"
              {past[0].closed_reason ? `: ${past[0].closed_reason.replace(/_/g, ' ')}` : ''}. Assign a rider to try again.
            </p>
          )}
          <RiderForm busy={busy} submitLabel="Assign rider and create link" onSubmit={assign} />
        </div>
      )}

      {/* ---- Earlier assignments ---- */}
      {past.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-purple-100 pt-3 text-xs text-gray-600">
          {past.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {a.rider_name} · {a.rider_phone}
                {a.closed_reason ? ` · ${a.closed_reason.replace(/_/g, ' ')}` : ''}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${ASSIGNMENT_STYLE[a.status]}`}>
                {ASSIGNMENT_LABEL[a.status]}
                {a.status === 'delivered' && a.completed_at ? ` ${when(a.completed_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* ---- Audit history ---- */}
      {(active || past.length > 0) && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 underline"
          >
            <History size={13} /> {showHistory ? 'Hide delivery history' : 'Delivery history'}
          </button>
          {showHistory && (
            <ol className="mt-2 space-y-1.5 rounded-lg bg-white p-3 text-xs">
              {loadingEvents && <li className="text-gray-400">Loading…</li>}
              {events?.length === 0 && <li className="text-gray-400">No events yet.</li>}
              {events?.map((e) => {
                const detail = eventDetail(e)
                return (
                  <li key={e.id} className="flex flex-wrap justify-between gap-x-3">
                    <span className={e.outcome === 'failure' ? 'text-red-700' : 'text-gray-800'}>
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                      {detail && <span className="text-gray-400"> ({detail})</span>}
                    </span>
                    <span className="text-gray-400">
                      {e.actor} · {when(e.created_at)}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function RiderForm({
  busy, submitLabel, onSubmit, onCancel,
}: {
  busy: boolean
  submitLabel: string
  onSubmit: (name: string, phone: string, company: string) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const valid = isValidRider(name, phone)

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Rider's full name"
          aria-label="Rider's full name"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
          inputMode="tel"
          placeholder="Rider's phone number"
          aria-label="Rider's phone number"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        maxLength={100}
        placeholder="Dispatch company (optional)"
        aria-label="Dispatch company (optional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={busy || !valid}
          onClick={() => onSubmit(name, phone, company)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {busy ? 'Working…' : submitLabel}
        </button>
        {onCancel && (
          <button
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
          >
            Back
          </button>
        )}
      </div>
    </div>
  )
}
