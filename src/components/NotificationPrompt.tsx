import { useState } from 'react'
import { Bell } from 'lucide-react'
import { STORE_NAME } from '../config'
import { useAuth } from '../context/AuthContext'
import { useCustomerPush } from '../hooks/useCustomerPush'
import { useIsStandalone } from '../hooks/useInstallApp'
import { isOptedOut } from '../lib/push'

const SNOOZE_KEY = 'looma_push_snooze'
const SNOOZE_DAYS = 3

function snoozedUntil(userId: string): number {
  try {
    const all = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>
    return all[userId] ?? 0
  } catch {
    return 0
  }
}

function snooze(userId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>
    all[userId] = Date.now() + SNOOZE_DAYS * 24 * 3600_000
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(all))
  } catch {
    /* storage blocked: it may ask again on the next visit */
  }
}

// Asks a logged-in customer to turn on order notifications.
//
// It only shows inside the installed app (PWA), never in a normal browser tab.
// It shows whenever notifications are off for this device AND we are still allowed to ask:
//   - the browser permission is still undecided ("default"), or
//   - permission was already granted but this device isn't attached to the account any more
//     (e.g. after logging out and back in), in which case no browser pop-up is needed at all.
// "Not now" only snoozes it for a few days. It never asks again if the customer switched
// notifications off on purpose, and the browser can't be asked again once it is set to "Block".
// Tapping "Turn on" is what lets the browser show its own permission pop-up (browsers need a tap).
export default function NotificationPrompt({ enabled }: { enabled: boolean }) {
  const { user } = useAuth()
  const standalone = useIsStandalone()
  const { state, busy, enable } = useCustomerPush()
  const [, setTick] = useState(0) // re-render after snoozing

  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  const canAsk = permission === 'default' || permission === 'granted'
  if (!enabled || !user || !standalone || state !== 'off' || !canAsk) return null
  if (isOptedOut(user.id) || snoozedUntil(user.id) > Date.now()) return null

  const userId = user.id

  function notNow() {
    snooze(userId)
    setTick((n) => n + 1)
  }

  async function turnOn() {
    // On success the state becomes "on" and this prompt disappears by itself.
    // If the person closes the browser pop-up without choosing, the prompt simply stays so they can try again.
    await enable()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div role="dialog" aria-label="Order notifications" className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Bell size={20} />
          </span>
          <div>
            <h2 className="font-bold">Stay updated on your orders</h2>
            <p className="mt-1 text-sm text-gray-600">
              Get a notification from {STORE_NAME} when your order is confirmed, out for delivery or delivered.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={turnOn}
            disabled={busy}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
          >
            Turn on notifications
          </button>
          <button
            onClick={notNow}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-brand"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
