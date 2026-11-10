import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle, Banknote, CheckCircle2, Clock, MapPin, MessageCircle, Navigation, Package, Phone, QrCode,
} from 'lucide-react'
import QrScanner from '../components/QrScanner'
import { Skeleton } from '../components/Skeleton'
import { formatNaira } from '../lib/format'
import { whatsappLink } from '../lib/whatsapp'
import { STORE_NAME } from '../config'
import {
  DEAD_LINK_CODES, FAIL_REASONS, completeDelivery, getDelivery, messageFor, reportFailed, requestOtpSms, startDelivery, verifyOtp, verifyQr,
  type FailReason, type Reply, type RiderDelivery,
} from '../lib/rider'

// The rider's page. No login: the secret link is the credential.
// It shows "delivered" ONLY after the server replies that the delivery was completed.

type View =
  | { kind: 'loading' }
  | { kind: 'ready'; data: RiderDelivery }
  | { kind: 'closed'; code: string } // the link is finished (expired, cancelled, delivered...)
  | { kind: 'delivered'; already: boolean }
  | { kind: 'offline' } // first load failed: nothing is known yet

const STEPS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'out_for_delivery', label: 'On the way' },
  { key: 'qr_verified', label: 'QR verified' },
  { key: 'delivered', label: 'Delivered' },
] as const

