import { Bell, BellOff } from 'lucide-react'
import { useCustomerPush } from '../../../looma/src/hooks/useCustomerPush'
import InstallApp from './InstallApp'

const WHAT = 'when your order is confirmed, out for delivery or delivered'

// "card" lives on the account page and shows every state.
// "compact" is a small nudge on an order page and only appears when notifications are still off.
export default function OrderAlertsCard({ variant = 'card' }: { variant?: 'card' | 'compact' }) {
  const { state, busy, enable, disable } = useCustomerPush()

  if (state === 'checking' || state === 'unconfigured') return null

  if (variant === 'compact') {
    if (state !== 'off') return null
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Bell size={16} className="shrink-0 text-brand" />
          <span>Get a notification {WHAT}.</span>
        </div>
        <button
          onClick={enable}
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          Turn on
        </button>
      </div>
    )
  }

  const notes: Partial<Record<typeof state, string>> = {
    unsupported: "This browser can't send notifications. Chrome on Android or a desktop browser will work.",
    blocked: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.',
    'needs-install': 'On iPhone, first add the app to your Home Screen, then open it from there to turn this on.',
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-4">
        {state === 'on' ? (
          <Bell size={20} className="shrink-0 text-green-600" />
        ) : (
          <BellOff size={20} className="shrink-0 text-gray-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Order updates</p>
          <p className="text-xs text-gray-500">
            {state === 'on' ? 'On for this device' : state === 'off' ? 'Off for this device' : (notes[state] ?? `Get a notification ${WHAT}`)}
          </p>
        </div>

        {(state === 'on' || state === 'off') && (
          <button
            type="button"
            role="switch"
            aria-checked={state === 'on'}
            aria-label="Order updates"
            onClick={state === 'on' ? disable : enable}
            disabled={busy}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              state === 'on' ? 'bg-brand' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                state === 'on' ? 'translate-x-5' : ''
              }`}
            />
          </button>
        )}
      </div>
      {state === 'needs-install' && <InstallApp variant="card" className="mt-3" />}
    </div>
  )
}
