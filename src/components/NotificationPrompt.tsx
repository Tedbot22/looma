import { useState } from 'react'
import { Bell } from 'lucide-react'
import { STORE_NAME } from '../config'
import { useAuth } from '../context/AuthContext'
import { useCustomerPush } from '../hooks/useCustomerPush'
import { useIsStandalone } from '../hooks/useInstallApp'

const SEEN_KEY = 'looma_push_prompted'

// The first time a logged-in customer opens the installed app, ask about notifications.
// Tapping "Turn on" does exactly what the account-page toggle does (the browser's own permission
// prompt appears). We ask with our own button first because browsers only allow that prompt
// after a tap, and an unexplained pop-up gets blocked far more often.
export default function NotificationPrompt({ enabled }: { enabled: boolean }) {
  const { user } = useAuth()
  const standalone = useIsStandalone()
  const { state, busy, enable } = useCustomerPush()
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })

  const canAsk = typeof Notification !== 'undefined' && Notification.permission === 'default'
  if (!enabled || !user || !standalone || done || state !== 'off' || !canAsk) return null

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, '1') // ask once only
    } catch {
      /* storage blocked: it may ask again next time */
    }
    setDone(true)
  }

  async function turnOn() {
    await enable()
    finish()
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
            onClick={finish}
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
