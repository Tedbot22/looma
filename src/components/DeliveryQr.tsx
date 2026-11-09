import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { CheckCircle2, Phone, QrCode, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'

// The customer's side of delivery verification.
// Shown on the order page only while a rider is assigned. The QR code is short-lived and
// single-use: it is created when the customer taps the button, and the server (not this page)
// decides whether a scan of it is valid.

interface MyDelivery {
  status: 'assigned' | 'out_for_delivery' | 'qr_verified' | 'delivered' | 'failed' | 'cancelled' | 'reassigned'
  rider_name: string
  rider_phone: string
  dispatch_company: string | null
  active: boolean
  qr_verified: boolean
}

// The code held in memory only while it is on screen. Never stored, never put in the address bar.
interface ShownQr {
  image: string // the drawn QR as a picture
  expiresAtMs: number // device time when it runs out, counted from the server's "seconds left"
}

const ERRORS: Record<string, string> = {
  NO_ACTIVE_DELIVERY: 'There is no active delivery for this order right now.',
  ALREADY_VERIFIED: 'Your code was already scanned. Waiting for the rider to confirm.',
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
  const [qr, setQr] = useState<ShownQr | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Who is delivering, and how far verification has got. Checked often while a code is on screen,
  // so the page reacts the moment the rider scans.
  const { data: delivery } = useQuery({
    queryKey: ['my-delivery', orderId],
    queryFn: async (): Promise<MyDelivery | null> => {
      const { data, error } = await supabase.rpc('my_delivery', { p_order_id: orderId })
      if (error) throw error
      return (data as MyDelivery | null) ?? null
    },
    refetchInterval: qr ? 2500 : 8000,
  })

  // Countdown tick, only while a code is showing.
  useEffect(() => {
    if (!qr) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [qr])

  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.expiresAtMs - now) / 1000)) : 0
  const expired = !!qr && secondsLeft === 0

  // Hide the code as soon as it is no longer useful: scanned, expired, or the delivery ended.
  useEffect(() => {
    if (!qr) return
    if (expired || delivery?.qr_verified || (delivery && !delivery.active)) setQr(null)
    if (expired) setError('That code has expired. Tap the button for a new one.')
  }, [qr, expired, delivery])

  // Once the delivery is finished, refresh the order so the page shows "Delivered".
  useEffect(() => {
    if (delivery?.status === 'delivered') {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['order-events', orderId] })
    }
  }, [delivery?.status, orderId, queryClient])

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
      const image = await QRCode.toDataURL(reply.token, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      setNow(Date.now())
      setQr({ image, expiresAtMs: Date.now() + reply.expires_in_seconds * 1000 })
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
            <span className="font-semibold">Your code was scanned.</span> The rider is finishing the delivery now.
          </p>
        </div>
      ) : qr ? (
        <div className="mt-4 text-center">
          <div className="inline-block rounded-xl bg-white p-3 shadow-sm">
            <img src={qr.image} alt="Your delivery QR code" width={288} height={288} className="mx-auto" />
          </div>
          <p className="mt-2 text-sm font-medium tabular-nums" aria-live="off">
            Expires in {mins}:{secs}
          </p>
          <p className="mt-1 text-xs text-gray-600">Turn your screen brightness up and let the rider scan this code.</p>
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
          <p className="mt-2 text-xs text-gray-600">Tap this only when the rider is with you.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="mt-4 flex gap-2 text-xs text-gray-600">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        Never send a screenshot of this code or show it to anyone but your rider. It can only be used once.
      </p>
    </section>
  )
}