// Keeps the secret link out of search engines and out of "referrer" headers sent to other sites.
function useHidePage() {
  useEffect(() => {
    const added: HTMLMetaElement[] = []
    for (const [name, content] of [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']]) {
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      added.push(m)
    }
    const oldTitle = document.title
    document.title = `${STORE_NAME} delivery`
    return () => {
      added.forEach((m) => m.remove())
      document.title = oldTitle
    }
  }, [])
}

export default function RiderDeliveryPage() {
  useHidePage()
  const { token = '' } = useParams()

  const [view, setView] = useState<View>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [problem, setProblem] = useState<string | null>(null) // a code to show as a message
  const [notice, setNotice] = useState<string | null>(null)
  const [showFail, setShowFail] = useState(false)
  const [failReason, setFailReason] = useState<FailReason | ''>('')
  const [failNote, setFailNote] = useState('')
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpSent, setOtpSent] = useState<{ hint: string | null; resendAtMs: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [otp, setOtp] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const busyRef = useRef(false) // blocks double taps before React re-renders

  // Reads the current state from the server. `quiet` keeps what's on screen if the network drops.
  const load = useCallback(
    async (quiet = false) => {
      const reply = await getDelivery(token)
      if (reply.ok) {
        setView({ kind: 'ready', data: reply as unknown as RiderDelivery })
      } else if (reply.code === 'ALREADY_DELIVERED') {
        setView({ kind: 'delivered', already: true })
      } else if (DEAD_LINK_CODES.includes(reply.code)) {
        setView({ kind: 'closed', code: reply.code })
      } else if (!quiet) {
        setView({ kind: 'offline' })
      }
    },
    [token]
  )

  useEffect(() => {
    load()
  }, [load])

  // Coming back to the page (after a call or the map) refreshes it.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load(true)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Runs one server action with double-tap protection and shared error handling.
  async function act(
    run: () => Promise<Reply>,
    onOk: (code: string, reply: Reply) => void | Promise<void>,
    onFail?: (reply: Reply) => boolean // return true if the caller dealt with it
  ) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setProblem(null)
    setNotice(null)
    setAttemptsLeft(null)
    try {
      const reply = await run()
      if (reply.ok) {
        await onOk(reply.code, reply)
      } else if (reply.code === 'ALREADY_DELIVERED') {
        setView({ kind: 'delivered', already: true })
      } else if (DEAD_LINK_CODES.includes(reply.code)) {
        setView({ kind: 'closed', code: reply.code })
      } else if (onFail?.(reply)) {
        // handled by the caller
      } else if (reply.code === 'ALREADY_VERIFIED') {
        await load(true) // someone already verified: show the Confirm step
      } else {
        setProblem(reply.code)
        setAttemptsLeft(typeof reply.attempts_left === 'number' ? reply.attempts_left : null)
        if (reply.code === 'VERIFICATION_EXPIRED') await load(true) // status went back a step
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const pickedUp = () => act(() => startDelivery(token), () => load(true))

  const onScanned = (value: string) => {
    setScanning(false)
    act(
      () => verifyQr(token, value),
      async () => {
        setNotice("Customer's code accepted. Now tap Confirm delivery.")
        await load(true)
      }
    )
  }

  // Backup to the QR: we TEXT a 6-digit code to the customer's phone and they read it out.
  // The code never appears on this screen.
  const sendOtp = () =>
    act(
      () => requestOtpSms(token),
      (_code, reply) =>
        setOtpSent({
          hint: typeof reply.phone_hint === 'string' ? reply.phone_hint : null,
          resendAtMs: Date.now() + Number(reply.cooldown_seconds ?? 60) * 1000,
        }),
      (reply) => {
        if (reply.code !== 'OTP_COOLDOWN') return false
        // A code was already texted a moment ago: go straight to typing it in.
        setOtpSent((prev) => ({
          hint: prev?.hint ?? null,
          resendAtMs: Date.now() + Number(reply.retry_after_seconds ?? 60) * 1000,
        }))
        return true
      }
    )

  // Counts down the "send again" wait while a code has been sent.
  useEffect(() => {
    if (!otpSent) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [otpSent])

  // Typing in the code the customer read out.
  const submitOtp = () =>
    act(
      () => verifyOtp(token, otp),
      async () => {
        setOtp('')
        setOtpOpen(false)
        setOtpSent(null)
        setNotice("Customer's code accepted. Now tap Confirm delivery.")
        await load(true)
      }
    )

  // The ONLY place the success screen appears: the server answered DELIVERED.
  const confirm = () =>
    act(
      () => completeDelivery(token),
      (code) => setView({ kind: 'delivered', already: code === 'ALREADY_DELIVERED' })
    )

  const submitFail = () => {
    if (!failReason) {
      setProblem('INVALID_REASON')
      return
    }
    act(
      () => reportFailed(token, failReason, failNote.trim()),
      () => setView({ kind: 'closed', code: 'DELIVERY_FAILED' })
    )
  }

  // ---------- Screens that aren't the main one ----------
  if (view.kind === 'loading') {
    return (
      <Shell>
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading delivery…</span>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </Shell>
    )
  }

  if (view.kind === 'offline') {
    const m = messageFor('NETWORK')
    return (
      <Shell>
        <Banner tone="amber" icon={<AlertTriangle size={22} />} title={m.title} text={m.text} />
        <button onClick={() => (setView({ kind: 'loading' }), load())} className={primaryBtn}>
          Try again
        </button>
      </Shell>
    )
  }

  if (view.kind === 'closed') {
    const m = messageFor(view.code)
    return (
      <Shell>
        <Banner tone="gray" icon={<AlertTriangle size={22} />} title={m.title} text={m.text} />
        <ContactStore />
      </Shell>
    )
  }

  if (view.kind === 'delivered') {
    return (
      <Shell>
        <Banner
          tone="green"
          icon={<CheckCircle2 size={26} />}
          title={view.already ? 'This order has already been delivered' : 'Delivery complete'}
          text={view.already ? 'Nothing more to do. Thank you!' : 'The order is recorded as delivered. Thank you!'}
        />
      </Shell>
    )
  }

  // ---------- Main screen ----------
  const { assignment: a, order: o, items } = view.data
  const stepIndex = STEPS.findIndex((s) => s.key === a.status)
  const mapsUrl =
    o.delivery_lat != null && o.delivery_lon != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${o.delivery_lat},${o.delivery_lon}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}`
  const verified = a.status === 'qr_verified'
  const problemMsg = problem ? messageFor(problem) : null

  return (
    <Shell>
      {scanning && <QrScanner onScan={onScanned} onClose={() => setScanning(false)} />}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{STORE_NAME} delivery</p>
        <h1 className="text-2xl font-bold">Order #{o.order_number}</h1>
      </div>

      {/* Progress */}
      <ol className="flex items-center" aria-label="Delivery progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 flex-col items-center gap-1 text-center">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i <= stepIndex ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'
              }`}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span className={`text-[11px] ${i <= stepIndex ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {/* Rider confirms it's them */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="text-gray-500">Delivering as</p>
        <p className="font-semibold">{a.rider_name}</p>
        <p className="text-gray-600">
          {a.rider_phone}
          {a.dispatch_company ? ` · ${a.dispatch_company}` : ''}
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Not you? Don't continue: this link is for one rider only.{' '}
          <a
            href={whatsappLink(`Hi, I received a delivery link for order #${o.order_number} but I am not ${a.rider_name}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline"
          >
            Tell {STORE_NAME}
          </a>
        </p>
      </section>

      {o.amount_to_collect > 0 && (
        <Banner
          tone="amber"
          icon={<Banknote size={22} />}
          title={`Collect ${formatNaira(o.amount_to_collect)} in cash`}
          text="This is a pay-on-delivery order."
        />
      )}

      {/* Where to */}
      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-semibold">{o.customer_name}</p>
        <a href={`tel:${o.customer_phone}`} className="flex items-center gap-2 text-brand">
          <Phone size={15} className="shrink-0" /> {o.customer_phone}
        </a>
        <p className="flex items-start gap-2 text-gray-700">
          <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
          <span>
            {o.delivery_zone && <span className="font-medium">{o.delivery_zone}: </span>}
            {o.delivery_address}
          </span>
        </p>
        {o.delivery_note && <p className="pl-6 text-gray-600">Note: {o.delivery_note}</p>}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 font-medium hover:border-brand"
        >
          <Navigation size={15} /> Open in Maps
        </a>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Package size={15} /> Items
        </p>
        <ul className="space-y-1 text-gray-700">
          {items.map((i, idx) => (
            <li key={idx}>
              {i.name} <span className="text-gray-400">× {i.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Messages from the server */}
      {problemMsg && (
        <Banner
          tone="red"
          icon={<AlertTriangle size={22} />}
          title={problemMsg.title}
          text={
            problemMsg.text +
            (problem === 'OTP_INVALID' && attemptsLeft !== null
              ? ` You have ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left for this code.`
              : '')
          }
        />
      )}
      {notice && !problemMsg && <Banner tone="green" icon={<CheckCircle2 size={22} />} title="QR verified" text={notice} />}

      {/* Actions */}
      <div className="space-y-3 pb-8">
        {!verified && (
          <>
            {a.status === 'assigned' && (
              <button disabled={busy} onClick={pickedUp} className={secondaryBtn}>
                <Package size={18} /> I've picked up the package
              </button>
            )}
            <button disabled={busy} onClick={() => (setProblem(null), setScanning(true))} className={primaryBtn}>
              <QrCode size={18} /> Scan customer's QR code
            </button>
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <Clock size={14} className="mt-0.5 shrink-0" />
              Ask the customer to open this order in their {STORE_NAME} account and tap "Show Delivery QR". Do not hand
              over the order until the scan is accepted.
            </p>

            {!otpOpen ? (
              <button onClick={() => (setProblem(null), setOtpOpen(true))} className="w-full py-1 text-sm font-medium text-brand underline">
                Customer can't show the QR? Text them a 6-digit code
              </button>
            ) : (
              <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold">Verify with a 6-digit code</p>

                {!otpSent ? (
                  <>
                    <p className="text-xs text-gray-500">
                      We'll text a code to the phone number on this order. The customer reads it out to you. You won't see
                      it until they tell you.
                    </p>
                    <button
                      disabled={busy}
                      onClick={sendOtp}
                      className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? 'Sending…' : "Text the customer a code"}
                    </button>
                  </>
                ) : (
                  <>
                    <p role="status" className="text-sm text-green-800">
                      {otpSent.hint
                        ? `Code sent to the customer's phone (${otpSent.hint}).`
                        : 'A code was sent to the customer a moment ago.'}{' '}
                      Ask them to read it to you, then type it here.
                    </p>
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      placeholder="000000"
                      aria-label="6-digit code from the customer"
                      className="w-full rounded-lg border border-gray-300 py-3 text-center text-2xl font-semibold tracking-[0.4em]"
                    />
                    <button
                      disabled={busy || otp.length !== 6}
                      onClick={submitOtp}
                      className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? 'Checking…' : 'Check code'}
                    </button>
                    <button
                      disabled={busy || now < otpSent.resendAtMs}
                      onClick={sendOtp}
                      className="w-full py-1 text-sm font-medium text-brand underline disabled:text-gray-400 disabled:no-underline"
                    >
                      {now < otpSent.resendAtMs
                        ? `Send a new code in ${Math.ceil((otpSent.resendAtMs - now) / 1000)}s`
                        : "Didn't get it? Send a new code"}
                    </button>
                  </>
                )}

                <button
                  disabled={busy}
                  onClick={() => (setOtpOpen(false), setOtp(''), setProblem(null))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium"
                >
                  Back
                </button>
              </section>
            )}
          </>
        )}

        {verified && (
          <>
            <button disabled={busy} onClick={confirm} className={`${primaryBtn} bg-green-600 hover:bg-green-700`}>
              <CheckCircle2 size={18} /> {busy ? 'Confirming…' : 'Confirm delivery'}
            </button>
            <button disabled={busy} onClick={() => (setProblem(null), setScanning(true))} className={secondaryBtn}>
              <QrCode size={18} /> Scan again
            </button>
          </>
        )}

        {!showFail ? (
          <button onClick={() => setShowFail(true)} className="w-full py-2 text-sm font-medium text-red-600 underline">
            I couldn't complete this delivery
          </button>
        ) : (
          <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold">What went wrong?</p>
            <div className="space-y-2">
              {FAIL_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="fail-reason"
                    checked={failReason === r.value}
                    onChange={() => setFailReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Anything else the store should know (optional)"
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            <p className="text-xs text-gray-600">
              This ends your link for this order. {STORE_NAME} will decide what happens next.
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={submitFail}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Report failed delivery
              </button>
              <button
                disabled={busy}
                onClick={() => (setShowFail(false), setProblem(null))}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium"
              >
                Back
              </button>
            </div>
          </section>
        )}
      </div>
    </Shell>
  )
}

// ---------- small pieces ----------
const primaryBtn =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-4 text-base font-semibold text-white hover:bg-brand-light disabled:opacity-60'
const secondaryBtn =
  'flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base font-semibold hover:border-brand disabled:opacity-60'

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-md space-y-4 bg-gray-50 px-4 py-6">{children}</main>
}

const TONES = {
  green: 'border-green-200 bg-green-50 text-green-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  red: 'border-red-200 bg-red-50 text-red-900',
  gray: 'border-gray-200 bg-white text-gray-900',
}

function Banner({
  tone, icon, title, text,
}: {
  tone: keyof typeof TONES
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-4 ${TONES[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{text}</p>
      </div>
    </div>
  )
}

function ContactStore() {
  return (
    <a
      href={whatsappLink('Hi, I have a question about a delivery link.')}
      target="_blank"
      rel="noopener noreferrer"
      className={secondaryBtn}
    >
      <MessageCircle size={18} /> Contact {STORE_NAME}
    </a>
  )
}
