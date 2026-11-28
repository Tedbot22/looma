import { describe, expect, it } from 'vitest'
import { runJobs, type Handler, type Job, type Outcome, type QueuePort } from './jobRunner'

const job = (id: number, kind = 'push.customer', over: Partial<Job> = {}): Job => ({ id, kind, payload: {}, attempts: 1, max_attempts: 5, ...over })

// An in-memory queue that behaves like the database functions: it hands out jobs once, remembers what was
// reported, and (like the real one) refuses reports from a worker that no longer holds the job.
function fakeQueue(initial: Job[], opts: { loseJobs?: number[]; failTellingQueue?: boolean } = {}) {
  const waiting = [...initial]
  const calls: string[] = []
  const reported = {
    done: new Map<number, Record<string, unknown> | null>(),
    failed: new Map<number, { error: string; permanent: boolean }>(),
    deferred: new Map<number, string>(),
  }
  const queue: QueuePort = {
    async claim(worker, limit) {
      calls.push(`claim:${worker}:${limit}`)
      return waiting.splice(0, limit)
    },
    async complete(id, _worker, result) {
      if (opts.failTellingQueue) throw new Error('database unreachable')
      if (opts.loseJobs?.includes(id)) return false
      reported.done.set(id, result)
      return true
    },
    async fail(id, _worker, error, permanent) {
      if (opts.loseJobs?.includes(id)) return null
      reported.failed.set(id, { error, permanent })
      return permanent ? 'dead' : 'queued'
    },
    async defer(id, _worker, _until, reason) {
      reported.deferred.set(id, reason)
      return true
    },
  }
  return { queue, reported, calls, waiting }
}

const base = { worker: 'w1', deadline: Date.now() + 60_000 }

