import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarClock, Megaphone, Moon, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { STORE_NAME } from '../../config'
import { useDialog } from '../../context/DialogContext'

interface PushSettings {
  cart_enabled: boolean
  cart_first_hours: number
  cart_second_hours: number
  confirm_enabled: boolean
  confirm_after_min: number
  inactive_enabled: boolean
  inactive_after_days: number
  promo_weekly_cap: number
  quiet_start_hour: number
  quiet_end_hour: number
}

interface Promo {
  id: string
  title: string
  body: string
  url: string
  scheduled_for: string
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled'
  recipients: number | null
  skipped_cap: number | null
}

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'
const cardClass = 'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5'

const LINKS = [
  { value: '/', label: 'Home page' },
  { value: '/shop', label: 'Shop (everything)' },
  { value: '/todays-deals', label: "Today's deals" },
]

const STATUS_STYLE: Record<Promo['status'], string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<Promo['status'], string> = {
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  cancelled: 'Cancelled',
}

const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`

function lagosHourOf(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(date)) % 24
}

// A small on/off switch, styled like the one on the customer's account page.
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}

// One automatic reminder: a switch, a description and (optionally) its timing.
function RuleRow({
  title,
  description,
  on,
  onToggle,
  children,
}: {
  title: string
  description: string
  on: boolean
  onToggle?: (v: boolean) => void // left out for a setting that can't be switched off
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-gray-100 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        {onToggle && <Switch on={on} onChange={onToggle} label={title} />}
      </div>
      {on && children && <div className="mt-3">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Automatic reminders
// ---------------------------------------------------------------------------
function RulesPanel() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Partial<PushSettings>>({})

  const { data: saved, isLoading } = useQuery({
    queryKey: ['push-settings'],
    queryFn: async (): Promise<PushSettings> => {
      const { data, error } = await supabase.from('push_settings').select('*').eq('id', 1).single()
      if (error) throw error
      return data as PushSettings
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('push_settings')
        .update({ ...draft, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => {
      setDraft({})
      queryClient.invalidateQueries({ queryKey: ['push-settings'] })
      toast.success('Notification settings saved')
    },
    onError: (err) => toast.error((err as Error).message),
  })

  if (isLoading || !saved) return <div className={`${cardClass} h-48 animate-pulse`} />

  const s: PushSettings = { ...saved, ...draft }
  const set = <K extends keyof PushSettings>(key: K, value: PushSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const changed = Object.keys(draft).length > 0

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Bell size={18} className="text-brand" />
        <h2 className="text-base font-bold">Automatic reminders</h2>
      </div>

      <RuleRow
        title="Abandoned cart"
        description="Reminds a customer about items left in their cart, then once more a day later. It stops as soon as they order or change their cart."
        on={s.cart_enabled}
        onToggle={(v) => set('cart_enabled', v)}
      >
        <label className={labelClass} htmlFor="cart-hours">
          First reminder after
        </label>
        <select
          id="cart-hours"
          className={`${inputClass} sm:w-56`}
          value={s.cart_first_hours}
          onChange={(e) => set('cart_first_hours', Number(e.target.value))}
        >
          {[2, 3, 4, 5, 6].map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-gray-400">The second reminder goes out {s.cart_second_hours} hours after the first.</p>
      </RuleRow>

      <RuleRow
        title="Order waiting for you"
        description="Alerts you (push and email) when an order has been placed but not confirmed, so no customer is left waiting."
        on={s.confirm_enabled}
        onToggle={(v) => set('confirm_enabled', v)}
      >
        <label className={labelClass} htmlFor="confirm-min">
          Alert me after
        </label>
        <select
          id="confirm-min"
          className={`${inputClass} sm:w-56`}
          value={s.confirm_after_min}
          onChange={(e) => set('confirm_after_min', Number(e.target.value))}
        >
          {[15, 20, 25, 30].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </RuleRow>

      <RuleRow
        title="Inactive customers"
        description="One friendly message to a customer who hasn't visited or ordered for a while. They get it once per absence."
        on={s.inactive_enabled}
        onToggle={(v) => set('inactive_enabled', v)}
      >
        <label className={labelClass} htmlFor="inactive-days">
          Send after
        </label>
        <select
          id="inactive-days"
          className={`${inputClass} sm:w-56`}
          value={s.inactive_after_days}
          onChange={(e) => set('inactive_after_days', Number(e.target.value))}
        >
          {[7, 8, 9, 10, 11, 12, 13, 14].map((d) => (
            <option key={d} value={d}>
              {d} days away
            </option>
          ))}
        </select>
      </RuleRow>

      <RuleRow
        title="Promotion limit"
        description="The most promotions any one customer can receive in 7 days, however many you schedule."
        on
      >
        <select
          aria-label="Promotions per week"
          className={`${inputClass} sm:w-56`}
          value={s.promo_weekly_cap}
          onChange={(e) => set('promo_weekly_cap', Number(e.target.value))}
        >
          <option value={1}>1 per week</option>
          <option value={2}>2 per week</option>
        </select>
      </RuleRow>

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <Moon size={14} className="mt-0.5 shrink-0" />
        <span>
          Cart and inactive-customer messages are held until morning: none go out between {hourLabel(s.quiet_start_hour)} and{' '}
          {hourLabel(s.quiet_end_hour)} (Lagos time). Customers can also switch off offers and reminders on their account page.
        </span>
      </p>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!changed || save.isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Promotions: write, preview, schedule or send now
// ---------------------------------------------------------------------------
function PromoPanel() {
  const queryClient = useQueryClient()
  const dialog = useDialog()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [when_, setWhen] = useState('') // value of the datetime-local box
  const [busy, setBusy] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['push-settings'],
    queryFn: async (): Promise<PushSettings> => {
      const { data, error } = await supabase.from('push_settings').select('*').eq('id', 1).single()
      if (error) throw error
      return data as PushSettings
    },
  })

  const { data: promos } = useQuery({
    queryKey: ['admin-promos'],
    queryFn: async (): Promise<Promo[]> => {
      const { data, error } = await supabase
        .from('promo_messages')
        .select('id, title, body, url, scheduled_for, status, recipients, skipped_cap')
        .order('scheduled_for', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as Promo[]
    },
    refetchInterval: 30_000,
  })

  const scheduledDate = when_ ? new Date(when_) : null
  const inQuietHours =
    !!scheduledDate &&
    !!settings &&
    (settings.quiet_start_hour > settings.quiet_end_hour
      ? lagosHourOf(scheduledDate) >= settings.quiet_start_hour || lagosHourOf(scheduledDate) < settings.quiet_end_hour
      : lagosHourOf(scheduledDate) >= settings.quiet_start_hour && lagosHourOf(scheduledDate) < settings.quiet_end_hour)

  const valid = title.trim().length > 0 && body.trim().length > 0

  async function create(scheduledFor: Date): Promise<string | null> {
    const { data: auth } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('promo_messages')
      .insert({
        title: title.trim(),
        body: body.trim(),
        url,
        scheduled_for: scheduledFor.toISOString(),
        created_by: auth.user?.id ?? null,
      })
      .select('id')
      .single()
    if (error) {
      toast.error(error.message)
      return null
    }
    return data.id as string
  }

  function reset() {
    setTitle('')
    setBody('')
    setUrl('/')
    setWhen('')
    queryClient.invalidateQueries({ queryKey: ['admin-promos'] })
  }

  async function schedule() {
    if (!valid) return
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() + 60_000) {
      return toast.error('Pick a date and time in the future.')
    }
    setBusy(true)
    const id = await create(scheduledDate)
    setBusy(false)
    if (!id) return
    toast.success(`Scheduled for ${when(scheduledDate.toISOString())}`)
    reset()
  }

  async function sendNow() {
    if (!valid) return
    const ok = await dialog.confirm({
      title: 'Send this to your customers now?',
      message: `It goes to every customer who has notifications on (up to ${settings?.promo_weekly_cap ?? 2} promotions per customer per week). It can't be unsent.`,
      confirmLabel: 'Send now',
    })
    if (!ok) return

    setBusy(true)
    const id = await create(new Date())
    if (!id) return setBusy(false)

    // Ask the scheduler to run right away instead of waiting for its next 5-minute turn.
    const { data, error } = await supabase.functions.invoke('push-scheduler', { body: { task: 'promos' } })
    setBusy(false)
    if (error) {
      toast.info("Saved. It will go out within 5 minutes.")
    } else {
      const mine = (data?.promos as { id: string; delivered: number }[] | undefined)?.find((p) => p.id === id)
      toast.success(mine ? `Sent to ${mine.delivered} ${mine.delivered === 1 ? 'customer' : 'customers'}` : 'Sending now')
    }
    reset()
  }

  async function cancel(promo: Promo) {
    const ok = await dialog.confirm({
      title: 'Cancel this promotion?',
      message: `"${promo.title}" won't be sent.`,
      confirmLabel: 'Cancel promotion',
      cancelLabel: 'Keep it',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('promo_messages').update({ status: 'cancelled' }).eq('id', promo.id).eq('status', 'scheduled')
    if (error) return toast.error(error.message)
    queryClient.invalidateQueries({ queryKey: ['admin-promos'] })
    toast.success('Promotion cancelled')
  }

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Megaphone size={18} className="text-brand" />
        <h2 className="text-base font-bold">Promotions</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="promo-title">
              Title <span className="text-gray-400">({title.length}/60)</span>
            </label>
            <input
              id="promo-title"
              className={inputClass}
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fresh drop just landed"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="promo-body">
              Message <span className="text-gray-400">({body.length}/160)</span>
            </label>
            <textarea
              id="promo-body"
              className={inputClass}
              rows={3}
              maxLength={160}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="New thrift pieces are in. Come and pick yours before they go."
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="promo-link">
              Opens
            </label>
            <select id="promo-link" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)}>
              {LINKS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="promo-when">
              Send on (to schedule it)
            </label>
            <input id="promo-when" type="datetime-local" className={inputClass} value={when_} onChange={(e) => setWhen(e.target.value)} />
            {inQuietHours && settings && (
              <p className="mt-1 text-xs text-amber-600">
                That's during quiet hours ({hourLabel(settings.quiet_start_hour)} to {hourLabel(settings.quiet_end_hour)}). Promotions still go out at the
                time you choose.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className={labelClass}>Preview</p>
          <div className="rounded-2xl bg-gray-100 p-3">
            <div className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
              <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{STORE_NAME} · now</p>
                <p className="truncate text-sm font-semibold">{title || 'Your title'}</p>
                <p className="text-sm text-gray-600">{body || 'Your message will show here.'}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={schedule}
              disabled={!valid || !when_ || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-50"
            >
              <CalendarClock size={16} /> Schedule
            </button>
            <button
              type="button"
              onClick={sendNow}
              disabled={!valid || busy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Send size={16} /> Send now
            </button>
          </div>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold">Recent promotions</h3>
      {!promos || promos.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing yet. Your first promotion will show up here.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {promos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="text-xs text-gray-500">
                  {p.status === 'sent' ? 'Sent' : 'For'} {when(p.scheduled_for)}
                  {p.status === 'sent' && p.recipients != null && ` · reached ${p.recipients} ${p.recipients === 1 ? 'customer' : 'customers'}`}
                  {p.status === 'sent' && !!p.skipped_cap && ` · ${p.skipped_cap} held back by the weekly limit`}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              {p.status === 'scheduled' && (
                <button type="button" onClick={() => cancel(p)} className="text-xs font-medium text-red-600 hover:underline">
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// What went out in the last 7 days
// ---------------------------------------------------------------------------
function ActivityPanel() {
  const { data } = useQuery({
    queryKey: ['push-activity'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const { data, error } = await supabase.from('push_log').select('kind').gte('sent_at', since).limit(10000)
      if (error) throw error
      const count = (kinds: string[]) => (data ?? []).filter((r) => kinds.includes(r.kind)).length
      return { cart: count(['cart_1', 'cart_2']), promo: count(['promo']), inactive: count(['inactive']) }
    },
  })

  const tiles = [
    { label: 'Cart reminders', value: data?.cart },
    { label: 'Promotions', value: data?.promo },
    { label: 'Win-back messages', value: data?.inactive },
  ]

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-500">Sent in the last 7 days</h2>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-2xl font-bold">{t.value ?? '–'}</p>
            <p className="text-xs text-gray-500">{t.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AdminNotifications() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Notifications</h1>
        <p className="text-sm text-gray-500">Reminders that run on their own, and promotions you write and schedule.</p>
      </div>
      <ActivityPanel />
      <RulesPanel />
      <PromoPanel />
    </div>
  )
}
