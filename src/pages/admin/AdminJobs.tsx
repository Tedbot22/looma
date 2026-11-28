import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { ListSkeleton } from '../../components/Skeleton'
import { useDialog } from '../../context/DialogContext'
import { errorMessage } from '../../api/db'
import { fetchJobOverview, requeueJob } from '../../api/jobs'
import { savePushSettings } from '../../api/push'
import { queryKeys } from '../../api/queryKeys'
import { describeJob, describeJobKind, describeWait, STUCK_AFTER_SECONDS, totalJobs } from '../../lib/jobs'

// How the automatic reminders and promotions are doing, and what to do when one could not be sent.
export default function AdminJobs() {
  const dialog = useDialog()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.jobOverview(),
    queryFn: fetchJobOverview,
    refetchInterval: 15_000,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.jobOverview() })

  const retry = useMutation({
    mutationFn: (id: number) => requeueJob(id),
    onSuccess: (changed) => {
      if (changed) toast.success('It will be tried again within a few minutes.')
      else toast.info('That one is not waiting any more.')
      refresh()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const setQueue = useMutation({
    mutationFn: (enabled: boolean) => savePushSettings({ queue_enabled: enabled }),
    onSuccess: (_, enabled) => {
      toast.success(enabled ? 'Reliable sending is on.' : 'Switched back to the old sender.')
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.pushSettings() })
      refresh()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  async function toggle(turnOn: boolean) {
    const ok = await dialog.confirm(
      turnOn
        ? {
            title: 'Turn on reliable sending?',
            message:
              'Reminders and promotions will go through a queue: each one is retried automatically if it fails, and anything that still cannot be sent shows up on this page with the reason. Turn it on when no promotion is partway through sending. You can switch back at any time.',
            confirmLabel: 'Turn on',
          }
        : {
            title: 'Switch back to the old sender?',
            message: 'Reminders that are still waiting in the queue will not be sent. Only do this if something is wrong.',
            confirmLabel: 'Switch back',
          }
    )
    if (ok) setQueue.mutate(turnOn)
  }

  const totals = data ? totalJobs(data.counts) : null
  const stuck = !!data?.enabled && (data.oldest_waiting_seconds ?? 0) > STUCK_AFTER_SECONDS

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-bold">Reminder system</h1>
      <p className="mb-5 text-sm text-gray-500">
        How your automatic reminders and promotions are doing, and anything that could not be sent.
      </p>

      {isLoading && <ListSkeleton rows={3} />}
      {error && <p className="text-red-600">Couldn't load: {errorMessage(error)}</p>}

      {data && totals && (
        <div className="space-y-5">
          <section className={`rounded-xl border p-5 ${data.enabled ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {data.enabled ? <CheckCircle2 size={18} className="text-green-600" /> : <AlertTriangle size={18} className="text-amber-600" />}
                  {data.enabled ? 'Reliable sending is on' : 'Reliable sending is off'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {data.enabled
                    ? 'Each reminder is retried automatically if it fails, and anything that cannot be sent is listed below.'
                    : 'Reminders are sent by the old sender: if one fails it is simply tried again later, with no record of why.'}
                </p>
              </div>
              <button
                disabled={setQueue.isPending}
                onClick={() => toggle(!data.enabled)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-60"
              >
                {data.enabled ? 'Switch back' : 'Turn on'}
              </button>
            </div>
          </section>

          {stuck && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              The longest-waiting reminder has been waiting {describeWait(data.oldest_waiting_seconds ?? 0)}. The timer that sends
              reminders may have stopped. Check that the scheduled job in Supabase is running.
            </p>
          )}

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Waiting to send', value: totals.waiting },
              { label: 'Sending now', value: totals.running },
              { label: 'Done (last week)', value: totals.done },
              { label: 'Gave up', value: totals.gaveUp, alert: totals.gaveUp > 0 },
            ].map((box) => (
              <div key={box.label} className={`rounded-xl border bg-white p-4 ${box.alert ? 'border-red-200' : 'border-gray-200'}`}>
                <p className={`text-2xl font-bold ${box.alert ? 'text-red-600' : ''}`}>{box.value}</p>
                <p className="text-xs text-gray-500">{box.label}</p>
              </div>
            ))}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Reminders that gave up</h2>
            {data.dead.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                Nothing has failed. 🎉 A reminder only appears here after several tries and pauses.
              </p>
            ) : (
              <div className="space-y-3">
                {data.dead.map((job) => (
                  <article key={job.id} className="rounded-xl border border-red-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{describeJob(job.kind, job.sub_kind)}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(job.finished_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })} · tried{' '}
                          {job.attempts} {job.attempts === 1 ? 'time' : 'times'}
                        </p>
                      </div>
                      <button
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(job.id)}
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60"
                      >
                        Try again
                      </button>
                    </div>
                    {job.last_error && <p className="mt-3 break-words rounded-lg bg-gray-50 p-3 text-xs text-gray-700">{job.last_error}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>

          {data.counts.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">By type</h2>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <tbody>
                    {[...new Set(data.counts.map((c) => c.kind))].map((kind) => {
                      const t = totalJobs(data.counts.filter((c) => c.kind === kind))
                      return (
                        <tr key={kind} className="border-b border-gray-100 last:border-0">
                          <td className="p-3">{describeJobKind(kind)}</td>
                          <td className="p-3 text-right text-gray-500">
                            {t.waiting} waiting · {t.done} done · {t.gaveUp} gave up
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
