import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useDialog } from '../../context/DialogContext'
import { ListSkeleton } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'
import { retryRefund } from '../../lib/payments'

interface PaymentIssue {
  id: string
  order_id: string | null
  reference: string | null
  kind: 'refund_failed' | 'refund_needs_attention' | 'payment_mismatch' | 'dispute' | 'other'
  detail: string | null
  created_at: string
  orders: { order_number: number | string; phone: string | null; profiles: { full_name: string | null } | null } | null
}

const KIND_LABEL: Record<PaymentIssue['kind'], string> = {
  refund_failed: 'Refund failed',
  refund_needs_attention: 'Refund needs bank details',
  payment_mismatch: 'Wrong amount paid',
  dispute: 'Customer dispute',
  other: 'Other',
}

// What the owner should actually DO for each kind.
const KIND_HELP: Partial<Record<PaymentIssue['kind'], string>> = {
  refund_failed:
    'Press Retry. If it keeps failing, check that your Paystack balance or pending payout can cover the refund, or refund it from the Paystack dashboard using the reference.',
  refund_needs_attention:
    'Paystack can’t refund this to its source. The customer has been told on their order page to contact customer care. Collect their bank details on WhatsApp, then submit them on the Paystack dashboard (search the reference). This clears itself when the refund completes.',
  payment_mismatch: 'The payment was refunded automatically. Check with the customer, then mark this resolved.',
  dispute: 'Respond to the dispute on the Paystack dashboard before the deadline.',
}

export default function AdminPaymentIssues() {
  const dialog = useDialog()
  const queryClient = useQueryClient()

  const { data: issues, isLoading, error } = useQuery({
    queryKey: ['payment-issues'],
    queryFn: async (): Promise<PaymentIssue[]> => {
      const { data, error } = await supabase
        .from('payment_issues')
        .select('*, orders(order_number, phone, profiles(full_name))')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as PaymentIssue[]
    },
    refetchInterval: 30_000,
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['payment-issues'] })
    queryClient.invalidateQueries({ queryKey: ['payment-issues-count'] })
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  }

  const retry = useMutation({
    mutationFn: (id: string) => retryRefund(id),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
      refresh()
    },
    onError: (err) => toast.error((err as Error).message),
  })

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('payment_issues')
        .update({ resolved_at: new Date().toISOString(), resolved_by: auth.user?.id })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Marked as resolved')
      refresh()
    },
    onError: (err) => toast.error((err as Error).message),
  })

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Reference copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold">Needs attention</h1>
      <p className="mb-5 text-sm text-gray-500">Payment and refund problems the app could not finish by itself.</p>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <p className="text-red-600">Couldn't load: {(error as Error).message}</p>}
      {issues && issues.length === 0 && <p className="py-16 text-center text-gray-400">Nothing needs attention. 🎉</p>}

      <div className="space-y-4">
        {issues?.map((issue) => (
          <article key={issue.id} className="rounded-xl border border-red-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {KIND_LABEL[issue.kind]}
                  {issue.orders && <span className="font-normal text-gray-500"> · Order #{issue.orders.order_number}</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(issue.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                  {issue.orders?.profiles?.full_name ? ` · ${issue.orders.profiles.full_name}` : ''}
                  {issue.orders?.phone ? ` · ${issue.orders.phone}` : ''}
                </p>
              </div>
            </div>

            {issue.detail && <p className="mt-3 text-sm text-gray-700">{issue.detail}</p>}
            {KIND_HELP[issue.kind] && <p className="mt-2 text-sm text-gray-500">{KIND_HELP[issue.kind]}</p>}

            {issue.reference && (
              <button
                onClick={() => copy(issue.reference!)}
                className="mt-3 flex items-center gap-1.5 break-all rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-100"
              >
                <Copy size={13} className="shrink-0" /> {issue.reference}
              </button>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {issue.kind === 'refund_failed' && (
                <button
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(issue.id)}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                >
                  {retry.isPending ? 'Retrying…' : 'Retry refund'}
                </button>
              )}
              <button
                disabled={resolve.isPending}
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: 'Mark this as resolved?',
                    message: 'Only do this once the money has been dealt with.',
                    confirmLabel: 'Mark resolved',
                  })
                  if (ok) resolve.mutate(issue.id)
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-brand disabled:opacity-60"
              >
                Mark resolved
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
