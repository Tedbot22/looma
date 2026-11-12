import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Gift, MessageCircle, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { STORE_NAME } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import { useAppSettings } from '../../hooks/useAppSettings'
import { useCoupons } from '../../hooks/useCoupons'
import { couponStatus } from '../../lib/coupons'

export default function Invite() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: settings } = useAppSettings()
  const { data: coupons = [] } = useCoupons()
  const [copied, setCopied] = useState(false)

  const minOrder = Number(settings?.referral_min_order ?? 3000)
  const target = Number(settings?.referral_target ?? 10)
  const validDays = Number(settings?.coupon_valid_days ?? 30)

  // How many invited friends have a delivered order whose items came to at least the minimum.
  const { data: progress = 0 } = useQuery({
    queryKey: ['referral-progress', user?.id],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('my_referral_progress')
      if (error) throw error
      return data as number
    },
    enabled: !!user,
  })

  if (!profile) return <p className="py-20 text-center text-gray-400">Loading…</p>

  const link = `${window.location.origin}/?ref=${profile.referral_code}`
  const shareText = `I shop thrift finds at student prices on ${STORE_NAME}. Sign up with my link:`

  // Vouchers earned from invites so far. Each one used up a block of friends.
  const earned = coupons.filter((c) => c.source === 'referral')
  const available = earned.filter((c) => couponStatus(c) === 'active').length

  // Progress toward the NEXT voucher (earlier blocks of friends already paid out).
  const toward = Math.max(0, progress - earned.length * target)
  const percent = Math.min(100, Math.round((toward / target) * 100))

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy. Please copy the link manually.")
    }
  }

  async function shareLink() {
    // The phone's own share sheet, when available.
    if (navigator.share) {
      try {
        await navigator.share({ title: STORE_NAME, text: shareText, url: link })
      } catch {
        /* they closed the share sheet: nothing to do */
      }
    } else {
      copyLink()
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-2">
        <Gift size={22} className="text-brand" />
        <h1 className="text-2xl font-bold">Invite friends</h1>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        When {target} friends you invite each spend at least {formatNaira(minOrder)}, you earn a voucher
        from {STORE_NAME}: a discount or free delivery. Each voucher is valid for {validDays} days.
      </p>

      <section className="mt-6 rounded-2xl border border-gray-200 p-5">
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-medium">
            {toward} of {target} friends
          </span>
          <span className="text-gray-400">{percent}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          A friend counts once they complete their first order of {formatNaira(minOrder)} or more.
        </p>

        {earned.length > 0 && (
          <Link
            to="/account/vouchers"
            className="mt-4 block rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800 hover:bg-green-100"
          >
            🎉 You've earned {earned.length} {earned.length === 1 ? 'voucher' : 'vouchers'}
            {available > 0 ? ` (${available} available)` : ''}. See your vouchers →
          </Link>
        )}

        <div className="mt-5">
          <p className="mb-1 text-sm font-medium">Your invite link</p>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-600">{link}</span>
            <button onClick={copyLink} aria-label="Copy link" className="shrink-0 p-1 text-gray-500 hover:text-brand">
              {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Your refferal code: <span className="font-mono font-semibold">{profile.referral_code}</span>
          </p>

          <div className="mt-3 flex gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              <MessageCircle size={16} /> Share on WhatsApp
            </a>
            <button
              onClick={shareLink}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium hover:border-brand"
            >
              <Share2 size={16} /> Share
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
