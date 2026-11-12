import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, MessageSquareText, Phone, QrCode, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'

// The customer's side of delivery verification.
// Shown on the order page only while a rider is assigned. The customer shows a QR code for the
// rider to scan. If that isn't possible, the RIDER can ask for a 6-digit code to be texted to the
// phone number on the order: the customer doesn't need this page for that, and the code is never
// shown on any screen. The server decides whether any code is valid.

interface MyDelivery {
  status: 'assigned' | 'out_for_delivery' | 'qr_verified' | 'delivered' | 'failed' | 'cancelled' | 'reassigned'
  rider_name: string
  rider_phone: string
  dispatch_company: string | null
  active: boolean
  qr_verified: boolean
}

// What is on screen right now. Held in memory only: never stored, never put in the address bar.
type Shown = { image: string; expiresAtMs: number }

const ERRORS: Record<string, string> = {
  NO_ACTIVE_DELIVERY: 'There is no active delivery for this order right now.',
  ALREADY_VERIFIED: 'Your delivery was already verified. Waiting for the rider to confirm.',
  TOO_MANY_CODES: "You've requested a lot of codes. Please wait a little while and try again.",
  ORDER_NOT_FOUND: "We couldn't find that order.",
  NOT_AUTHENTICATED: 'Please sign in again.',
}

function errorText(message: string | undefined): string {
  const hit = Object.keys(ERRORS).find((k) => message?.includes(k))
  return hit ? ERRORS[hit] : "We couldn't create your code. Check your connection and try again."
}

export default function DeliveryQr({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const [shown, setShown] = useState<Shown | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Who is delivering, and how far verification has got. Checked often while a code is on screen,
  // so the page reacts the moment the rider verifies.
  const { data: delivery } = useQuery({
    queryKey: ['my-delivery', orderId],
    queryFn: async (): Promise<MyDelivery | null> => {
      const { data, error } = await supabase.rpc('my_delivery', { p_order_id: orderId })
      if (error) throw error
      return (data as MyDelivery | null) ?? null
    },
    refetchInterval: shown ? 2500 : 8000,
  })

  // Countdown tick, only while something is showing.
  useEffect(() => {
    if (!shown) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [shown])

  const secondsLeft = shown ? Math.max(0, Math.ceil((shown.expiresAtMs - now) / 1000)) : 0
  const expired = !!shown && secondsLeft === 0

  // Hide the code as soon as it is no longer useful: verified, expired, or the delivery ended.
  useEffect(() => {
    if (!shown) return
    if (expired || delivery?.qr_verified || (delivery && !delivery.active)) setShown(null)
    if (expired) setError('Code has expired. Request for a new one.')
  }, [shown, expired, delivery])

  // Once the delivery is finished, refresh the order so the page shows "Delivered".
  useEffect(() => {
    if (delivery?.status === 'delivered') {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-events', orderId] })
    }
  }, [delivery?.status, orderId, queryClient])

  // Makes a fresh QR code. Making one cancels any earlier one.
  async function showQr() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('create_delivery_qr', { p_order_id: orderId })
      if (rpcError || !data) {
        setError(errorText(rpcError?.message))
        return
      }
      const reply = data as { token: string; expires_in_seconds: number }
      const { default: QRCode } = await import('qrcode')
      const image = await QRCode.toDataURL(reply.token, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      setNow(Date.now())
      setShown({ image, expiresAtMs: Date.now() + reply.expires_in_seconds * 1000 })
      queryClient.invalidateQueries({ queryKey: ['my-delivery', orderId] })
    } catch {
      setError(errorText(undefined))
    } finally {
      setBusy(false)
    }
  }

  // Nothing to show unless a rider is currently assigned.
  if (!delivery || !delivery.active) return null

  const mins = Math.floor(secondsLeft / 60)
  const secs = String(secondsLeft % 60).padStart(2, '0')

  return (
    <section className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-4" aria-label="Delivery verification">
      <p className="text-sm font-semibold text-purple-900">Your rider</p>
      <p className="mt-1 font-medium">{delivery.rider_name}</p>
      <a href={`tel:${delivery.rider_phone}`} className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-brand">
        <Phone size={14} /> {delivery.rider_phone}
        {delivery.dispatch_company ? <span className="text-gray-500"> · {delivery.dispatch_company}</span> : null}
      </a>

      {delivery.qr_verified ? (
        <div role="status" className="mt-4 flex gap-3 rounded-lg bg-white p-3 text-sm text-green-800">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-600" />
          <p>
            <span className="font-semibold">Your code has been verified.</span> The rider is completing your delivery now.
          </p>
        </div>
      ) : shown ? (
        <div className="mt-4 text-center">
          <div className="inline-block rounded-xl bg-white p-3 shadow-sm">
            <img src={shown.image} alt="Your delivery QR code" width={288} height={288} className="mx-auto" />
          </div>
          <p className="mt-2 text-sm font-medium tabular-nums">
            Expires in {mins}:{secs}
          </p>
          <p className="mt-1 text-xs text-gray-600">Present this QR code to the delivery rider for scanning and verification.</p>
        </div>
      ) : (
        <div className="mt-4">
          <button
            onClick={showQr}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-light disabled:opacity-60"
          >
            <QrCode size={18} /> {busy ? 'Creating your code…' : 'Show Delivery QR'}
          </button>
          <p className="mt-2 text-xs text-gray-600">Present this QR code to the delivery rider for scanning and verification.</p>
        </div>
      )}

      {!delivery.qr_verified && (
        <p className="mt-3 flex gap-2 text-xs text-gray-600">
          <MessageSquareText size={14} className="mt-0.5 shrink-0" />
          Can't show the QR? Tell your delivery rider. They can request a 6-digit code to the phone number on your order.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="mt-4 flex gap-2 text-xs text-gray-600">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        Never send a screenshot or share a code with anyone except the delivery rider standing with you. Each code can only be
        used once.
      </p>
    </section>
  )
}
