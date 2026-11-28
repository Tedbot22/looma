// Does the job queue work on top of the REAL production schema?
//
// The other database tests use a small hand-made copy of the tables. This one runs against the actual baseline
// (supabase/migrations/20261126102513_remote_schema.sql) plus every migration after it, so a change that would
// break against production fails here first. CI builds that database (see the "production-schema" job).
//
// Set PRODUCTION_SCHEMA_URL to such a database. Without it these tests are skipped.

import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.PRODUCTION_SCHEMA_URL
const suite = url ? describe : describe.skip

suite('job queue on the production schema', () => {
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

  const clean = async () => {
    await db.query('reset role')
    await db.query(`truncate public.jobs, public.push_log, public.promo_messages, public.customer_push_subscriptions restart identity cascade`)
    await db.query(`delete from public.profiles where full_name like 'prodtest-%'`)
    await db.query(`delete from auth.users where email like 'prodtest-%'`)
  }
  beforeEach(async () => {
    await clean()
    // The app keeps one settings row; the baseline has structure only. Quiet hours are pinned away from "now".
    await db.query(`insert into public.push_settings (id) values (1) on conflict (id) do nothing`)
    await db.query(
      `update public.push_settings set queue_enabled = true,
         quiet_start_hour = (7 + extract(hour from now() at time zone 'Africa/Lagos')::int) % 24,
         quiet_end_hour   = (9 + extract(hour from now() at time zone 'Africa/Lagos')::int) % 24 where id = 1`
    )
  })
  afterAll(async () => {
    await clean()
  })

  // A customer made the way Supabase makes them: a login row, from which the app's own trigger creates the profile.
  const customer = async (n: number) => {
    const [{ id }] = await q<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`prodtest-${n}@example.com`])
    await db.query(`update public.profiles set full_name = $2, last_seen_at = now() where id = $1`, [id, `prodtest-${n}`])
    await db.query(`insert into public.customer_push_subscriptions (user_id, endpoint, subscription) values ($1, $2, $3)`, [id, `https://push/${id}`, JSON.stringify({ endpoint: `https://push/${id}` })])
    return id
  }

  it('has everything the queue relies on, with the shapes it expects', async () => {
    const needed: [string, string[]][] = [
      ['push_settings', ['cart_enabled', 'cart_first_hours', 'cart_second_hours', 'confirm_enabled', 'confirm_after_min', 'inactive_enabled', 'inactive_after_days', 'promo_weekly_cap', 'quiet_start_hour', 'quiet_end_hour', 'queue_enabled']],
      ['promo_messages', ['title', 'body', 'url', 'scheduled_for', 'status', 'started_at', 'sent_at', 'recipients', 'skipped_cap']],
      ['push_log', ['user_id', 'kind', 'ref', 'sent_at']],
      ['orders', ['admin_reminded_at', 'status', 'created_at', 'order_number', 'total', 'payment_method', 'user_id']],
      ['customer_push_subscriptions', ['user_id', 'endpoint', 'subscription']],
      ['device_tokens', ['user_id', 'token']],
      ['push_preferences', ['user_id', 'marketing']],
      ['cart_items', ['user_id', 'variant_id', 'updated_at']],
      ['profiles', ['last_seen_at', 'full_name', 'is_admin']],
      ['jobs', ['kind', 'payload', 'dedupe_key', 'status', 'run_at', 'attempts', 'max_attempts', 'lease_until']],
    ]
    for (const [table, columns] of needed) {
      const have = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table])).map((r) => r.column_name)
      expect(columns.filter((c) => !have.includes(c)), `${table} is missing columns`).toEqual([])
    }
    const shape = async (fn: string) => (await q<{ r: string }>(`select pg_get_function_result(p.oid) as r from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]))[0]?.r
    expect(await shape('push_cart_candidates')).toBe('TABLE(user_id uuid, last_change timestamp with time zone, item_count integer, first_item text, has_last_one boolean)')
    expect(await shape('push_inactive_candidates')).toBe('TABLE(user_id uuid, last_active timestamp with time zone, new_items integer)')
    expect(await shape('push_promo_audience')).toBe('TABLE(user_id uuid, over_cap boolean)')
    // "Already sent" is enforced by a unique key on (user_id, kind, ref): a constraint or a unique index both count.
    expect(
      await val<boolean>(`exists (
        select 1 from pg_index i
         where i.indrelid = 'public.push_log'::regclass and i.indisunique
           and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
                 where a.attrelid = i.indrelid and a.attnum = any (i.indkey)) = array['kind', 'ref', 'user_id'])`)
    ).toBe(true)
  })

  it('plans, hands out and completes a promotion on the real tables, and never plans it twice', async () => {
    const a = await customer(1)
    await customer(2)
    await db.query(`insert into public.promo_messages (title, body, url, scheduled_for) values ('Flash sale', 'Half price today', '/shop', now() - interval '1 minute')`)

    expect(await val<any>('public.plan_all()')).toMatchObject({ enabled: true, promos: { started: 1 } })
    expect(await val<number>(`(select count(*)::int from public.jobs where kind = 'push.customer' and payload ->> 'kind' = 'promo')`)).toBe(2)
    await db.query('select public.plan_all()')
    expect(await val<number>('(select count(*)::int from public.jobs)')).toBe(2) // nothing doubled

    const claimed = await q<{ id: string; payload: Record<string, any> }>(`select * from public.claim_jobs('prod-test', null, 10, 60)`)
    expect(claimed).toHaveLength(2)
    expect(await val<boolean>('public.job_is_stale($1, $2::jsonb)', ['push.customer', JSON.stringify(claimed.find((c) => c.payload.user_id === a)!.payload)])).toBe(false)
    for (const job of claimed) await db.query(`select public.complete_job($1, 'prod-test', '{"delivered":1}'::jsonb)`, [job.id])
    for (const job of claimed) await db.query(`insert into public.push_log (user_id, kind, ref) values ($1, 'promo', $2)`, [job.payload.user_id, job.payload.ref])

    await db.query('select public.plan_all()')
    expect((await q('select status, recipients from public.promo_messages'))[0]).toEqual({ status: 'sent', recipients: 2 })
  })

  it('does nothing while the queue is switched off', async () => {
    await customer(1)
    await db.query(`insert into public.promo_messages (title, body, scheduled_for) values ('x', 'y', now() - interval '1 minute')`)
    await db.query('update public.push_settings set queue_enabled = false where id = 1')
    expect(await val('public.plan_all()')).toEqual({ enabled: false })
    expect(await val<number>('(select count(*)::int from public.jobs)')).toBe(0)
  })

  it('keeps the queue away from browsers (anonymous and logged-in customers)', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.query(`set role ${role}`)
      await expect(db.query(`select * from public.claim_jobs('hacker')`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`select * from public.jobs`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`select public.plan_all()`)).rejects.toThrow(/permission denied/)
      await db.query('reset role')
    }
  })

  it('refuses the owner’s queue tools to a customer', async () => {
    const id = await customer(1)
    await db.query(`select set_config('test.uid', $1, false)`, [id])
    await db.query('set role authenticated')
    await expect(db.query('select public.admin_job_overview()')).rejects.toThrow(/NOT_ADMIN/)
    await expect(db.query('select public.admin_requeue_job(1)')).rejects.toThrow(/NOT_ADMIN/)
    await db.query('reset role')
    await db.query(`select set_config('test.uid', '', false)`)
  })
})
