// End to end: the real planner (SQL) -> the real queue (SQL) -> the real runner and reminder handlers (TypeScript)
// -> a pretend push service. Only the network is faked. The adapter below calls the SQL functions with the same
// parameter names the edge function uses, so a mismatch between the two sides fails here.
//
// Needs DATABASE_URL, like jobQueue.db.test.ts.

import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runJobs, type Job, type QueuePort } from '../functions/_shared/jobRunner.ts'
import { createPushHandlers, type PushDb, type PushPayload } from '../functions/_shared/pushJobs.ts'

const url = process.env.DATABASE_URL
const suite = url ? describe : describe.skip

suite('reminder pipeline (database + worker)', () => {
  let db: pg.Client
  const q = async <T = Record<string, any>>(text: string, values: unknown[] = []) => (await db.query(text, values)).rows as T[]
  const val = async <T = unknown>(text: string, values: unknown[] = []) => (await q<{ v: T }>(`select (${text}) as v`, values))[0].v

  beforeAll(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
  })
  afterAll(async () => {
    await db.end()
  })

  // ---- the same calls the edge function makes (names and shapes included) ----
  const portFor = (client: pg.Client): QueuePort => ({
    claim: async (worker, limit, lease) => {
      const { rows } = await client.query('select * from public.claim_jobs(p_worker => $1, p_kinds => null, p_limit => $2, p_lease_seconds => $3)', [worker, limit, lease])
      return rows.map((r): Job => ({ id: Number(r.id), kind: r.kind, payload: r.payload, attempts: r.attempts, max_attempts: r.max_attempts }))
    },
    complete: async (id, worker, result) =>
      (await client.query('select public.complete_job(p_id => $1, p_worker => $2, p_result => $3::jsonb) as v', [id, worker, result === null ? null : JSON.stringify(result)])).rows[0].v === true,
    fail: async (id, worker, error, permanent) =>
      (await client.query('select public.fail_job(p_id => $1, p_worker => $2, p_error => $3, p_permanent => $4) as v', [id, worker, error, permanent])).rows[0].v,
    defer: async (id, worker, until, reason) =>
      (await client.query('select public.defer_job(p_id => $1, p_worker => $2, p_run_at => $3, p_reason => $4) as v', [id, worker, until.toISOString(), reason])).rows[0].v === true,
  })

  const pushDbFor = (client: pg.Client): PushDb => ({
    isStale: async (kind, payload) =>
      (await client.query('select public.job_is_stale(p_kind => $1, p_payload => $2::jsonb) as v', [kind, JSON.stringify(payload)])).rows[0].v === true,
    subscriptionsFor: async (userId) => (await client.query('select id, subscription from public.customer_push_subscriptions where user_id = $1', [userId])).rows,
    deleteSubscription: async (id) => void (await client.query('delete from public.customer_push_subscriptions where id = $1', [id])),
    logSent: async (userId, kind, ref) =>
      void (await client.query('insert into public.push_log (user_id, kind, ref) values ($1, $2, $3) on conflict (user_id, kind, ref) do nothing', [userId, kind, ref])),
    ownerDevices: async () => (await client.query('select id, token from public.device_tokens')).rows,
    deleteOwnerDevice: async (id) => void (await client.query('delete from public.device_tokens where id = $1', [id])),
    waitingOrders: async (ids) =>
      (await client.query(`select id, order_number, total::float8 as total, payment_method, user_id, created_at::text as created_at
                             from public.orders where id = any($1::uuid[]) and status = 'placed' and admin_reminded_at is null`, [ids])).rows,
    customerNames: async (ids) =>
      Object.fromEntries((await client.query('select id, full_name from public.profiles where id = any($1::uuid[])', [ids])).rows.map((r) => [r.id, r.full_name])),
    markOrdersReminded: async (ids) => void (await client.query('update public.orders set admin_reminded_at = now() where id = any($1::uuid[])', [ids])),
  })

  // A pretend push service. `failures` maps an endpoint to what it should throw.
  type Sent = { endpoint: string; payload: PushPayload }
  const makeService = (failures: Record<string, unknown> = {}) => {
    const sent: Sent[] = []
    const failuresLeft = { ...failures }
    return {
      sent,
      failuresLeft,
      send: async (subscription: unknown, payload: PushPayload) => {
        const endpoint = (subscription as { endpoint: string }).endpoint
        if (endpoint in failuresLeft) throw failuresLeft[endpoint]
        sent.push({ endpoint, payload })
      },
    }
  }

  const runOnce = async (service: ReturnType<typeof makeService>, over: { client?: pg.Client; worker?: string; maxJobs?: number } = {}) => {
    const client = over.client ?? db
    return runJobs({
      worker: over.worker ?? 'test-worker',
      queue: portFor(client),
      handlers: createPushHandlers({ db: pushDbFor(client), send: service.send, siteUrl: 'https://looma.example', sendEmail: async () => false }),
      deadline: Date.now() + 30_000,
      maxJobs: over.maxJobs,
    })
  }
  const plan = () => val<Record<string, any>>('public.plan_all()')
  const jobs = (where = 'true') => q<Record<string, any>>(`select * from public.jobs where ${where} order by id`)
  const pushLog = () => q<{ user_id: string; kind: string }>('select user_id, kind from public.push_log order by id')

  beforeEach(async () => {
    await db.query(
      `truncate public.jobs, public.push_log, public.promo_messages, public.cart_items, public.orders,
                public.customer_push_subscriptions, public.device_tokens, public.push_preferences,
                public.product_variants, public.products, public.profiles restart identity cascade`
    )
    await db.query(
      `update public.push_settings set cart_enabled = true, cart_first_hours = 4, cart_second_hours = 24, confirm_enabled = true,
              confirm_after_min = 20, inactive_enabled = true, inactive_after_days = 10, promo_weekly_cap = 2, queue_enabled = true,
              quiet_start_hour = (7 + extract(hour from now() at time zone 'Africa/Lagos')::int) % 24,
              quiet_end_hour = (9 + extract(hour from now() at time zone 'Africa/Lagos')::int) % 24 where id = 1`
    )
  })

  const customer = async (over: { device?: boolean } = {}) => {
    const [{ id }] = await q<{ id: string }>(`insert into public.profiles (full_name, last_seen_at) values ('Ada', now()) returning id`)
    if (over.device !== false) {
      await db.query(`insert into public.customer_push_subscriptions (user_id, endpoint, subscription) values ($1, $2, $3)`, [id, `https://push/${id}`, JSON.stringify({ endpoint: `https://push/${id}` })])
    }
    return id
  }
  const addCart = async (userId: string, hoursAgo = 5) => {
    const [{ id: p }] = await q<{ id: string }>(`insert into public.products (name) values ('Denim Jacket') returning id`)
    const [{ id: v }] = await q<{ id: string }>(`insert into public.product_variants (product_id, stock) values ($1, 3) returning id`, [p])
    await db.query(`insert into public.cart_items (user_id, variant_id, created_at, updated_at) values ($1, $2, now() - make_interval(hours => $3), now() - make_interval(hours => $3))`, [userId, v, hoursAgo])
  }
  const backInTime = (id: number | string) => db.query('update public.jobs set run_at = now() where id = $1', [id]) // skip a retry pause

  // ============================================================================================================
  it('sends an abandoned-cart reminder once, records it, and never plans it again', async () => {
    const u = await customer()
    await addCart(u)
    const service = makeService()

    await plan()
    const summary = await runOnce(service)

    expect(summary).toMatchObject({ claimed: 1, done: 1, stoppedBecause: 'empty' })
    expect(service.sent).toHaveLength(1)
    expect(service.sent[0].payload).toMatchObject({ title: 'Still thinking it over?', body: expect.stringContaining('Denim Jacket'), tag: 'cart-reminder', url: '/cart' })
    expect(await jobs()).toMatchObject([{ status: 'succeeded', result: { delivered: 1 }, attempts: 1 }])
    expect(await pushLog()).toEqual([{ user_id: u, kind: 'cart_1' }])

    await plan() // the candidate no longer qualifies (push_log) and the job key is taken
    expect(await runOnce(service)).toMatchObject({ claimed: 0 })
    expect(service.sent).toHaveLength(1)
  })

  it('retries after a passing push-service failure, then succeeds, sending exactly one reminder', async () => {
    const u = await customer()
    await addCart(u)
    const service = makeService({ [`https://push/${u}`]: { statusCode: 503, body: 'Service Unavailable' } })

    await plan()
    expect(await runOnce(service)).toMatchObject({ claimed: 1, retried: 1 })
    const [afterFail] = await jobs()
    expect(afterFail).toMatchObject({ status: 'queued', attempts: 1, last_error: 'Push rejected: 503: Service Unavailable' })
    expect(await runOnce(service)).toMatchObject({ claimed: 0 }) // still inside the pause
    expect(await pushLog()).toEqual([])

    delete service.failuresLeft[`https://push/${u}`] // the push service recovers
    await backInTime(afterFail.id)
    expect(await runOnce(service)).toMatchObject({ claimed: 1, done: 1 })
    expect(await jobs()).toMatchObject([{ status: 'succeeded', attempts: 2, last_error: null }])
    expect(service.sent).toHaveLength(1)
    expect(await pushLog()).toEqual([{ user_id: u, kind: 'cart_1' }])
  })

  it('gives up after the last attempt, keeps the reason, and is not planned again, until the owner requeues it', async () => {
    const u = await customer()
    await addCart(u)
    const service = makeService({ [`https://push/${u}`]: { statusCode: 401, body: 'VAPID key mismatch' } })

    await plan()
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await runOnce(service)).toMatchObject({ claimed: 1 })
      const [j] = await jobs()
      if (attempt < 5) await backInTime(j.id)
    }
    const [dead] = await jobs()
    expect(dead).toMatchObject({ status: 'dead', attempts: 5, last_error: 'Push rejected: 401: VAPID key mismatch' })

    await plan() // the customer is still a candidate, but the dead job holds the key: no endless re-planning
    expect(await jobs()).toHaveLength(1)
    expect(await runOnce(service)).toMatchObject({ claimed: 0 })

    // The owner fixes the VAPID secret and gives it another go.
    delete service.failuresLeft[`https://push/${u}`]
    await db.query(`update public.jobs set status = 'queued', attempts = 0, run_at = now(), finished_at = null where id = $1`, [dead.id])
    expect(await runOnce(service)).toMatchObject({ done: 1 })
    expect(service.sent).toHaveLength(1)
  })

  it('does not send a reminder to a customer who checked out while it waited', async () => {
    const u = await customer()
    await addCart(u)
    const service = makeService()
    await plan()
    await db.query(`insert into public.orders (user_id, status, created_at) values ($1, 'placed', now())`, [u]) // they ordered
    expect(await runOnce(service)).toMatchObject({ claimed: 1, done: 1 })
    expect(service.sent).toHaveLength(0)
    expect(await jobs()).toMatchObject([{ status: 'succeeded', result: { skipped: 'stale' } }])
    expect(await pushLog()).toEqual([])
  })

  it('forgets a device that has unsubscribed, without retrying', async () => {
    const u = await customer()
    await addCart(u)
    const service = makeService({ [`https://push/${u}`]: { statusCode: 410, body: 'Gone' } })
    await plan()
    expect(await runOnce(service)).toMatchObject({ done: 1, retried: 0 })
    expect(await val<number>('(select count(*)::int from public.customer_push_subscriptions)')).toBe(0)
    expect(await jobs()).toMatchObject([{ status: 'succeeded', result: { skipped: 'devices_gone', gone: 1 } }])
  })

  it('sends a promotion to everyone eligible and then closes it with the real count', async () => {
    const a = await customer()
    const b = await customer()
    const c = await customer()
    await db.query(`insert into public.promo_messages (title, body, url, scheduled_for) values ('Flash sale', 'Half price today', '/shop', now() - interval '1 minute')`)
    const service = makeService({ [`https://push/${c}`]: { statusCode: 410 } }) // c has unsubscribed

    await plan()
    expect(await runOnce(service)).toMatchObject({ claimed: 3, done: 3 })
    expect(service.sent.map((s) => s.endpoint).sort()).toEqual([`https://push/${a}`, `https://push/${b}`].sort())
    expect(service.sent[0].payload).toMatchObject({ title: 'Flash sale', body: 'Half price today', url: '/shop' })

    await plan() // nothing is outstanding any more: the promotion closes
    expect((await q('select status, recipients from public.promo_messages'))[0]).toEqual({ status: 'sent', recipients: 2 })
  })

  it('alerts the owner about orders nobody confirmed, then marks them so it does not repeat', async () => {
    const buyer = await customer({ device: false })
    const [{ id: orderId }] = await q<{ id: string }>(`insert into public.orders (user_id, order_number, total, status, created_at) values ($1, 4821, 12500, 'placed', now() - interval '25 minutes') returning id`, [buyer])
    await db.query(`insert into public.device_tokens (user_id, token) values ($1, $2)`, [buyer, JSON.stringify({ endpoint: 'https://push/owner-phone' })])
    const service = makeService()

    await plan()
    expect(await runOnce(service)).toMatchObject({ claimed: 1, done: 1 })
    expect(service.sent[0]).toMatchObject({ endpoint: 'https://push/owner-phone', payload: { title: 'Order #4821 is waiting for you', tag: `order-${orderId}` } })
    expect(service.sent[0].payload.body).toContain('Ada · ₦12,500')
    expect((await q('select admin_reminded_at from public.orders'))[0].admin_reminded_at).not.toBeNull()

    await plan()
    expect(await runOnce(service)).toMatchObject({ claimed: 0 })
    expect(service.sent).toHaveLength(1)
  })

  it('keeps trying to reach the owner if nothing got through, without marking the order', async () => {
    const buyer = await customer({ device: false })
    await db.query(`insert into public.orders (user_id, order_number, total, status, created_at) values ($1, 7, 5000, 'placed', now() - interval '30 minutes')`, [buyer])
    // The owner has no device saved and no email configured.
    await plan()
    expect(await runOnce(makeService())).toMatchObject({ claimed: 1, retried: 1 })
    expect((await jobs())[0]).toMatchObject({ status: 'queued', last_error: 'Nothing reached the owner: no working device and no email.' })
    expect((await q('select admin_reminded_at from public.orders'))[0].admin_reminded_at).toBeNull()
  })

  it('recovers a job whose worker died, and the late worker cannot undo the rescue', async () => {
    const u = await customer()
    await addCart(u)
    await plan()

    // A worker claims the job and then "dies": it never reports back and its lease runs out.
    const deadWorkerClaim = await portFor(db).claim('dead-worker', 5, 120)
    expect(deadWorkerClaim).toHaveLength(1)
    await db.query(`update public.jobs set lease_until = now() - interval '1 second'`)

    const service = makeService()
    expect(await runOnce(service)).toMatchObject({ claimed: 0 }) // reaped, but waiting out its retry pause
    await db.query(`update public.jobs set run_at = now()`)
    expect(await runOnce(service, { worker: 'rescuer' })).toMatchObject({ claimed: 1, done: 1 })
    expect(service.sent).toHaveLength(1)

    // The first worker wakes up and reports "failed": it must be ignored.
    expect(await portFor(db).fail(deadWorkerClaim[0].id, 'dead-worker', 'too late', false)).toBeNull()
    expect(await jobs()).toMatchObject([{ status: 'succeeded' }])
  })

  it('shares work between two workers running at the same moment: every customer gets exactly one message', async () => {
    const people = await Promise.all(Array.from({ length: 60 }, () => customer()))
    await db.query(`insert into public.promo_messages (title, body, url, scheduled_for) values ('Sale', 'x', '/', now() - interval '1 minute')`)
    await plan()
    expect(await val<number>(`(select count(*)::int from public.jobs where status = 'queued')`)).toBe(60)

    const second = new pg.Client({ connectionString: url })
    await second.connect()
    try {
      const service = makeService()
      const [r1, r2] = await Promise.all([runOnce(service, { worker: 'w1' }), runOnce(service, { client: second, worker: 'w2' })])
      expect(r1.claimed + r2.claimed).toBe(60)
      expect(r1.claimed).toBeGreaterThan(0)
      expect(r2.claimed).toBeGreaterThan(0)
      expect(service.sent).toHaveLength(60)
      expect(new Set(service.sent.map((s) => s.endpoint)).size).toBe(60) // nobody got it twice
      expect(await val<number>('(select count(*)::int from public.push_log)')).toBe(60)
      expect(people).toHaveLength(60)
    } finally {
      await second.end()
    }
  })

  it('does nothing while the queue is switched off, so the old scheduler stays in charge', async () => {
    const u = await customer()
    await addCart(u)
    await db.query('update public.push_settings set queue_enabled = false where id = 1')
    expect(await plan()).toEqual({ enabled: false })
    expect(await jobs()).toHaveLength(0)
  })
})
