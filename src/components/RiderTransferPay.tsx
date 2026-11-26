import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, Landmark } from 'lucide-react'
import { formatNaira } from '../lib/format'
import { createTransferAccount, getTransferState } from '../api/rider'
import type { TransferAccount } from '../lib/rider'

// Pay-on-delivery customers pay ONLY by transfer: the rider generates a temporary bank account for this
// delivery. No cash is accepted. The server (not this page) confirms the money arrived with Paystack.
// Renders nothing for orders that are not pay-on-delivery.

interface Props {
  token: string
  riderStatus: string
  // True when the delivery data says there is money to collect: we then show this card even if the
  // payment service can't be reached, so the rider sees a problem instead of a missing button.
  expected: boolean
  onState: (state: { applicable: boolean; paid: boolean }) => void
}

const POLL_MS = 6000

export default function RiderTransferPay({ token, riderStatus, expected, onState }: Props) {
  const [applicable, setApplicable] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [paid, setPaid] = useState(false)
  const [account, setAccount] = useState<TransferAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const busyRef = useRef(false)

  const apply = useCallback(
    (reply: Awaited<ReturnType<typeof getTransferState>>) => {
      if (!reply.ok) return false
      setLoadFailed(false)
      const isApplicable = reply.applicable === true
      setApplicable(isApplicable)
      const isPaid = reply.paid === true
      setPaid(isPaid)
      onState({ applicable: isApplicable, paid: isPaid })
      setAccount(isPaid ? null : ((reply.account as TransferAccount | null) ?? null))
      return true
    },
    [onState]
  )

  // First look, and again when the rider returns to this page.
  const refresh = useCallback(async () => {
    const ok = apply(await getTransferState(token))
    if (!ok) setLoadFailed(true)
    setLoaded(true)
  }, [apply, token])

  useEffect(() => {
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  // While an account is showing, keep asking the server whether the transfer has arrived.
  const expiresMs = account ? new Date(account.expires_at).getTime() : 0
  useEffect(() => {
    if (!account || paid) return
    const id = setInterval(() => {
      setNow(Date.now())
      refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [account, paid, refresh])

  async function generate() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const reply = await createTransferAccount(token)
      if (!apply(reply)) {
        setError(
          typeof reply.message === 'string'
            ? reply.message
            : reply.code === 'NETWORK'
              ? 'No connection. Nothing was changed. Try again.'
              : 'Could not create the account. Try again, or contact LOOMA.'
        )
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Copy isn't available on every phone browser; the number is on screen anyway.
    }
  }

  if (!applicable) {
    if (!expected) return null
    // Money is due but we have no answer from the payment service yet (or it failed).
    return (
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Landmark size={16} /> Payment by bank transfer
        </p>
        {!loaded ? (
          <p className="text-gray-500">Loading payment options…</p>
        ) : (
          <>
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
              {loadFailed
                ? "Couldn't load the payment option. Check your connection and try again. If it keeps failing, contact LOOMA."
                : 'Transfer payment is not available for this order. Contact LOOMA.'}
            </p>
            <button onClick={refresh} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 font-medium">
              Try again
            </button>
          </>
        )}
      </section>
    )
  }

  if (paid) {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Paid by bank transfer</p>
          <p className="mt-0.5 text-sm opacity-90">Payment confirmed. Do not collect any cash for this order.</p>
        </div>
      </div>
    )
  }

  const expired = account ? now >= expiresMs : false
  const minsLeft = account ? Math.max(0, Math.ceil((expiresMs - now) / 60_000)) : 0

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Landmark size={16} /> Payment by bank transfer
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          {error}
        </p>
      )}

      {!account || expired ? (
        <>
          <p className="text-gray-600">
            The customer pays by transfer, not cash. Create a one-time bank account for this order; they send the exact
            amount to it and you'll see "Paid" here once it arrives. The money goes to the store, not to you.
          </p>
          <button
            disabled={busy || !['out_for_delivery', 'qr_verified'].includes(riderStatus)}
            onClick={generate}
            className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Creating account…' : expired ? 'Create a new account' : 'Create transfer account'}
          </button>
          {!['out_for_delivery', 'qr_verified'].includes(riderStatus) && (
            <p className="text-xs text-gray-500">Tap "I've picked up the package" first, then this button unlocks.</p>
          )}
        </>
      ) : (
        <>
          <dl className="space-y-2 rounded-lg bg-gray-50 p-3">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Bank</dt>
              <dd className="font-medium">{account.bank_name ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Account number</dt>
              <dd className="flex items-center gap-2 text-lg font-bold tracking-wider">
                {account.account_number}
                <button
                  onClick={() => copy(account.account_number)}
                  aria-label="Copy account number"
                  className="rounded border border-gray-300 p-1.5 text-gray-600"
                >
                  <Copy size={14} />
                </button>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Account name</dt>
              <dd className="text-right font-medium">{account.account_name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-gray-200 pt-2">
              <dt className="text-gray-500">Exact amount</dt>
              <dd className="font-bold">{formatNaira(account.amount)}</dd>
            </div>
          </dl>
          {copied && <p className="text-xs text-green-700">Account number copied.</p>}
          <p className="text-xs text-gray-600">
            Show this to the customer. They must send exactly {formatNaira(account.amount)}. This account works for
            about {minsLeft} more {minsLeft === 1 ? 'minute' : 'minutes'}. Waiting for the transfer…
          </p>
        </>
      )}
    </section>
  )
}