describe('runJobs', () => {
  it('claims, runs the right handler for each kind, and reports each result', async () => {
    const { queue, reported } = fakeQueue([job(1, 'a'), job(2, 'b'), job(3, 'a')])
    const seen: string[] = []
    const handlers: Record<string, Handler> = {
      a: async (j) => (seen.push(`a${j.id}`), { type: 'done', result: { handledBy: 'a' } }),
      b: async (j) => (seen.push(`b${j.id}`), { type: 'done' }),
    }
    const report = await runJobs({ ...base, queue, handlers })
    expect(seen.sort()).toEqual(['a1', 'a3', 'b2'])
    expect(reported.done.get(1)).toEqual({ handledBy: 'a' })
    expect(reported.done.get(2)).toBeNull()
    expect(report).toMatchObject({ claimed: 3, done: 3, retried: 0, dead: 0, lost: 0, stoppedBecause: 'empty' })
    expect(report.byKind).toEqual({ a: { done: 2, retried: 0, dead: 0, deferred: 0 }, b: { done: 1, retried: 0, dead: 0, deferred: 0 } })
  })

  it('keeps claiming batches until the queue is empty', async () => {
    const { queue, calls } = fakeQueue(Array.from({ length: 25 }, (_, i) => job(i + 1)))
    const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'done' }) }, batchSize: 10 })
    expect(report.claimed).toBe(25)
    expect(calls.filter((c) => c.startsWith('claim'))).toHaveLength(4) // 10 + 10 + 5 + one empty
  })

  it('maps "retry" to a retry, and says so when the queue gives up on the job', async () => {
    const { queue, reported } = fakeQueue([job(1), job(2)])
    const handlers = { 'push.customer': async (j: Job): Promise<Outcome> => ({ type: 'retry', error: `push service said 503 for ${j.id}` }) }
    const report = await runJobs({ ...base, queue, handlers })
    expect(reported.failed.get(1)).toEqual({ error: 'push service said 503 for 1', permanent: false })
    expect(report).toMatchObject({ retried: 2, dead: 0 })
  })

  it('counts a retry as dead when the queue says the job has used up its attempts', async () => {
    const { queue } = fakeQueue([job(1)])
    queue.fail = async () => 'dead'
    const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'retry', error: 'still failing' }) } })
    expect(report).toMatchObject({ retried: 0, dead: 1 })
  })

  it('gives up at once on a job that cannot ever work', async () => {
    const { queue, reported } = fakeQueue([job(1)])
    const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'dead', error: 'Invalid payload' }) } })
    expect(reported.failed.get(1)).toEqual({ error: 'Invalid payload', permanent: true })
    expect(report.dead).toBe(1)
  })

  it('gives up at once on a kind it has no handler for, naming the kind', async () => {
    const { queue, reported } = fakeQueue([job(1, 'mystery.kind')])
    const report = await runJobs({ ...base, queue, handlers: {} })
    expect(reported.failed.get(1)).toEqual({ error: 'No handler for jobs of kind "mystery.kind".', permanent: true })
    expect(report.dead).toBe(1)
  })

  it('treats a handler that crashes as a temporary failure, and keeps going with the others', async () => {
    const { queue, reported } = fakeQueue([job(1), job(2), job(3)])
    const handlers = {
      'push.customer': async (j: Job): Promise<Outcome> => {
        if (j.id === 2) throw new Error('web-push exploded')
        return { type: 'done' }
      },
    }
    const report = await runJobs({ ...base, queue, handlers })
    expect(reported.failed.get(2)).toEqual({ error: 'web-push exploded', permanent: false })
    expect(report).toMatchObject({ done: 2, retried: 1 })
  })

  it('shortens very long error messages and copes with errors that are not Error objects', async () => {
    const { queue, reported } = fakeQueue([job(1), job(2)])
    const handlers = {
      'push.customer': async (j: Job): Promise<Outcome> => {
        if (j.id === 1) throw new Error('x'.repeat(1000))
        throw { statusCode: 410 }
      },
    }
    await runJobs({ ...base, queue, handlers })
    expect(reported.failed.get(1)!.error).toHaveLength(300)
    expect(reported.failed.get(2)!.error).toBe('{"statusCode":410}')
  })

  it('passes "not now" through without a failed attempt', async () => {
    const { queue, reported } = fakeQueue([job(1)])
    const handlers = { 'push.customer': async (): Promise<Outcome> => ({ type: 'defer', until: new Date(), reason: 'quiet hours' }) }
    const report = await runJobs({ ...base, queue, handlers })
    expect(reported.deferred.get(1)).toBe('quiet hours')
    expect(report.deferred).toBe(1)
  })

  it('counts, but does not trust, a result the queue refuses because another worker took the job', async () => {
    const { queue, reported } = fakeQueue([job(1), job(2)], { loseJobs: [1] })
    const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'done' }) } })
    expect(reported.done.has(1)).toBe(false)
    expect(report).toMatchObject({ done: 1, lost: 1 })
  })

  it('survives not being able to reach the queue to report, and carries on', async () => {
    const { queue } = fakeQueue([job(1), job(2)], { failTellingQueue: true })
    const logs: string[] = []
    const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'done' }) }, log: (m) => logs.push(m) })
    expect(report.claimed).toBe(2)
    expect(logs.filter((l) => l.includes('could not report back'))).toHaveLength(2)
  })

  it('runs only `concurrency` handlers at once', async () => {
    const { queue } = fakeQueue(Array.from({ length: 12 }, (_, i) => job(i + 1)))
    let running = 0
    let peak = 0
    const handlers = {
      'push.customer': async (): Promise<Outcome> => {
        running++
        peak = Math.max(peak, running)
        await Promise.resolve() // let the other workers in the pool start before this one finishes
        await Promise.resolve()
        running--
        return { type: 'done' }
      },
    }
    await runJobs({ ...base, queue, handlers, concurrency: 3, batchSize: 12 })
    expect(peak).toBe(3)
  })

  describe('time and limits', () => {
    it('stops claiming once the deadline has passed', async () => {
      const { queue, calls } = fakeQueue(Array.from({ length: 50 }, (_, i) => job(i + 1)))
      let clock = 1000
      const report = await runJobs({
        ...base, queue, deadline: 1500, now: () => clock, batchSize: 10,
        handlers: { 'push.customer': async () => ((clock += 300), { type: 'done' as const }) },
        concurrency: 1,
      })
      expect(report.stoppedBecause).toBe('deadline')
      expect(calls.filter((c) => c.startsWith('claim')).length).toBeLessThan(5)
    })

    it('hands back, untouched, jobs it claimed but ran out of time to start', async () => {
      const { queue, reported } = fakeQueue(Array.from({ length: 6 }, (_, i) => job(i + 1)))
      let clock = 0
      const report = await runJobs({
        ...base, queue, deadline: 100, now: () => clock, batchSize: 6, concurrency: 1,
        handlers: { 'push.customer': async () => ((clock += 60), { type: 'done' as const }) },
      })
      expect(report.done).toBe(2) // jobs 1 and 2 ran (the clock hit 120)
      expect(report.handedBack).toBe(4)
      expect([...reported.deferred.keys()].sort()).toEqual([3, 4, 5, 6])
      expect([...reported.deferred.values()][0]).toContain('ran out of time')
      expect(report.stoppedBecause).toBe('deadline')
    })

    it('does nothing at all if the deadline has already passed', async () => {
      const { queue, calls } = fakeQueue([job(1)])
      const report = await runJobs({ ...base, queue, deadline: 0, handlers: {} })
      expect(report.claimed).toBe(0)
      expect(calls).toEqual([])
      expect(report.stoppedBecause).toBe('deadline')
    })

    it('stops after maxJobs and never claims more than that', async () => {
      const { queue, waiting } = fakeQueue(Array.from({ length: 20 }, (_, i) => job(i + 1)))
      const report = await runJobs({ ...base, queue, handlers: { 'push.customer': async () => ({ type: 'done' }) }, batchSize: 8, maxJobs: 12 })
      expect(report.claimed).toBe(12)
      expect(report.stoppedBecause).toBe('limit')
      expect(waiting).toHaveLength(8)
    })

    it('asks for the lease it was configured with', async () => {
      const seen: number[] = []
      const queue: QueuePort = {
        claim: async (_w, _l, lease) => (seen.push(lease), []),
        complete: async () => true, fail: async () => null, defer: async () => true,
      }
      await runJobs({ ...base, queue, handlers: {}, leaseSeconds: 45 })
      expect(seen).toEqual([45])
    })
  })
})
