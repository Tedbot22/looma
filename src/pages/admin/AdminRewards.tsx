import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import { whatsappLinkTo } from '../../lib/whatsapp'
import { useAppSettings } from '../../hooks/useAppSettings'

interface AdminReward {
  id: string
  user_id: string
  status: 'earned' | 'claimed'
  note: string | null
  created_at: string
  profiles: { full_name: string | null; phone: string | null } | null
}

interface ReferredPerson {
  id: string
  full_name: string | null
  phone: string | null
  orders: { order_number: number; total: number; status: string; delivery_address: string }[]
}

const TABS = [
  { key: 'earned', label: 'To give' },
  { key: 'claimed', label: 'Given' },
] as const

// The people one customer invited, and whether each one really qualified.
// This is the owner's fraud check: same phone numbers or addresses across "different friends" stand out.
function ReferralList({ userId }: { userId: string }) {
  const { data: settings } = useAppSettings()
  const minOrder = Number(settings?.referral_min_order ?? 3000)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-referrals', userId],
    queryFn: async (): Promise<ReferredPerson[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, orders(order_number, total, status, delivery_address)')
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
        const qualifying = p.orders.find((o) => o.status === 'delivered' && o.total >= minOrder)
        return (
          <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{p.full_name || 'Customer'}</p>
              <p className="text-xs text-gray-500">{p.phone}</p>
              {qualifying && <p className="truncate text-xs text-gray-400">{qualifying.delivery_address}</p>}
            </div>
            {qualifying ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-green-700">
                <CheckCircle2 size={14} /> #{qualifying.order_number} · {formatNaira(qualifying.total)}
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

export default function AdminRewards() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('earned')
  const [openId, setOpenId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: rewards, isLoading, error } = useQuery({
    queryKey: ['admin-rewards', tab],
    queryFn: async (): Promise<AdminReward[]> => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, user_id, status, note, created_at, profiles(full_name, phone)')
        .eq('status', tab)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as AdminReward[]
    },
  })

  const markGiven = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from('rewards')
        .update({ status: 'claimed', note: note.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Marked as given')
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] })
    },
    onError: (err) => toast.error((err as Error).message),
  })

  function give(reward: AdminReward) {
    // Keep it simple: ask which item was given (optional) so there's a record.
    const note = window.prompt('Which item did you give? (optional, e.g. "Black tee, size M")')
    if (note === null) return // they cancelled
    markGiven.mutate({ id: reward.id, note })
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Referral rewards</h1>
      <p className="mb-5 text-sm text-gray-500">
        Customers appear here automatically when their invited friends' orders are delivered.
      </p>

      <div className="mb-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t.key
                ? 'border-brand bg-brand text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-600">Couldn't load rewards: {(error as Error).message}</p>}
      {rewards && rewards.length === 0 && (
        <p className="py-16 text-center text-gray-400">
          {tab === 'earned' ? 'No rewards waiting right now.' : 'No rewards given yet.'}
        </p>
      )}

      <div className="space-y-3">
        {rewards?.map((r) => {
          const name = r.profiles?.full_name || 'Customer'
          const open = openId === r.id

          return (
            <article key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-gray-500">{r.profiles?.phone}</p>
                  <p className="text-xs text-gray-400">
                    Earned {new Date(r.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
                  </p>
                  {r.note && <p className="mt-1 text-sm text-gray-600">Given: {r.note}</p>}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {r.status === 'earned' && (
                    <>
                      {r.profiles?.phone && (
                        <a
                          href={whatsappLinkTo(
                            r.profiles.phone,
                            `Hi ${name}! You've earned a free item for inviting friends. Let's arrange it 🎉`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-center text-sm font-medium hover:border-brand"
                        >
                          Message
                        </a>
                      )}
                      <button
                        onClick={() => give(r)}
                        disabled={markGiven.isPending}
                        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                      >
                        Mark given
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setOpenId(open ? null : r.id)}
                className="mt-3 flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {open ? 'Hide' : 'Check'} their referrals
              </button>
              {open && <ReferralList userId={r.user_id} />}
            </article>
          )
        })}
      </div>
    </div>
  )
}
