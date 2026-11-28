// Tests for supabase/migrations/20261127000000_job_queue.sql, run against a real Postgres.
//
// Set DATABASE_URL to a database that already has supabase/tests/fixtures/queue_schema.sql and the migration
// applied (CI does exactly that). Without DATABASE_URL these tests are skipped.

import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.DATABASE_URL
const suite = url ? describe : describe.skip

const connect = async () => {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  return client
}

suite('job queue (database)', () => {
  let db: pg.Client
  const q = async <T = Record<string, unknown>>(text: string, values: unknown[] = []) => (await db.query(text, values)).rows as T[]
  const one = async <T = unknown>(text: string, values: unknown[] = []) => (await q<{ v: T }>(`select (${text}) as v`, values))[0].v

  beforeAll(async () => {
    db = await connect()
  })
  afterAll(async () => {
    await db.end()
  })

  beforeEach(async () => {
    await db.query('reset role')
    await db.query("select set_config('test.uid', '', false)")
    await db.query(
      `truncate public.jobs, public.push_log, public.promo_messages, public.cart_items, public.orders,
                public.customer_push_subscriptions, public.device_tokens, public.push_preferences,
                public.product_variants, public.products, public.profiles restart identity cascade`
    )
    await db.query(
      `update public.push_settings set cart_enabled = true, cart_first_hours = 4, cart_second_hours = 24, confirm_enabled = true,
              confirm_after_min = 20, inactive_enabled = true, inactive_after_days = 10, promo_weekly_cap = 2,
              queue_enabled = true where id = 1`
    )
    await setQuietAroundNow(false) // the real clock must never decide a test's outcome
  })

  // --- tiny builders -------------------------------------------------------------------------------------------
  const user = async (over: { admin?: boolean; lastSeen?: string; optOut?: boolean; device?: boolean } = {}) => {
    const [{ id }] = await q<{ id: string }>(
      `insert into public.profiles (is_admin, last_seen_at) values ($1, $2) returning id`,
      [over.admin ?? false, over.lastSeen ?? new Date().toISOString()] // recently seen, unless a test says otherwise
    )
    if (over.device !== false) {
      await db.query(`insert into public.customer_push_subscriptions (user_id, endpoint) values ($1, $2)`, [id, `https://push/${id}`])
    }
    if (over.optOut) await db.query(`insert into public.push_preferences (user_id, marketing) values ($1, false)`, [id])
    return id
  }
  // A cart with one in-stock item whose last change was `hoursAgo` hours ago.
  const cart = async (userId: string, hoursAgo: number, stock = 3) => {
    const [{ id: productId }] = await q<{ id: string }>(`insert into public.products (name) values ('Denim Jacket') returning id`)
    const [{ id: variantId }] = await q<{ id: string }>(`insert into public.product_variants (product_id, stock) values ($1, $2) returning id`, [productId, stock])
    await db.query(
      `insert into public.cart_items (user_id, variant_id, created_at, updated_at) values ($1, $2, now() - make_interval(hours => $3), now() - make_interval(hours => $3))`,
      [userId, variantId, hoursAgo]
    )
  }
  const enqueue = (kind = 'test', over: { key?: string | null; runAt?: string; max?: number; quiet?: boolean; priority?: number; payload?: object } = {}) =>
    one<number | null>('public.enqueue_job($1, $2::jsonb, $3, coalesce($4::timestamptz, now()), $5, $6, $7::smallint)', [
      kind, JSON.stringify(over.payload ?? {}), over.key ?? null, over.runAt ?? null, over.max ?? 5, over.quiet ?? false, over.priority ?? 0,
    ])
  const claim = (worker: string, limit = 10, kinds: string[] | null = null, lease = 120) =>
    q<{ id: string; attempts: number; kind: string; status: string; lease_until: string }>(
      'select * from public.claim_jobs($1, $2::text[], $3, $4)', [worker, kinds, limit, lease]
    )
  const job = async (id: number | string) => (await q<Record<string, any>>('select * from public.jobs where id = $1', [id]))[0]
  // Make the current Lagos time fall inside quiet hours (or outside), without waiting for the clock.
  // inside=true: now is within quiet hours. inside=false: quiet hours are a 2-hour window that does not include now.
  const setQuietAroundNow = (inside: boolean) =>
    db.query(
      `update public.push_settings set quiet_start_hour = x.h, quiet_end_hour = (x.h + 2) % 24
         from (select ${inside ? '' : '(7 + '}extract(hour from now() at time zone 'Africa/Lagos')::int${inside ? '' : ') % 24'} as h) x where id = 1`
    )

  // ============================================================================================================
  describe('putting jobs on the queue', () => {
    it('queues a job, and refuses the same dedupe key twice', async () => {
      const first = await enqueue('push.customer', { key: 'cart_1:u1:123' })
      const again = await enqueue('push.customer', { key: 'cart_1:u1:123' })
      expect(first).not.toBeNull()
      expect(again).toBeNull()
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(1)
    })

    it('allows many jobs without a key', async () => {
      await enqueue('a')
      await enqueue('a')
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(2)
    })

    it('starts in "queued" with zero attempts', async () => {
      const id = await enqueue('x')
      expect(await job(id!)).toMatchObject({ status: 'queued', attempts: 0, max_attempts: 5 })
    })
  })

  // ============================================================================================================
  describe('claiming', () => {
    it('hands out only jobs that are due, highest priority first and then oldest', async () => {
      const later = await enqueue('x', { runAt: new Date(Date.now() + 3_600_000).toISOString() })
      const low = await enqueue('x', { runAt: new Date(Date.now() - 2000).toISOString() })
      const urgent = await enqueue('x', { priority: 10 })
      const older = await enqueue('x', { runAt: new Date(Date.now() - 60_000).toISOString() })
      const got = (await claim('w1')).map((j) => Number(j.id))
      expect(got).toEqual([urgent, older, low].map(Number))
      expect(got).not.toContain(Number(later))
    })

    it('marks them running, counts the attempt and sets a lease', async () => {
      const id = await enqueue('x')
      const [claimed] = await claim('w1', 10, null, 90)
      expect(Number(claimed.id)).toBe(Number(id))
      expect(claimed.status).toBe('running')
      expect(claimed.attempts).toBe(1)
      const secs = await one<number>('extract(epoch from (select lease_until - now() from public.jobs where id = $1))::float8', [id])
      expect(secs).toBeGreaterThan(80)
      expect(secs).toBeLessThanOrEqual(90)
    })

    it('respects the limit and the kinds filter', async () => {
      for (let i = 0; i < 5; i++) await enqueue('a')
      for (let i = 0; i < 5; i++) await enqueue('b')
      expect(await claim('w1', 3)).toHaveLength(3)
      const bs = await claim('w1', 10, ['b'])
      expect(bs.every((j) => j.kind === 'b')).toBe(true)
    })

    it('never hands the same job to two workers racing for it', async () => {
      const total = 300
      await db.query(`insert into public.jobs (kind) select 'race' from generate_series(1, $1)`, [total])

      const workers = await Promise.all(Array.from({ length: 6 }, connect))
      try {
        const claimed = await Promise.all(
          workers.map(async (client, n) => {
            const mine: string[] = []
            for (;;) {
              const { rows } = await client.query('select id from public.claim_jobs($1, null, 7, 120)', [`worker-${n}`])
              if (rows.length === 0) break
              mine.push(...rows.map((r) => String(r.id)))
            }
            return mine
          })
        )
        const all = claimed.flat()
        expect(all).toHaveLength(total) // every job was taken...
        expect(new Set(all).size).toBe(total) // ...and none was taken twice
        expect(claimed.filter((c) => c.length > 0).length).toBeGreaterThan(1) // the work really was shared
      } finally {
        await Promise.all(workers.map((w) => w.end()))
      }
    })
  })

  // ============================================================================================================
  describe('reporting back', () => {
    it('lets only the worker that holds a job finish it', async () => {
      const id = await enqueue('x')
      await claim('alice')
      expect(await one('public.complete_job($1, $2, $3::jsonb)', [id, 'bob', '{}'])).toBe(false)
      expect((await job(id!)).status).toBe('running')
      expect(await one('public.complete_job($1, $2, $3::jsonb)', [id, 'alice', '{"delivered":2}'])).toBe(true)
      expect(await job(id!)).toMatchObject({ status: 'succeeded', result: { delivered: 2 }, locked_by: null })
      expect((await job(id!)).finished_at).not.toBeNull()
    })

    it('retries a failure after a growing pause, then gives up and keeps the reason', async () => {
      const id = await enqueue('x', { max: 3 })
      const expectedWait = [30, 60]
      for (const base of expectedWait) {
        await claim('w')
        expect(await one<string>('public.fail_job($1, $2, $3)', [id, 'w', 'push service said 503'])).toBe('queued')
        const wait = await one<number>('extract(epoch from (select run_at - now() from public.jobs where id = $1))::float8', [id])
        expect(wait).toBeGreaterThan(base - 2)
        expect(wait).toBeLessThan(base * 1.2 + 2) // base plus up to 20% jitter
        await db.query('update public.jobs set run_at = now() where id = $1', [id]) // jump ahead to the retry
      }
      await claim('w')
      expect(await one<string>('public.fail_job($1, $2, $3)', [id, 'w', 'push service said 503'])).toBe('dead')
      expect(await job(id!)).toMatchObject({ status: 'dead', attempts: 3, last_error: 'push service said 503' })
      expect((await job(id!)).finished_at).not.toBeNull()
      expect(await claim('w')).toHaveLength(0) // a dead job is never handed out again
    })

    it('gives up straight away when told retrying cannot help', async () => {
      const id = await enqueue('x', { max: 5 })
      await claim('w')
      expect(await one<string>('public.fail_job($1, $2, $3, true)', [id, 'w', 'bad payload'])).toBe('dead')
    })

    it('ignores a failure report from a worker that no longer holds the job', async () => {
      const id = await enqueue('x')
      await claim('alice')
      expect(await one('public.fail_job($1, $2, $3)', [id, 'bob', 'nope'])).toBeNull()
      expect((await job(id!)).status).toBe('running')
    })

    it('backs off 30s, 1m, 2m, 4m... never more than an hour', async () => {
      const waits = await q<{ s: number }>(`select extract(epoch from public.job_backoff(n))::int as s from generate_series(1, 9) n order by n`)
      expect(waits.map((w) => w.s)).toEqual([30, 60, 120, 240, 480, 960, 1920, 3600, 3600])
    })

    it('can postpone a job without counting it as a failed attempt', async () => {
      const id = await enqueue('x')
      await claim('w')
      const later = new Date(Date.now() + 600_000).toISOString()
      expect(await one('public.defer_job($1, $2, $3::timestamptz, $4)', [id, 'w', later, 'not yet'])).toBe(true)
      expect(await job(id!)).toMatchObject({ status: 'queued', attempts: 0, last_error: 'not yet' })
      expect(await claim('w')).toHaveLength(0) // not due yet
    })
  })

  // ============================================================================================================
  describe('a worker that dies', () => {
    it('loses its job when its time runs out, and another worker finishes it', async () => {
      const id = await enqueue('x')
      await claim('crashed')
      await db.query(`update public.jobs set lease_until = now() - interval '1 second' where id = $1`, [id]) // the lease ran out
      expect(await one<number>('public.reap_expired_jobs()')).toBe(1)
      expect(await job(id!)).toMatchObject({ status: 'queued', locked_by: null })
      expect(await job(id!)).toMatchObject({ last_error: expect.stringContaining('stopped before finishing') })

      await db.query('update public.jobs set run_at = now() where id = $1', [id]) // skip the retry pause
      const [again] = await claim('rescuer')
      expect(Number(again.id)).toBe(Number(id))
      expect(again.attempts).toBe(2)

      // The first worker finally wakes up and tries to report: it must not overwrite the new owner.
      expect(await one('public.complete_job($1, $2, null)', [id, 'crashed'])).toBe(false)
      expect(await one('public.complete_job($1, $2, null)', [id, 'rescuer'])).toBe(true)
    })

    it('stops retrying a job that keeps killing its worker', async () => {
      const id = await enqueue('poison', { max: 2 })
      for (let i = 0; i < 2; i++) {
        await claim('w')
        await db.query(`update public.jobs set lease_until = now() - interval '1 second' where id = $1`, [id])
        await db.query('select public.reap_expired_jobs()')
        await db.query('update public.jobs set run_at = now() where id = $1 and status = $2', [id, 'queued'])
      }
      expect(await job(id!)).toMatchObject({ status: 'dead', attempts: 2 })
    })

    it('does not touch a job whose lease is still valid', async () => {
      await enqueue('x')
      await claim('busy', 10, null, 300)
      expect(await one<number>('public.reap_expired_jobs()')).toBe(0)
    })
  })

  // ============================================================================================================
  describe('quiet hours', () => {
    beforeEach(() => db.query('update public.push_settings set quiet_start_hour = 21, quiet_end_hour = 8 where id = 1'))
    const at = (iso: string) => one<string>(`to_char(public.next_send_time($1::timestamptz) at time zone 'Africa/Lagos', 'YYYY-MM-DD HH24:MI')`, [iso])

    it('moves a late-evening moment to the next morning (Lagos time, 21:00 to 08:00)', async () => {
      expect(await at('2026-06-10T21:30:00Z')).toBe('2026-06-11 08:00') // 22:30 in Lagos
      expect(await at('2026-06-11T02:00:00Z')).toBe('2026-06-11 08:00') // 03:00 in Lagos, after midnight
    })

    it('leaves daytime moments alone', async () => {
      expect(await one<boolean>(`public.next_send_time('2026-06-10T11:00:00Z') = '2026-06-10T11:00:00Z'::timestamptz`)).toBe(true)
    })

    it('treats 21:00 as quiet and 08:00 as open', async () => {
      expect(await one<boolean>(`public.is_quiet_hour('2026-06-10T20:00:00Z')`)).toBe(true) // 21:00 Lagos
      expect(await one<boolean>(`public.is_quiet_hour('2026-06-10T19:59:00Z')`)).toBe(false) // 20:59 Lagos
      expect(await one<boolean>(`public.is_quiet_hour('2026-06-11T06:59:00Z')`)).toBe(true) // 07:59 Lagos
      expect(await one<boolean>(`public.is_quiet_hour('2026-06-11T07:00:00Z')`)).toBe(false) // 08:00 Lagos
    })

    it('never has quiet hours when start and end are the same', async () => {
      await db.query('update public.push_settings set quiet_start_hour = 5, quiet_end_hour = 5 where id = 1')
      expect(await one<boolean>(`public.is_quiet_hour('2026-06-10T22:00:00Z')`)).toBe(false)
    })

    it('makes a customer reminder that failed at night retry in the morning, not at 3am', async () => {
      await setQuietAroundNow(true)
      const id = await enqueue('push.customer', { quiet: true })
      await claim('w')
      await db.query('select public.fail_job($1, $2, $3)', [id, 'w', 'temporary'])
      expect(await one<boolean>('public.is_quiet_hour((select run_at from public.jobs where id = $1))', [id])).toBe(false)
    })

    it('lets an owner alert retry at any hour', async () => {
      await setQuietAroundNow(true)
      const id = await enqueue('owner.orders_waiting', { quiet: false })
      await claim('w')
      await db.query('select public.fail_job($1, $2, $3)', [id, 'w', 'temporary'])
      const wait = await one<number>('extract(epoch from (select run_at - now() from public.jobs where id = $1))::float8', [id])
      expect(wait).toBeLessThan(60) // the normal 30-second pause
    })
  })

  // ============================================================================================================
  describe('tidying up', () => {
    it('removes old finished jobs but keeps recent ones and anything still waiting', async () => {
      const old = await enqueue('x')
      const recent = await enqueue('x')
      const waiting = await enqueue('x')
      const oldDead = await enqueue('x')
      const recentDead = await enqueue('x')
      await db.query(`update public.jobs set status = 'succeeded', finished_at = now() - interval '8 days' where id = $1`, [old])
      await db.query(`update public.jobs set status = 'succeeded', finished_at = now() - interval '1 day' where id = $1`, [recent])
      await db.query(`update public.jobs set status = 'dead', finished_at = now() - interval '31 days' where id = $1`, [oldDead])
      await db.query(`update public.jobs set status = 'dead', finished_at = now() - interval '10 days' where id = $1`, [recentDead])
      expect(await one<number>('public.purge_finished_jobs()')).toBe(2)
      const left = (await q<{ id: string }>('select id from public.jobs order by id')).map((r) => Number(r.id))
      expect(left).toEqual([recent, waiting, recentDead].map(Number).sort((a, b) => a - b))
    })
  })

  // ============================================================================================================
  describe('planning cart and "we miss you" reminders (using the live candidate functions)', () => {
    const plan = () => one<Record<string, unknown>>('public.plan_customer_reminders()')
    const customerJobs = () => q<{ payload: Record<string, any>; quiet_aware: boolean; dedupe_key: string }>(`select payload, quiet_aware, dedupe_key from public.jobs where kind = 'push.customer' order by id`)

    it('queues a first reminder for a cart left for more than 4 hours, once only', async () => {
      const u = await user()
      await cart(u, 5)
      expect(await plan()).toMatchObject({ cart_1: 1, cart_2: 0, inactive: 0 })
      const [j] = await customerJobs()
      expect(j.payload).toMatchObject({ user_id: u, kind: 'cart_1', stage: 1, item_count: 1, first_item: 'Denim Jacket', has_last_one: false })
      expect(j.quiet_aware).toBe(true)
      expect(await plan()).toMatchObject({ cart_1: 0 }) // planning again adds nothing
      expect(await customerJobs()).toHaveLength(1)
    })

    it('says when the customer is down to the last one of something', async () => {
      const u = await user()
      await cart(u, 5, 1)
      await plan()
      expect((await customerJobs())[0].payload.has_last_one).toBe(true)
    })

    it('leaves out a recent cart, an unsubscribed customer, an opted-out one, and sold-out items', async () => {
      const fresh = await user(); await cart(fresh, 1)
      const noDevice = await user({ device: false }); await cart(noDevice, 5)
      const optedOut = await user({ optOut: true }); await cart(optedOut, 5)
      const soldOut = await user(); await cart(soldOut, 5, 0)
      expect(await plan()).toMatchObject({ cart_1: 0 })
    })

    it('queues the second reminder a day after the first, for the same cart', async () => {
      const u = await user()
      await cart(u, 30)
      await db.query(`insert into public.push_log (user_id, kind, ref, sent_at) values ($1, 'cart_1', 'x', now() - interval '25 hours')`, [u])
      expect(await plan()).toMatchObject({ cart_1: 0, cart_2: 1 })
      expect((await customerJobs())[0].payload).toMatchObject({ kind: 'cart_2', stage: 2 })
    })

    it('nudges a customer who has been away 10+ days, but not if they got another message today', async () => {
      const away = await user({ lastSeen: new Date(Date.now() - 12 * 86_400_000).toISOString() })
      const busy = await user({ lastSeen: new Date(Date.now() - 12 * 86_400_000).toISOString() })
      await db.query(`insert into public.push_log (user_id, kind, ref) values ($1, 'promo', 'p1')`, [busy])
      expect(await plan()).toMatchObject({ inactive: 1 })
      expect((await customerJobs())[0].payload).toMatchObject({ user_id: away, kind: 'inactive' })
    })

    it('plans nothing at night', async () => {
      const u = await user()
      await cart(u, 5)
      await setQuietAroundNow(true)
      expect(await plan()).toEqual({ skipped: 'quiet hours' })
      expect(await customerJobs()).toHaveLength(0)
    })

    it('respects the switches in push settings', async () => {
      const u = await user()
      await cart(u, 5)
      await db.query('update public.push_settings set cart_enabled = false, inactive_enabled = false where id = 1')
      expect(await plan()).toMatchObject({ cart_1: 0, cart_2: 0, inactive: 0 })
    })
  })

  // ============================================================================================================
  describe('planning promotions', () => {
    const promo = async (over: { scheduledMinutesAgo?: number; url?: string } = {}) =>
      one<string>(
        `(insert into public.promo_messages (title, body, url, scheduled_for) values ('Sale', 'Half price', $1, now() - make_interval(mins => $2)) returning id)`,
        [over.url ?? '/shop', over.scheduledMinutesAgo ?? 1]
      ).catch(async () => (await q<{ id: string }>(`insert into public.promo_messages (title, body, url, scheduled_for) values ('Sale', 'Half price', $1, now() - make_interval(mins => $2)) returning id`, [over.url ?? '/shop', over.scheduledMinutesAgo ?? 1]))[0].id)
    const makePromo = async (over: { minutes?: number; url?: string } = {}) =>
      (await q<{ id: string }>(
        `insert into public.promo_messages (title, body, url, scheduled_for) values ('Sale', 'Half price', $1, now() + make_interval(mins => $2)) returning id`,
        [over.url ?? '/shop', over.minutes ?? -1]
      ))[0].id
    const promoRow = async (id: string) => (await q<Record<string, any>>('select * from public.promo_messages where id = $1', [id]))[0]
    void promo

    it('queues one send per eligible customer, skipping those at their weekly limit or opted out', async () => {
      const ok = await user()
      const capped = await user()
      await user({ optOut: true })
      for (const ref of ['a', 'b']) await db.query(`insert into public.push_log (user_id, kind, ref, sent_at) values ($1, 'promo', $2, now() - interval '2 days')`, [capped, ref])
      const id = await makePromo()

      expect(await one<Record<string, unknown>>('public.plan_due_promos()')).toMatchObject({ started: 1 })
      const sends = await q<{ payload: Record<string, any> }>(`select payload from public.jobs where kind = 'push.customer'`)
      expect(sends).toHaveLength(1)
      expect(sends[0].payload).toMatchObject({ user_id: ok, kind: 'promo', ref: id, title: 'Sale', body: 'Half price', url: '/shop' })
      expect(await promoRow(id)).toMatchObject({ status: 'sending', skipped_cap: 1 })
    })

    it('leaves a promotion that is not due yet alone', async () => {
      await user()
      const id = await makePromo({ minutes: 60 })
      await db.query('select public.plan_due_promos()')
      expect((await promoRow(id)).status).toBe('scheduled')
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(0)
    })

    it('only follows links inside the store', async () => {
      await user()
      await makePromo({ url: 'https://evil.example/phish' })
      await db.query('select public.plan_due_promos()')
      expect((await q<{ payload: Record<string, any> }>('select payload from public.jobs'))[0].payload.url).toBe('/')
    })

    it('never starts the same promotion twice', async () => {
      await user()
      const id = await makePromo()
      await db.query('select public.plan_due_promos()')
      await db.query('select public.plan_due_promos()')
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(1)
      expect(await one<unknown>('public.plan_promo($1)', [id])).toMatchObject({ queued: 0, note: 'not scheduled' })
    })

    it('marks the promotion sent, with how many received it, only once every send has finished', async () => {
      const a = await user()
      const b = await user()
      const id = await makePromo()
      await db.query('select public.plan_due_promos()')

      // Both sends are still open: the promotion stays "sending".
      await db.query('select public.plan_due_promos()')
      expect((await promoRow(id)).status).toBe('sending')

      // Workers deliver to A (recorded in push_log) and B's send gives up (dead).
      const jobs = await claim('w', 10)
      expect(jobs).toHaveLength(2)
      await db.query(`insert into public.push_log (user_id, kind, ref) values ($1, 'promo', $2)`, [a, id])
      for (const j of jobs) {
        const payload = (await job(j.id)).payload
        if (payload.user_id === a) await db.query('select public.complete_job($1, $2, $3::jsonb)', [j.id, 'w', '{"delivered":1}'])
        else await db.query('select public.fail_job($1, $2, $3, true)', [j.id, 'w', 'no device accepted it'])
      }
      void b

      await db.query('select public.plan_due_promos()')
      expect(await promoRow(id)).toMatchObject({ status: 'sent', recipients: 1 })
    })

    it('closes a promotion nobody could receive instead of leaving it "sending" forever', async () => {
      const id = await makePromo()
      await db.query('select public.plan_due_promos()')
      await db.query('select public.plan_due_promos()')
      expect(await promoRow(id)).toMatchObject({ status: 'sent', recipients: 0 })
    })
  })

  // ============================================================================================================
  describe('planning the owner’s "orders are waiting" reminder', () => {
    const order = async (minutesAgo: number, over: { reminded?: boolean; status?: string } = {}) =>
      (await q<{ id: string }>(
        `insert into public.orders (status, created_at, admin_reminded_at) values ($1, now() - make_interval(mins => $2), $3) returning id`,
        [over.status ?? 'placed', minutesAgo, over.reminded ? new Date().toISOString() : null]
      ))[0].id
    const plan = () => one<Record<string, unknown>>('public.plan_owner_order_reminder()')

    it('queues one urgent job listing every order that has waited long enough', async () => {
      const waiting1 = await order(25)
      const waiting2 = await order(40)
      await order(5) // too recent
      await order(25, { reminded: true }) // already reminded
      await order(25, { status: 'confirmed' })
      await order(13 * 60) // too old to dig up
      expect(await plan()).toMatchObject({ waiting: 2, queued: true })
      const [j] = await q<{ payload: { order_ids: string[] }; priority: number; kind: string }>('select * from public.jobs')
      expect(j.kind).toBe('owner.orders_waiting')
      expect(j.priority).toBe(10)
      expect([...j.payload.order_ids].sort()).toEqual([waiting1, waiting2].sort())
    })

    it('does not queue a second reminder while one is still open', async () => {
      await order(25)
      await plan()
      await order(30)
      expect(await plan()).toMatchObject({ note: 'a reminder is already queued' })
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(1)
    })

    it('does nothing when there is nothing waiting, or the reminder is switched off', async () => {
      expect(await plan()).toEqual({ waiting: 0 })
      await order(25)
      await db.query('update public.push_settings set confirm_enabled = false where id = 1')
      expect(await plan()).toEqual({ waiting: 0 })
    })

    it('goes ahead of customer reminders in the queue', async () => {
      await enqueue('push.customer')
      await order(25)
      await plan()
      const [first] = await claim('w', 1)
      expect(first.kind).toBe('owner.orders_waiting')
    })
  })

  // ============================================================================================================
  describe('the switch', () => {
    it('does nothing at all until queue_enabled is on', async () => {
      const u = await user()
      await cart(u, 5)
      await db.query('update public.push_settings set queue_enabled = false where id = 1')
      expect(await one('public.plan_all()')).toEqual({ enabled: false })
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(0)
    })

    it('plans everything when it is on, and is safe to run repeatedly', async () => {
      const u = await user()
      await cart(u, 5)
      const first = await one<Record<string, any>>('public.plan_all()')
      expect(first).toMatchObject({ enabled: true, customers: { cart_1: 1 } })
      expect(Object.keys(first)).toEqual(expect.arrayContaining(['reaped', 'owner', 'promos', 'customers', 'purged']))
      await db.query('select public.plan_all()')
      await db.query('select public.plan_all()')
      expect(await one<number>('(select count(*)::int from public.jobs)')).toBe(1)
    })
  })

  // ============================================================================================================
  describe('is a waiting reminder still worth sending?', () => {
    const stale = (payload: object) => one<boolean>(`public.job_is_stale('push.customer', $1::jsonb)`, [JSON.stringify(payload)])
    const cartPayload = async (userId: string) => {
      // Built in SQL, exactly as the planner does it, so the microseconds survive.
      const { rows } = await db.query(`select (to_jsonb(last_change) #>> '{}') as ref from public.push_cart_candidates(1) where user_id = $1`, [userId])
      return { user_id: userId, kind: 'cart_1', stage: 1, ref: rows[0].ref as string }
    }

    it('is still good when nothing has changed', async () => {
      const u = await user()
      await cart(u, 5)
      expect(await stale(await cartPayload(u))).toBe(false)
    })

    it('is stale once the cart changes, is emptied, or an order is placed', async () => {
      const u = await user()
      await cart(u, 5)
      const payload = await cartPayload(u)

      await db.query(`update public.cart_items set updated_at = now() where user_id = $1`, [u])
      expect(await stale(payload)).toBe(true) // the cart changed since

      await db.query(`update public.cart_items set updated_at = $2 where user_id = $1`, [u, payload.ref])
      expect(await stale(payload)).toBe(false)
      await db.query(`insert into public.orders (user_id, status, created_at) values ($1, 'placed', now())`, [u])
      expect(await stale(payload)).toBe(true) // they checked out

      await db.query('delete from public.orders')
      await db.query('delete from public.cart_items')
      expect(await stale(payload)).toBe(true) // empty cart
    })

    it('judges a job exactly as the planner wrote it as fresh (the reference survives the round trip)', async () => {
      const u = await user()
      await cart(u, 5)
      await db.query('select public.plan_customer_reminders()')
      const [{ payload }] = await q<{ payload: object }>(`select payload from public.jobs where kind = 'push.customer'`)
      expect(await stale(payload)).toBe(false)
    })

    it('is stale if the customer has since switched off offers and reminders', async () => {
      const u = await user()
      await cart(u, 5)
      const payload = await cartPayload(u)
      await db.query(`insert into public.push_preferences (user_id, marketing) values ($1, false)`, [u])
      expect(await stale(payload)).toBe(true)
    })

    it('"we miss you" is stale once the customer comes back', async () => {
      const lastSeen = new Date(Date.now() - 12 * 86_400_000).toISOString()
      const u = await user({ lastSeen })
      const payload = { user_id: u, kind: 'inactive', ref: lastSeen }
      expect(await stale(payload)).toBe(false)
      await db.query(`update public.profiles set last_seen_at = now() where id = $1`, [u])
      expect(await stale(payload)).toBe(true)
    })

    it('a promotion send is stale once the promotion is no longer being sent', async () => {
      const u = await user()
      const [{ id }] = await q<{ id: string }>(`insert into public.promo_messages (title, body, scheduled_for, status) values ('s', 'b', now(), 'sending') returning id`)
      const payload = { user_id: u, kind: 'promo', ref: id }
      expect(await stale(payload)).toBe(false)
      await db.query(`update public.promo_messages set status = 'sent' where id = $1`, [id])
      expect(await stale(payload)).toBe(true)
    })

    it('never calls other kinds of job stale', async () => {
      expect(await one<boolean>(`public.job_is_stale('owner.orders_waiting', '{}'::jsonb)`)).toBe(false)
    })
  })

  // ============================================================================================================
  describe('who may do what', () => {
    const asAdmin = async () => {
      const id = await user({ admin: true, device: false })
      await db.query(`select set_config('test.uid', $1, false)`, [id])
      return id
    }
    const asCustomer = async () => {
      const id = await user({ device: false })
      await db.query(`select set_config('test.uid', $1, false)`, [id])
      return id
    }

    it('keeps the queue away from browsers: anonymous and logged-in customers cannot claim jobs or read the table', async () => {
      await enqueue('x')
      for (const role of ['anon', 'authenticated']) {
        await db.query(`set role ${role}`)
        await expect(db.query(`select * from public.claim_jobs('hacker')`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select * from public.jobs`)).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.plan_all()`)).rejects.toThrow(/permission denied/)
        await db.query('reset role')
      }
    })

    it('lets the server’s own key run the queue', async () => {
      await enqueue('x')
      await db.query('set role service_role')
      const { rows } = await db.query(`select * from public.claim_jobs('worker')`)
      expect(rows).toHaveLength(1)
    })

    it('refuses the owner’s tools to anyone who is not the owner', async () => {
      await asCustomer()
      await db.query('set role authenticated')
      for (const sql of ['select public.admin_job_overview()', 'select public.admin_requeue_job(1)', 'select public.admin_cancel_job(1)', `select public.admin_send_promo_now(gen_random_uuid())`]) {
        await expect(db.query(sql), sql).rejects.toThrow(/NOT_ADMIN/)
      }
    })

    it('gives the owner a health summary with dead jobs and their reasons', async () => {
      await asAdmin()
      const id = await enqueue('push.customer', { payload: { kind: 'cart_1' }, max: 1 })
      await enqueue('push.customer')
      await claim('w', 1)
      await db.query('select public.fail_job($1, $2, $3)', [id, 'w', 'push service said 401'])
      await db.query('set role authenticated')
      const overview = await one<any>('public.admin_job_overview()')
      expect(overview.enabled).toBe(true)
      expect(overview.counts).toEqual(
        expect.arrayContaining([{ kind: 'push.customer', status: 'dead', n: 1 }, { kind: 'push.customer', status: 'queued', n: 1 }])
      )
      expect(overview.dead[0]).toMatchObject({ id: Number(id), last_error: 'push service said 401', sub_kind: 'cart_1', attempts: 1 })
      expect(overview.oldest_waiting_seconds).toBeGreaterThanOrEqual(0)
    })

    it('lets the owner give a dead job another go, or cancel a waiting one', async () => {
      await asAdmin()
      const dead = await enqueue('x', { max: 1 })
      await claim('w', 1)
      await db.query('select public.fail_job($1, $2, $3)', [dead, 'w', 'boom'])
      const waiting = await enqueue('x', { runAt: new Date(Date.now() + 3_600_000).toISOString() })
      await db.query('set role authenticated')

      expect(await one('public.admin_requeue_job($1)', [dead])).toBe(true)
      expect(await one('public.admin_requeue_job($1)', [dead])).toBe(false) // it is not dead any more
      expect(await one('public.admin_cancel_job($1)', [waiting])).toBe(true)

      await db.query('reset role')
      expect(await job(dead!)).toMatchObject({ status: 'queued', attempts: 0, last_error: null })
      expect((await job(waiting!)).status).toBe('cancelled')
    })

    it('sends a scheduled promotion now, but only when the queue is on', async () => {
      await user()
      const [{ id }] = await q<{ id: string }>(`insert into public.promo_messages (title, body, scheduled_for) values ('Flash', 'sale', now() + interval '3 hours') returning id`)
      await asAdmin()
      await db.query('set role authenticated')

      expect(await one<any>('public.admin_send_promo_now($1)', [id])).toMatchObject({ queued: 1, skipped_cap: 0 })

      await db.query('reset role')
      expect((await q<{ status: string }>('select status from public.promo_messages where id = $1', [id]))[0].status).toBe('sending')
      const [{ id: second }] = await q<{ id: string }>(`insert into public.promo_messages (title, body, scheduled_for) values ('Later', 'x', now() + interval '3 hours') returning id`)
      await db.query('update public.push_settings set queue_enabled = false where id = 1')
      await db.query('set role authenticated')
      await expect(db.query('select public.admin_send_promo_now($1)', [second])).rejects.toThrow(/QUEUE_DISABLED/)
    })
  })
})
