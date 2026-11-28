// The loop that works through the job queue. Plain TypeScript with no Deno or Supabase imports: the queue and
// the handlers are passed in, so this exact code is covered by ordinary tests (jobRunner.test.ts).
//
// It does four things, over and over until nothing is due or time is nearly up:
//   1. claim a batch of due jobs (the database makes sure no other worker gets the same ones);
//   2. run each job's handler (a few at a time);
//   3. report what happened: done, retry later, give up, or "not now";
//   4. stop in good time, handing back anything it claimed but did not start.

export interface Job {
  id: number
  kind: string
  payload: Record<string, unknown>
  attempts: number // including this one
  max_attempts: number
}

// What a handler says happened.
export type Outcome =
  | { type: 'done'; result?: Record<string, unknown> } // finished, or nothing needed doing (say why in result)
  | { type: 'retry'; error: string } // did not work; try again after a pause (gives up after max_attempts)
  | { type: 'dead'; error: string } // retrying cannot help (bad data, no such handler); stop now
  | { type: 'defer'; until: Date; reason: string } // not now; try later without counting a failed attempt

export type Handler = (job: Job) => Promise<Outcome>

// The queue, as the runner needs it. In production this is a thin wrapper over the database functions.
export interface QueuePort {
  claim(worker: string, limit: number, leaseSeconds: number): Promise<Job[]>
  complete(id: number, worker: string, result: Record<string, unknown> | null): Promise<boolean>
  fail(id: number, worker: string, error: string, permanent: boolean): Promise<string | null>
  defer(id: number, worker: string, until: Date, reason: string): Promise<boolean>
}

export interface RunOptions {
  worker: string // a name that is unique to this run, e.g. "scheduler-7f3a"
  queue: QueuePort
  handlers: Record<string, Handler>
  deadline: number // a timestamp (ms): no new batch is claimed after it, and unstarted jobs are handed back
  batchSize?: number // jobs claimed at a time (default 20)
  concurrency?: number // handlers running at once (default 5)
  leaseSeconds?: number // how long a claimed job is ours before others may take it (default 120)
  maxJobs?: number // stop after this many in total (default: no limit)
  now?: () => number
  log?: (message: string) => void
}

export interface KindReport {
  done: number
  retried: number
  dead: number
  deferred: number
}

export interface RunReport {
  claimed: number
  done: number
  retried: number
  dead: number
  deferred: number
  lost: number // jobs whose result was rejected because someone else had taken them over
  handedBack: number // claimed but not started because time ran out
  stoppedBecause: 'empty' | 'deadline' | 'limit'
  byKind: Record<string, KindReport>
}

const MAX_ERROR = 300

const messageOf = (err: unknown): string => {
  const text = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return (text || 'unknown error').slice(0, MAX_ERROR)
}

export async function runJobs(options: RunOptions): Promise<RunReport> {
  const { worker, queue, handlers, deadline } = options
  const batchSize = options.batchSize ?? 20
  const concurrency = Math.max(1, options.concurrency ?? 5)
  const leaseSeconds = options.leaseSeconds ?? 120
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})

  const report: RunReport = { claimed: 0, done: 0, retried: 0, dead: 0, deferred: 0, lost: 0, handedBack: 0, stoppedBecause: 'empty', byKind: {} }
  const kindReport = (kind: string) => (report.byKind[kind] ??= { done: 0, retried: 0, dead: 0, deferred: 0 })

  // Adds one to the overall count and to the count for this kind of job.
  const tally = (kind: string, what: keyof KindReport) => {
    report[what]++
    kindReport(kind)[what]++
  }

  // Reports one job's outcome to the queue. If we no longer hold the job, the queue refuses and we count it as lost.
  const finish = async (job: Job, outcome: Outcome) => {
    let applied: boolean
    switch (outcome.type) {
      case 'done':
        applied = await queue.complete(job.id, worker, outcome.result ?? null)
        if (applied) tally(job.kind, 'done')
        break
      case 'retry': {
        const status = await queue.fail(job.id, worker, outcome.error, false)
        applied = status !== null
        if (applied) tally(job.kind, status === 'dead' ? 'dead' : 'retried') // "dead" when it has used all its attempts
        break
      }
      case 'dead':
        applied = (await queue.fail(job.id, worker, outcome.error, true)) !== null
        if (applied) tally(job.kind, 'dead')
        break
      case 'defer':
        applied = await queue.defer(job.id, worker, outcome.until, outcome.reason)
        if (applied) tally(job.kind, 'deferred')
        break
    }
    if (!applied) {
      report.lost++
      log(`job ${job.id} (${job.kind}): result ignored, the job is no longer ours`)
    }
  }

  const runOne = async (job: Job) => {
    // Out of time before we even started this one: give it back untouched (this does not count as an attempt).
    if (now() >= deadline) {
      await queue.defer(job.id, worker, new Date(now()), 'The worker ran out of time before starting this job.')
      report.handedBack++
      return
    }

    const handler = handlers[job.kind]
    if (!handler) {
      await finish(job, { type: 'dead', error: `No handler for jobs of kind "${job.kind}".` })
      return
    }

    let outcome: Outcome
    try {
      outcome = await handler(job)
    } catch (err) {
      outcome = { type: 'retry', error: messageOf(err) } // an unexpected crash is treated as a temporary failure
      log(`job ${job.id} (${job.kind}) threw: ${outcome.error}`)
    }

    try {
      await finish(job, outcome)
    } catch (err) {
      // We could not tell the queue. Its lease will run out and the job will be picked up again.
      log(`job ${job.id} (${job.kind}): could not report back: ${messageOf(err)}`)
    }
  }

  for (;;) {
    if (options.maxJobs !== undefined && report.claimed >= options.maxJobs) {
      report.stoppedBecause = 'limit'
      break
    }
    if (now() >= deadline) {
      report.stoppedBecause = 'deadline'
      break
    }

    const room = options.maxJobs === undefined ? batchSize : Math.min(batchSize, options.maxJobs - report.claimed)
    const batch = await queue.claim(worker, room, leaseSeconds)
    if (batch.length === 0) {
      report.stoppedBecause = 'empty'
      break
    }
    report.claimed += batch.length

    // A small pool: `concurrency` handlers at a time, each taking the next job when it finishes.
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
        while (next < batch.length) await runOne(batch[next++])
      })
    )
  }

  return report
}
