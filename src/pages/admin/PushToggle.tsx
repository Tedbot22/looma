import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { VAPID_PUBLIC_KEY, isPushSupported, urlBase64ToUint8Array } from '../../lib/push'

type State = 'checking' | 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on'

export default function PushToggle() {
  const { user } = useAuth()
  const [state, setState] = useState<State>('checking')
  const [busy, setBusy] = useState(false)

  // Work out the current situation on this device.
  useEffect(() => {
    async function check() {
      if (!isPushSupported()) return setState('unsupported')
      if (!VAPID_PUBLIC_KEY) return setState('unconfigured')
      if (Notification.permission === 'denied') return setState('blocked')

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      setState(subscription ? 'on' : 'off')
    }
    check().catch(() => setState('unsupported'))
  }, [])

  async function enable() {
    if (!user || !VAPID_PUBLIC_KEY) return
    setBusy(true)
    try {
      // 1. Ask the owner's permission (the browser shows its own prompt).
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }

      // 2. Subscribe this device. The browser's push service gives us a private "address" for it.
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // 3. Save that address so the server knows where to send order alerts.
      const { error } = await supabase
        .from('device_tokens')
        .upsert({ user_id: user.id, token: JSON.stringify(subscription), platform: 'web' }, { onConflict: 'token' })
      if (error) throw error

      setState('on')
      toast.success('Order alerts are on for this device')
    } catch (err) {
      toast.error(`Couldn't turn on alerts: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await supabase.from('device_tokens').delete().eq('token', JSON.stringify(subscription))
        await subscription.unsubscribe()
      }
      setState('off')
      toast.success('Order alerts are off for this device')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('notify-order', { body: { test: true } })
      if (error) {
        // supabase-js only says "non-2xx status code". The useful part is in the response body.
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.text().catch(() => '')
          throw new Error(`${error.context.status}: ${body || 'no details'}`)
        }
        throw error
      }
      if (data?.registered === 0) {
        toast.error('No device is registered for your account. Turn alerts off and on again.')
      } else if (data?.errors?.length) {
        toast.error(`The push service rejected it: ${data.errors.join(' | ')}`)
      } else {
        toast.success(
          `Accepted by the push service for ${data?.sent ?? 0} device(s). If nothing appears, check your Mac's notification settings.`
        )
      }
    } catch (err) {
      toast.error(`Test failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') return null

  const message: Record<Exclude<State, 'checking' | 'off' | 'on'>, string> = {
    unsupported:
      "This browser can't receive notifications. On iPhone, add the app to the home screen first. On Android, use Chrome.",
    unconfigured: 'Notifications are not set up yet (missing VITE_VAPID_PUBLIC_KEY).',
    blocked: 'Notifications are blocked for this site. Allow them in the browser or phone settings, then reload.',
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        {state === 'on' ? (
          <Bell size={16} className="text-green-600" />
        ) : (
          <BellOff size={16} className="text-gray-400" />
        )}
        <span className="font-medium">Order alerts</span>
        <span className="text-gray-500">
          {state === 'on' ? 'On for this device' : state === 'off' ? 'Off for this device' : message[state]}
        </span>
      </div>

      {(state === 'on' || state === 'off') && (
        <div className="flex gap-2">
          {state === 'on' && (
            <button
              onClick={sendTest}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:border-brand disabled:opacity-60"
            >
              Send test
            </button>
          )}
          <button
            onClick={state === 'on' ? disable : enable}
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
              state === 'on' ? 'border border-gray-200 hover:border-brand' : 'bg-brand text-white hover:bg-brand-light'
            }`}
          >
            {state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}
    </div>
  )
}
