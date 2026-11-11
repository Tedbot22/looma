import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDialog } from '../../context/DialogContext'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { useAppSettings } from '../../hooks/useAppSettings'
import { couponStatus, describeCoupon, type Coupon, type CouponKind } from '../../lib/coupons'

interface Template {
  id: string
  name: string
  kind: CouponKind
  value: number
  max_discount: number
  min_order: number
  weight: number
  is_active: boolean
}

type IssuedCoupon = Coupon & {
  user_id: string
  profiles: { full_name: string | null; phone: string | null } | null
}

interface ReferredPerson {
  id: string
  full_name: string | null
  phone: string | null
  orders: { order_number: number; subtotal: number; status: string; delivery_address: string }[]
}

const KIND_LABEL: Record<CouponKind, string> = {
  free_delivery: 'Free delivery',
  fixed_off: 'Fixed amount off the order',
  percent_checkout: 'Percentage off the order',
  percent_item: 'Percentage off one item',
}

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-medium text-gray-500'

// ---------------------------------------------------------------------------
// Spending cap and validity
// ---------------------------------------------------------------------------
function SettingsPanel() {
  const { data: settings } = useAppSettings()
  const queryClient = useQueryClient()
  const [budgetInput, setBudgetInput] = useState<string | null>(null)
  const [daysInput, setDaysInput] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const budget = budgetInput ?? settings?.coupon_max_cost ?? ''
  const days = daysInput ?? settings?.coupon_valid_days ?? ''
  const changed = budgetInput !== null || daysInput !== null

  async function save() {
    const b = Number(budget)
    const d = Number(days)
    if (!budget || Number.isNaN(b) || b <= 0) return toast.error('Enter a valid maximum cost.')
    if (!days || !Number.isInteger(d) || d < 1) return toast.error('Enter a whole number of days (1 or more).')

    setSaving(true)
    const results = await Promise.all([
      supabase.from('app_settings').update({ value: String(b) }).eq('key', 'coupon_max_cost'),
      supabase.from('app_settings').update({ value: String(d) }).eq('key', 'coupon_valid_days'),
    ])
    setSaving(false)

    const failed = results.find((r) => r.error)
    if (failed?.error) return toast.error(failed.error.message)

    toast.success('Settings saved')
    setBudgetInput(null)
    setDaysInput(null)
    queryClient.invalidateQueries({ queryKey: ['app-settings'] })
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Most any one voucher may cost you (₦)</label>
          <input className={inputClass} inputMode="decimal" value={budget} onChange={(e) => setBudgetInput(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Valid for (days)</label>
          <input className={inputClass} inputMode="numeric" value={days} onChange={(e) => setDaysInput(e.target.value)} />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        A reward whose maximum cost is above this limit is <strong>never given out</strong>, however it is set up
        below. Changing a limit or a reward only affects vouchers issued afterwards.
      </p>
      <button
        onClick={save}
        disabled={saving || !changed}
        className="mt-3 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-40"
      >
        Save
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Add / edit one reward in the pool
// ---------------------------------------------------------------------------
function TemplateForm({ initial, onDone }: { initial?: Template; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<CouponKind>(initial?.kind ?? 'free_delivery')
  const [value, setValue] = useState(initial ? String(initial.value) : '')
  const [maxDiscount, setMaxDiscount] = useState(initial ? String(initial.max_discount) : '')
  const [minOrder, setMinOrder] = useState(initial ? String(initial.min_order) : '0')
  const [weight, setWeight] = useState(initial ? String(initial.weight) : '10')
  const [saving, setSaving] = useState(false)

  const isPercent = kind === 'percent_checkout' || kind === 'percent_item'

  async function save() {
    const v = kind === 'free_delivery' ? 0 : Number(value)
    const max = Number(maxDiscount)
    const min = Number(minOrder)
    const w = Number(weight)

    if (!name.trim()) return toast.error('Give the reward a name customers will see.')
    if (kind !== 'free_delivery' && (!value || Number.isNaN(v) || v <= 0)) return toast.error('Enter a value above 0.')
    if (isPercent && v > 100) return toast.error('A percentage can be at most 100.')
    if (!maxDiscount || Number.isNaN(max) || max <= 0) return toast.error('Set the most this reward can ever cost you.')
    if (Number.isNaN(min) || min < 0) return toast.error('The minimum order must be 0 or more.')
    if (!Number.isInteger(w) || w < 0) return toast.error('Chance weight must be a whole number, 0 or more.')

    setSaving(true)
    const row = { name: name.trim(), kind, value: v, max_discount: max, min_order: min, weight: w }
    const { error } = initial
      ? await supabase.from('coupon_templates').update(row).eq('id', initial.id)
      : await supabase.from('coupon_templates').insert(row)
    setSaving(false)

    if (error) return toast.error(error.message)
    toast.success(initial ? 'Reward updated' : 'Reward added')
    queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
    onDone()
  }

  return (
    <div className="space-y-3 rounded-xl border border-brand bg-gray-50 p-4">
      <div>
        <label className={labelClass}>Name customers will see</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 10% off your order" />
      </div>

      <div>
        <label className={labelClass}>Type</label>
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as CouponKind)}>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {kind !== 'free_delivery' && (
          <div>
            <label className={labelClass}>{isPercent ? 'Percent off (%)' : 'Amount off (₦)'}</label>
            <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
        <div>
          <label className={labelClass}>Most it can ever cost you (₦)</label>
          <input className={inputClass} inputMode="decimal" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Minimum order (₦)</label>
          <input className={inputClass} inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Chance weight</label>
          <input className={inputClass} inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {kind === 'free_delivery' && 'Set the maximum to at least your highest delivery fee, so it always covers it.'}
        {kind === 'fixed_off' && 'The most it can cost you is normally the same as the amount off.'}
        {kind === 'percent_checkout' && 'Takes the percentage off the items total. The maximum caps the naira amount.'}
        {kind === 'percent_item' && 'Takes the percentage off the single priciest item in the order. The maximum caps the naira amount.'}
        {' '}A bigger weight makes a reward more likely to be drawn.
      </p>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add reward'}
        </button>
        <button onClick={onDone} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:border-brand">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The reward pool
// ---------------------------------------------------------------------------
function PoolTab() {
  const dialog = useDialog()
  const { data: settings } = useAppSettings()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const budget = Number(settings?.coupon_max_cost ?? 0)

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase.from('coupon_templates').select('*').order('created_at')
      if (error) throw error
      return data as Template[]
    },
  })

  // A reward can only be drawn if it is switched on, has weight, and fits the budget.
  const drawable = (t: Template) => t.is_active && t.weight > 0 && t.max_discount <= budget
  const totalWeight = (templates ?? []).filter(drawable).reduce((sum, t) => sum + t.weight, 0)

  const toggle = useMutation({
    mutationFn: async (t: Template) => {
      const { error } = await supabase.from('coupon_templates').update({ is_active: !t.is_active }).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-templates'] }),
    onError: (err) => toast.error((err as Error).message),
  })

  async function remove(t: Template) {
    const ok = await dialog.confirm({
      title: `Delete "${t.name}"?`,
      message: 'Vouchers already given out keep working.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('coupon_templates').delete().eq('id', t.id)
    if (error) return toast.error(error.message)
    toast.success('Reward deleted')
    queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
  }

  return (
    <div>
      {totalWeight === 0 && !isLoading && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          No reward in the pool can currently be given out, so customers who earn one will get nothing yet. Add a reward
          that is switched on and costs no more than {formatNaira(budget)}.
        </p>
      )}

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-600">Couldn't load the pool: {(error as Error).message}</p>}

      <ul className="space-y-3">
        {templates?.map((t) => {
          if (editing === t.id) {
            return (
              <li key={t.id}>
                <TemplateForm initial={t} onDone={() => setEditing(null)} />
              </li>
            )
          }

          const overBudget = t.max_discount > budget
          const chance = drawable(t) && totalWeight > 0 ? Math.round((t.weight / totalWeight) * 100) : 0

          return (
            <li key={t.id} className={`rounded-xl border p-4 ${t.is_active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-gray-500">{describeCoupon(t)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Costs you at most <strong>{formatNaira(t.max_discount)}</strong>
                    {t.min_order > 0 ? ` · needs an order of ${formatNaira(t.min_order)}+` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold">{chance}%</p>
                  <p className="text-xs text-gray-400">chance</p>
                </div>
              </div>

              {overBudget && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <AlertTriangle size={13} /> Above your {formatNaira(budget)} limit, so it will never be given out
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={t.is_active} onChange={() => toggle.mutate(t)} />
                  In the pool
                </label>
                <div className="flex gap-1">
                  <button aria-label="Edit reward" onClick={() => setEditing(t.id)} className="rounded p-1.5 text-gray-400 hover:text-brand">
                    <Pencil size={16} />
                  </button>
                  <button aria-label="Delete reward" onClick={() => remove(t)} className="rounded p-1.5 text-gray-400 hover:text-sale">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4">
        {editing === 'new' ? (
          <TemplateForm onDone={() => setEditing(null)} />
        ) : (
          <button
            onClick={() => setEditing('new')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-brand hover:text-brand"
          >
            <Plus size={16} /> Add a reward
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vouchers customers hold or have used
// ---------------------------------------------------------------------------
function ReferralList({ userId }: { userId: string }) {
  const { data: settings } = useAppSettings()
  const minOrder = Number(settings?.referral_min_order ?? 3000)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-referrals', userId],
    queryFn: async (): Promise<ReferredPerson[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, orders(order_number, subtotal, status, delivery_address)')
        .eq('referred_by', userId)
      if (error) throw error
      return data as unknown as ReferredPerson[]
    },
  })

  if (isLoading) return <p className="mt-3 text-sm text-gray-400">Loading referrals…</p>
  if (error) return <p className="mt-3 text-sm text-red-600">Couldn't load referrals.</p>
  if (!data || data.length === 0) return <p className="mt-3 text-sm text-gray-400">No referred friends.</p>

  return (
    <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">
      {data.map((p) => {
        const qualifying = p.orders.find((o) => o.status === 'delivered' && o.subtotal >= minOrder)
        return (
          <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{p.full_name || 'Customer'}</p>
              <p className="text-xs text-gray-500">{p.phone}</p>
              {qualifying && <p className="truncate text-xs text-gray-400">{qualifying.delivery_address}</p>}
            </div>
            {qualifying ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-green-700">
                <CheckCircle2 size={14} /> #{qualifying.order_number} · {formatNaira(qualifying.subtotal)}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-gray-400">Not yet</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-700',
} as const

function IssuedTab() {
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: coupons, isLoading, error } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: async (): Promise<IssuedCoupon[]> => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*, profiles(full_name, phone)')
        .order('issued_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as IssuedCoupon[]
    },
  })

  // The real cost so far: what vouchers have actually taken off orders.
  const { data: stats } = useQuery({
    queryKey: ['admin-coupon-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('coupons').select('used_at, discount_applied').limit(5000)
      if (error) throw error
      const rows = data as { used_at: string | null; discount_applied: number | null }[]
      return {
        issued: rows.length,
        used: rows.filter((r) => r.used_at).length,
        cost: rows.reduce((sum, r) => sum + (r.used_at ? Number(r.discount_applied ?? 0) : 0), 0),
      }
    },
  })

  return (
    <div>
      {stats && (
        <div className="mb-5 grid grid-cols-3 gap-3 text-center">
          {[
            ['Given out', String(stats.issued)],
            ['Used', String(stats.used)],
            ['Cost to you so far', formatNaira(stats.cost)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-600">Couldn't load vouchers: {(error as Error).message}</p>}
      {coupons && coupons.length === 0 && (
        <p className="py-16 text-center text-gray-400">No vouchers have been given out yet.</p>
      )}

      <ul className="space-y-3">
        {coupons?.map((c) => {
          const status = couponStatus(c)
          const open = openId === c.id

          return (
            <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{describeCoupon(c)}</p>
                  <p className="font-mono text-xs text-gray-400">{c.code}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {c.profiles?.full_name || 'Customer'}
                    {c.profiles?.phone ? ` · ${c.profiles.phone}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    Issued {new Date(c.issued_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })} · expires{' '}
                    {new Date(c.expires_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
                    {status === 'active' ? 'Available' : status === 'used' ? 'Used' : 'Expired'}
                  </span>
                  {status === 'used' && (
                    <p className="mt-1 text-xs font-medium text-gray-700">Cost {formatNaira(c.discount_applied ?? 0)}</p>
                  )}
                </div>
              </div>

              {c.source === 'referral' && (
                <>
                  <button
                    onClick={() => setOpenId(open ? null : c.id)}
                    className="mt-3 flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                  >
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {open ? 'Hide' : 'Check'} their referrals
                  </button>
                  {open && <ReferralList userId={c.user_id} />}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function AdminCoupons() {
  const [tab, setTab] = useState<'pool' | 'issued'>('pool')

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-bold">Vouchers</h1>
      <p className="mb-5 mt-1 text-sm text-gray-500">
        When a customer's invited friends reach the target, they win a random reward from your pool. Only rewards
        within your spending limit can be drawn.
      </p>

      <SettingsPanel />

      <div className="mb-5 flex gap-2">
        {(
          [
            ['pool', 'Reward pool'],
            ['issued', 'Given out'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === key ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-brand'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pool' ? <PoolTab /> : <IssuedTab />}
    </div>
  )
}
