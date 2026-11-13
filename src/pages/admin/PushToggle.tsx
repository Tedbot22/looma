import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  VAPID_PUBLIC_KEY,
  getOrCreateSubscription,
  isPushSupported,
  readyRegistration,
  subscriptionMatchesKey,
} from '../../lib/push'

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

      const registration = await readyRegistration()
      if (!registration) return setState('unsupported')
      const subscription = await registration.pushManager.getSubscription()
      // A subscription made with an old key looks "on" but every push to it is rejected: show it as off.
      setState(subscription && subscriptionMatchesKey(subscription) ? 'on' : 'off')
    }
    check().catch(() => setState('unsupported'))
  }, [])

  // Saves this device under the owner's account so order alerts know where to go.
  async function saveDevice(fresh = false): Promise<void> {
    if (!user) throw new Error('You are not logged in.')
    const registration = await readyRegistration()
    if (!registration) throw new Error('The app is still loading. Try again in a moment.')
    const subscription = await getOrCreateSubscription(registration, fresh)
    const { error } = await supabase
      .from('device_tokens')
      .upsert({ user_id: user.id, token: JSON.stringify(subscription), platform: 'web' }, { onConflict: 'token' })
    if (error) throw error
  }

  async function enable() {
    if (!user || !VAPID_PUBLIC_KEY) return
    setBusy(true)
    try {
      // Ask the owner's permission (the browser shows its own prompt), then subscribe and save this device.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      await saveDevice()
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
      const registration = await readyRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription && user) {
        // Remove this device's rows by its address (more reliable than matching the whole saved text).
        const { data: rows } = await supabase.from('device_tokens').select('id, token').eq('user_id', user.id)
        const mine = (rows ?? []).filter((r) => {
          try {
            return JSON.parse(r.token).endpoint === subscription.endpoint
          } catch {
            return false
          }
        })
        if (mine.length > 0) await supabase.from('device_tokens').delete().in('id', mine.map((r) => r.id))

        // The same browser subscription also carries this person's customer order updates: keep it if so.
        const { data: asCustomer } = await supabase
          .from('customer_push_subscriptions')
          .select('id')
          .eq('endpoint', subscription.endpoint)
          .maybeSingle()
        if (!asCustomer) await subscription.unsubscribe()
      }
      setState('off')
      toast.success('Order alerts are off for this device')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function invokeTest() {
    const { data, error } = await supabase.functions.invoke('notify-order', { body: { test: true } })
    if (error) {
      // supabase-js only says "non-2xx status code". The useful part is in the response body.
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.text().catch(() => '')
        throw new Error(`${error.context.status}: ${body || 'no details'}`)
      }
      throw error
    }
    return data as { sent?: number; registered?: number; errors?: string[] } | null
  }

  async function sendTest() {
    setBusy(true)
    try {
      // Always re-save this device first. "On" is read from the browser, so without this the server can
      // have no record of the device (e.g. it was created while logged in as a customer) and send nothing.
      await saveDevice()
      let data = await invokeTest()

      // The push service refused it: usually a subscription made with an older key. Start fresh once and retry.
      if (!data?.sent && data?.errors?.length) {
        await saveDevice(true)
        data = await invokeTest()
      }

      if (data?.registered === 0) {
        toast.error('The server has no device saved for your account. Turn alerts off and on again.')
      } else if (data?.errors?.length) {
        const keyProblem = data.errors.some((e) => /^(401|403)|VapidPkHashMismatch|vapid/i.test(e))
        toast.error(
          keyProblem
            ? `The push service rejected the keys: ${data.errors.join(' | ')}. VITE_VAPID_PUBLIC_KEY (Vercel) must equal VAPID_PUBLIC_KEY (Supabase secrets), then redeploy and turn alerts off and on again.`
            : `The push service rejected it: ${data.errors.join(' | ')}`
        )
      } else {
        toast.success(
          `Accepted by the push service for ${data?.sent ?? 0} device(s). If nothing appears, check your computer's or phone's notification settings for this browser.`
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
