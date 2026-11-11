import { Bell, BellOff } from 'lucide-react'
import { useCustomerPush } from '../hooks/useCustomerPush'
import InstallApp from './InstallApp'

const WHAT = 'when your order is confirmed, out for delivery or delivered'

// "card" lives on the account page and shows every state.
// "compact" is a small nudge on an order page and only appears when notifications are still off.
export default function OrderAlertsCard({ variant = 'card' }: { variant?: 'card' | 'compact' }) {
  const { state, busy, enable, disable, sendTest } = useCustomerPush()

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
            {state === 'on' ? 'On for this device' : (notes[state] ?? `Get a notification ${WHAT}`)}
          </p>
        </div>

        {state === 'off' && (
          <button
            onClick={enable}
            disabled={busy}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
          >
            Turn on
          </button>
        )}
        {state === 'on' && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={sendTest}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:border-brand disabled:opacity-60"
            >
              Test
            </button>
            <button
              onClick={disable}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:border-brand disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
        )}
      </div>
      {state === 'needs-install' && <InstallApp variant="card" className="mt-3" />}
    </div>
  )
}
