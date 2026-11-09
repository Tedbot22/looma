import { useState } from 'react'
import { ListSkeleton } from '../../components/Skeleton'
import { Link } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { formatNaira } from '../../lib/format'
import { couponStatus, daysLeft, describeCoupon, type Coupon } from '../../lib/coupons'
import { useCoupons } from '../../hooks/useCoupons'

const TABS = [
  { key: 'active', label: 'Available' },
  { key: 'past', label: 'Used & expired' },
] as const

function CouponCard({ coupon }: { coupon: Coupon }) {
  const status = couponStatus(coupon)
  const left = daysLeft(coupon.expires_at)
  const expiringSoon = status === 'active' && left <= 7

  return (
    <li
      className={`overflow-hidden rounded-2xl border ${
        status === 'active' ? 'border-brand bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
      }`}
    >
      <div className="flex items-stretch">
        <div className={`flex w-16 shrink-0 items-center justify-center ${status === 'active' ? 'bg-brand text-white' : 'bg-gray-300 text-white'}`}>
          <Ticket size={24} />
        </div>
        <div className="min-w-0 flex-1 p-4">
          <p className="font-semibold">{describeCoupon(coupon)}</p>
          {coupon.min_order > 0 && (
            <p className="text-sm text-gray-500">When you spend {formatNaira(coupon.min_order)} or more</p>
          )}
          <p className="mt-1 font-mono text-xs text-gray-400">{coupon.code}</p>

          <p
            className={`mt-2 text-xs font-medium ${
              status === 'used' ? 'text-gray-500' : status === 'expired' ? 'text-red-600' : expiringSoon ? 'text-amber-600' : 'text-gray-500'
            }`}
          >
            {status === 'used' &&
              `Used${coupon.discount_applied ? `: saved ${formatNaira(coupon.discount_applied)}` : ''}`}
            {status === 'expired' &&
              `Expired on ${new Date(coupon.expires_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`}
            {status === 'active' &&
              `${left <= 1 ? 'Expires today or tomorrow' : `Expires in ${left} days`} · ${new Date(coupon.expires_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}`}
          </p>
        </div>
      </div>
    </li>
  )
}

export default function Vouchers() {
  const { data: coupons = [], isLoading } = useCoupons()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active')

  const active = coupons.filter((c) => couponStatus(c) === 'active')
  // Newest first for the history.
  const past = coupons.filter((c) => couponStatus(c) !== 'active').sort((a, b) => b.issued_at.localeCompare(a.issued_at))
  const shown = tab === 'active' ? active : past

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Vouchers</h1>

      <div className="mb-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t.key ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
            {t.key === 'active' && active.length > 0 && ` (${active.length})`}
          </button>
        ))}
      </div>

      {isLoading && <ListSkeleton rows={3} />}

      {!isLoading && shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center">
          <Ticket className="mx-auto text-gray-300" size={40} />
          <p className="mt-3 font-medium">{tab === 'active' ? 'No vouchers right now' : 'Nothing here yet'}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
            {tab === 'active'
              ? 'Invite friends to earn a surprise voucher. Each one is valid for 30 days.'
              : 'Vouchers you have used or that have expired will show up here.'}
          </p>
          {tab === 'active' && (
            <Link to="/account/invite" className="mt-4 inline-block text-sm font-medium text-brand underline">
              See how to earn vouchers
            </Link>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((c) => (
          <CouponCard key={c.id} coupon={c} />
        ))}
      </ul>

      {tab === 'active' && active.length > 0 && (
        <p className="mt-5 text-center text-sm text-gray-500">
          Vouchers are applied at checkout.{' '}
          <Link to="/shop" className="font-medium text-brand underline">
            Start shopping
          </Link>
        </p>
      )}
    </div>
  )
}
