import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardList, Star, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatNaira } from '../../lib/format'
import { percentChange, useAdminDashboard, type DashboardData } from '../../lib/adminMetrics'
import { BarChart, Donut, HBars } from '../../components/admin/charts'
import { Skeleton } from '../../components/Skeleton'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

type Metric = 'revenue' | 'orders' | 'users'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'revenue', label: 'Sales' },
  { key: 'orders', label: 'Orders' },
  { key: 'users', label: 'New customers' },
]

const STATUS_META: Record<string, { label: string; color: string }> = {
  placed: { label: 'New', color: '#3b82f6' },
  confirmed: { label: 'Confirmed', color: '#f59e0b' },
  out_for_delivery: { label: 'On the way', color: '#a855f7' },
  delivered: { label: 'Delivered', color: '#16a34a' },
  pending_payment: { label: 'Awaiting payment', color: '#9ca3af' },
  cancelled: { label: 'Cancelled', color: '#dc2626' },
}

function Delta({ now, before }: { now: number; before: number }) {
  const change = percentChange(now, before)
  if (change === null) return <span className="text-xs text-gray-400">New this period</span>
  if (change === 0) return <span className="text-xs text-gray-400">No change</span>
  const up = change > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-700' : 'text-red-600'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(change)}% <span className="font-normal text-gray-400">vs previous</span>
    </span>
  )
}

function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 sm:p-5 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-semibold text-gray-700">{title}</h2>}
      {children}
    </section>
  )
}

function Kpi({ icon, label, value, footer }: { icon: ReactNode; label: string; value: string; footer: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="rounded-lg bg-brand/10 p-1.5 text-brand">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <div className="mt-1 min-h-4">{footer}</div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  )
}

function dayLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

// Admin, then Overview: how the store is doing at a glance. The numbers come from the database in one call.
export default function AdminDashboard() {
  const [days, setDays] = useState<number>(30)
  const [metric, setMetric] = useState<Metric>('revenue')
  const { data, isLoading, error } = useAdminDashboard(days)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Overview</h1>
          <p className="text-sm text-gray-500">Sales, orders and customers at a glance.</p>
        </div>
        <div className="flex rounded-full border border-gray-200 bg-white p-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-full px-3.5 py-1 text-sm font-medium ${days === r.days ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <DashboardSkeleton />}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn't load the numbers. Has phase9_admin_metrics_and_review_media.sql been run in Supabase?
        </p>
      )}
      {data && <DashboardBody data={data} metric={metric} setMetric={setMetric} />}
    </div>
  )
}

function DashboardBody({ data, metric, setMetric }: { data: DashboardData; metric: Metric; setMetric: (m: Metric) => void }) {
  const money = (n: number) => formatNaira(Math.round(n))
  // Short amounts on the chart axis: 1,500,000 -> 1.5M
  const short = (n: number) => (n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₦${+(n / 1000).toFixed(1)}k` : `₦${Math.round(n)}`)

  const series = data.daily.map((d) => ({ label: dayLabel(d.day), value: Number(d[metric]) }))
  const format = metric === 'revenue' ? (n: number) => (n >= 1000 ? short(n) : money(n)) : (n: number) => String(Math.round(n))

  const statusSlices = Object.entries(STATUS_META)
    .map(([key, meta]) => ({ label: meta.label, color: meta.color, value: data.by_status[key as keyof typeof data.by_status] ?? 0 }))
    .filter((s) => s.value > 0)
  const totalOrdersAllStatuses = statusSlices.reduce((s, x) => s + x.value, 0)

  const online = data.by_payment.find((p) => p.method === 'online')
  const onDelivery = data.by_payment.find((p) => p.method === 'on_delivery')
  const paymentSlices = [
    { label: 'Paid online', value: online?.orders ?? 0, color: '#09322c' },
    { label: 'Pay on delivery', value: onDelivery?.orders ?? 0, color: '#d97706' },
  ]

  return (
    <div className="space-y-4">
      {data.waiting_orders > 0 && (
        <Link
          to="/admin/orders"
          className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100"
        >
          <span className="flex items-center gap-2">
            <ClipboardList size={18} />
            {data.waiting_orders} new {data.waiting_orders === 1 ? 'order is' : 'orders are'} waiting for you
          </span>
          <span className="underline">Open orders</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Wallet size={16} />} label="Sales" value={money(data.revenue)} footer={<Delta now={data.revenue} before={data.prev_revenue} />} />
        <Kpi icon={<ClipboardList size={16} />} label="Orders" value={String(data.orders)} footer={<Delta now={data.orders} before={data.prev_orders} />} />
        <Kpi
          icon={<TrendingUp size={16} />}
          label="Average order"
          value={money(data.avg_order)}
          footer={<span className="text-xs text-gray-400">{data.cancelled} cancelled</span>}
        />
        <Kpi icon={<UserPlus size={16} />} label="New customers" value={String(data.new_users)} footer={<Delta now={data.new_users} before={data.prev_new_users} />} />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Last {data.days} days</h2>
          <div className="flex gap-1.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${metric === m.key ? 'bg-brand text-white' : 'border border-gray-200 text-gray-600 hover:border-brand'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <BarChart data={series} format={format} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Orders by status">
          {statusSlices.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No orders in this period.</p>
          ) : (
            <Donut slices={statusSlices} centre={{ big: String(totalOrdersAllStatuses), small: 'orders' }} />
          )}
        </Card>

        <Card title="How customers pay">
          {paymentSlices.every((s) => s.value === 0) ? (
            <p className="py-6 text-center text-sm text-gray-400">No sales in this period.</p>
          ) : (
            <>
              <Donut slices={paymentSlices} centre={{ big: String(data.orders), small: 'sales' }} />
              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                Online: {money(online?.revenue ?? 0)} · On delivery: {money(onDelivery?.revenue ?? 0)}
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Best sellers">
          {data.top_products.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nothing sold in this period yet.</p>
          ) : (
            <HBars
              rows={data.top_products.map((p) => ({
                label: p.name,
                value: Number(p.revenue),
                display: money(Number(p.revenue)),
                sub: `${p.units} sold`,
              }))}
            />
          )}
        </Card>

        <Card title="Running low">
          {data.low_stock.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Everything is well stocked.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.low_stock.map((v, i) => (
                <li key={`${v.product_id}-${i}`}>
                  <Link to={`/admin/products/${v.product_id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{v.name}</span>
                      <span className="text-xs text-gray-400">{[v.color, v.size].filter(Boolean).join(' · ') || 'Default'}</span>
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        v.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {v.stock === 0 && <AlertTriangle size={12} />}
                      {v.stock === 0 ? 'Sold out' : `${v.stock} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          icon={<Users size={16} />}
          label="All customers"
          value={String(data.total_users)}
          footer={<Link to="/admin/customers" className="text-xs font-medium text-brand underline">View customers</Link>}
        />
        <Kpi
          icon={<Users size={16} />}
          label="Repeat buyers"
          value={String(data.repeat_customers)}
          footer={<span className="text-xs text-gray-400">Bought more than once</span>}
        />
        <Kpi
          icon={<Star size={16} />}
          label="Store rating"
          value={data.reviews.count ? `${Number(data.reviews.average).toFixed(1)} / 5` : '–'}
          footer={<Link to="/admin/reviews" className="text-xs font-medium text-brand underline">{data.reviews.count} reviews</Link>}
        />
      </div>
    </div>
  )
}
