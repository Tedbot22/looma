-- 20261127000000_job_queue.sql
-- A job queue for reminders and promotions.
--
-- Before: one function (push-scheduler) did everything in a single pass every 5 minutes. A failed reminder was
-- retried only because the customer showed up as a candidate again, with no pause and no limit, and a run
-- that stopped halfway could leave whole groups unsent.
--
-- Now: SQL "planners" turn "who should get a reminder" into one JOB per recipient. Workers claim jobs safely
-- (two workers can never take the same job), send them, and report back. A failure is retried after a growing
-- pause, and a job that keeps failing ends up in a visible "dead" list instead of retrying forever.
--
-- Switched off by default. Nothing changes until you run:
--     update public.push_settings set queue_enabled = true where id = 1;
-- and switching back is the same statement with false.
--
-- Safe to run more than once. Runs after the production baseline (20261126102513_remote_schema.sql).

set search_path = public, extensions;

-- ---------------------------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------------------------
alter table public.push_settings add column if not exists queue_enabled boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. The queue
--
--   queued     waiting for its time (run_at)
--   running    a worker has it and holds a lease until lease_until
--   succeeded  done (the result says what happened, e.g. delivered or skipped)
--   dead       gave up after max_attempts, or failed in a way retrying cannot fix. Look here when
--              something did not arrive: last_error says why.
--   cancelled  taken off the queue by the owner
-- ---------------------------------------------------------------------------------------------
create table if not exists public.jobs (
  id           bigint generated always as identity primary key,
  kind         text        not null,                       -- e.g. 'push.customer', 'owner.orders_waiting'
  payload      jsonb       not null default '{}'::jsonb,
  dedupe_key   text,                                        -- the same key is never queued twice
  status       text        not null default 'queued'
               check (status in ('queued', 'running', 'succeeded', 'dead', 'cancelled')),
  priority     smallint    not null default 0,              -- higher goes first
  run_at       timestamptz not null default now(),
  attempts     integer     not null default 0,
  max_attempts integer     not null default 5 check (max_attempts >= 1),
  quiet_aware  boolean     not null default false,          -- retries wait out the customer quiet hours
  locked_by    text,
  locked_at    timestamptz,
  lease_until  timestamptz,
  last_error   text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz
);

alter table public.jobs enable row level security;   -- no policies: only the server's key and the admin functions below
revoke all on public.jobs from anon, authenticated;

create unique index if not exists jobs_dedupe_key_idx on public.jobs (dedupe_key) where dedupe_key is not null;
create index if not exists jobs_ready_idx   on public.jobs (priority desc, run_at, id) where status = 'queued';
create index if not exists jobs_lease_idx   on public.jobs (lease_until) where status = 'running';
create index if not exists jobs_kind_status_idx on public.jobs (kind, status);
create index if not exists jobs_finished_idx on public.jobs (finished_at) where finished_at is not null;
-- "is any send for this promotion still pending?"
create index if not exists jobs_open_ref_idx on public.jobs ((payload ->> 'ref')) where kind = 'push.customer' and status in ('queued', 'running');

-- ---------------------------------------------------------------------------------------------
-- 3. Time helpers
-- ---------------------------------------------------------------------------------------------

-- How long to wait before attempt number (attempts + 1): 30s, 1m, 2m, 4m, 8m ... never more than an hour.
create or replace function public.job_backoff(p_attempts integer)
returns interval
language sql
immutable
as $$
  select make_interval(secs => least(30 * power(2, greatest(p_attempts, 1) - 1), 3600))
$$;

-- Is this moment inside the customers' quiet hours (Lagos time, set in push_settings)?
create or replace function public.is_quiet_hour(p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when s.quiet_start_hour > s.quiet_end_hour then h >= s.quiet_start_hour or h < s.quiet_end_hour
    else h >= s.quiet_start_hour and h < s.quiet_end_hour
  end
  from public.push_settings s,
       lateral (select extract(hour from p_at at time zone 'Africa/Lagos')::int as h) x
  where s.id = 1
$$;

-- The first moment at or after p_at that is NOT in quiet hours.
create or replace function public.next_send_time(p_at timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  s public.push_settings;
  local_ts timestamp;
  day_start timestamp;
begin
  select * into s from public.push_settings where id = 1;
  if not found or not public.is_quiet_hour(p_at) then
    return p_at;
  end if;
  local_ts  := p_at at time zone 'Africa/Lagos';
  day_start := date_trunc('day', local_ts);
  -- Quiet ends at quiet_end_hour: today if we are past midnight already, otherwise tomorrow.
  if extract(hour from local_ts)::int < s.quiet_end_hour then
    return (day_start + make_interval(hours => s.quiet_end_hour)) at time zone 'Africa/Lagos';
  end if;
  return (day_start + interval '1 day' + make_interval(hours => s.quiet_end_hour)) at time zone 'Africa/Lagos';
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Putting jobs on the queue, taking them off, and reporting back
-- ---------------------------------------------------------------------------------------------

-- Adds a job. Returns its id, or null if a job with the same dedupe_key already exists (which makes planning
-- safe to repeat: the same reminder can never be queued twice).
create or replace function public.enqueue_job(
  p_kind         text,
  p_payload      jsonb       default '{}'::jsonb,
  p_dedupe_key   text        default null,
  p_run_at       timestamptz default now(),
  p_max_attempts integer     default 5,
  p_quiet_aware  boolean     default false,
  p_priority     smallint    default 0
) returns bigint
language sql
as $$
  insert into public.jobs (kind, payload, dedupe_key, run_at, max_attempts, quiet_aware, priority)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, coalesce(p_run_at, now()), p_max_attempts, p_quiet_aware, p_priority)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id
$$;

-- A worker that stopped mid-job (crash, timeout) never reports back. Once its lease runs out the job goes back
-- on the queue, or to "dead" if it has already used all its attempts.
create or replace function public.reap_expired_jobs()
returns integer
language plpgsql
as $$
declare n integer;
begin
  with expired as (
    select id from public.jobs
     where status = 'running' and lease_until < now()
     for update skip locked
  ),
  moved as (
    update public.jobs j
       set status      = case when j.attempts >= j.max_attempts then 'dead' else 'queued' end,
           run_at      = case when j.attempts >= j.max_attempts then j.run_at else now() + public.job_backoff(j.attempts) end,
           finished_at = case when j.attempts >= j.max_attempts then now() end,
           last_error  = 'The worker stopped before finishing this job (its time ran out).',
           locked_by = null, locked_at = null, lease_until = null,
           updated_at = now()
      from expired e
     where j.id = e.id
    returning 1
  )
  select count(*) into n from moved;
  return n;
end $$;

-- A worker asks for up to p_limit jobs that are due. SKIP LOCKED means two workers asking at the same moment
-- get DIFFERENT jobs, never the same one. Each job comes back with its attempt count already increased.
create or replace function public.claim_jobs(
  p_worker        text,
  p_kinds         text[]  default null,
  p_limit         integer default 20,
  p_lease_seconds integer default 120
) returns setof public.jobs
language plpgsql
as $$
begin
  perform public.reap_expired_jobs();

  return query
  with picked as (
    select id from public.jobs
     where status = 'queued'
       and run_at <= now()
       and (p_kinds is null or kind = any (p_kinds))
     order by priority desc, run_at, id
     limit greatest(p_limit, 0)
     for update skip locked
  )
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_by = p_worker,
         locked_at = now(),
         lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
    from picked
   where j.id = picked.id
  returning j.*;
end $$;

-- The reporting functions only act if the caller still HOLDS the job. A worker that was too slow (its lease
-- expired and another worker took over) cannot overwrite the new owner's result.

-- Done. p_result records what happened (e.g. {"delivered": 2} or {"skipped": "stale"}).
create or replace function public.complete_job(p_id bigint, p_worker text, p_result jsonb default null)
returns boolean
language sql
as $$
  with done as (
    update public.jobs
       set status = 'succeeded', result = p_result, last_error = null, finished_at = now(),
           locked_by = null, locked_at = null, lease_until = null, updated_at = now()
     where id = p_id and status = 'running' and locked_by = p_worker
    returning 1
  )
  select exists (select 1 from done)
$$;

-- It did not work. Retry after a growing pause (with a little randomness so a burst of failures does not all
-- come back at the same instant), or give up for good: when attempts are used up, or when p_permanent says
-- retrying cannot help. Returns the new status ('queued' or 'dead'), or null if the caller no longer holds the job.
create or replace function public.fail_job(p_id bigint, p_worker text, p_error text, p_permanent boolean default false)
returns text
language plpgsql
as $$
declare
  j public.jobs;
  give_up boolean;
  next_run timestamptz;
begin
  select * into j from public.jobs where id = p_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return null;
  end if;

  give_up := p_permanent or j.attempts >= j.max_attempts;
  next_run := now() + public.job_backoff(j.attempts) * (1 + random() * 0.2);
  if j.quiet_aware then
    next_run := public.next_send_time(next_run);
  end if;

  update public.jobs
     set status      = case when give_up then 'dead' else 'queued' end,
         run_at      = case when give_up then j.run_at else next_run end,
         finished_at = case when give_up then now() end,
         last_error  = left(coalesce(p_error, 'unknown error'), 500),
         locked_by = null, locked_at = null, lease_until = null,
         updated_at = now()
   where id = p_id;

  return case when give_up then 'dead' else 'queued' end;
end $$;

-- "Not now": put the job back for a later time WITHOUT counting it as a failed attempt.
create or replace function public.defer_job(p_id bigint, p_worker text, p_run_at timestamptz, p_reason text default null)
returns boolean
language sql
as $$
  with moved as (
    update public.jobs
       set status = 'queued', run_at = p_run_at, attempts = greatest(attempts - 1, 0),
           last_error = left(p_reason, 500),
           locked_by = null, locked_at = null, lease_until = null, updated_at = now()
     where id = p_id and status = 'running' and locked_by = p_worker
    returning 1
  )
  select exists (select 1 from moved)
$$;

-- Old finished jobs are tidied away: done ones after a week, dead and cancelled ones after a month.
create or replace function public.purge_finished_jobs()
returns integer
language sql
as $$
  with gone as (
    delete from public.jobs
     where id in (
       select id from public.jobs
        where (status = 'succeeded' and finished_at < now() - interval '7 days')
           or (status in ('dead', 'cancelled') and finished_at < now() - interval '30 days')
        limit 1000
     )
    returning 1
  )
  select count(*)::int from gone
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Is a waiting reminder still worth sending?
--
-- A job can wait (after a failure and a pause) while the customer carries on shopping. Just before sending,
-- the worker asks. True means "no longer relevant: skip it".
-- ---------------------------------------------------------------------------------------------
create or replace function public.job_is_stale(p_kind text, p_payload jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := (p_payload ->> 'user_id')::uuid;
  ref text := p_payload ->> 'ref';
  last_change timestamptz;
  last_active timestamptz;
begin
  if p_kind <> 'push.customer' or uid is null then
    return false;
  end if;

  -- They have since switched off offers and reminders.
  if exists (select 1 from push_preferences pp where pp.user_id = uid and not pp.marketing) then
    return true;
  end if;

  case p_payload ->> 'kind'
    when 'cart_1', 'cart_2' then
      select max(c.updated_at) into last_change from cart_items c where c.user_id = uid and c.variant_id is not null;
      -- The cart changed, was emptied, or an order was placed since: this reminder is about a cart that is gone.
      return last_change is null
          or last_change <> ref::timestamptz
          or exists (select 1 from orders o where o.user_id = uid and o.created_at > last_change and o.status <> 'cancelled');
    when 'inactive' then
      select greatest(coalesce(pr.last_seen_at, 'epoch'::timestamptz),
                      coalesce((select max(o.created_at) from orders o where o.user_id = uid), 'epoch'::timestamptz))
        into last_active from profiles pr where pr.id = uid;
      -- They came back (or the account is gone): no need to say "we miss you".
      return last_active is null or last_active > ref::timestamptz;
    when 'promo' then
      -- Only still relevant while the promotion is being sent.
      return not exists (select 1 from promo_messages p where p.id = ref::uuid and p.status = 'sending');
    else
      return false;
  end case;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Planners: turn "who should be reminded" into jobs. Safe to run as often as you like.
-- ---------------------------------------------------------------------------------------------

-- Abandoned-cart and "we miss you" reminders. Skipped during quiet hours, like before.
create or replace function public.plan_customer_reminders()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s public.push_settings;
  cart1 integer; cart2 integer; inactive integer;
begin
  select * into s from push_settings where id = 1;
  if not found then
    return jsonb_build_object('skipped', 'push_settings is missing');
  end if;
  if public.is_quiet_hour(now()) then
    return jsonb_build_object('skipped', 'quiet hours');
  end if;

  select count(public.enqueue_job('push.customer',
           jsonb_build_object('user_id', c.user_id, 'kind', 'cart_1', 'stage', 1, 'ref', c.last_change,
                              'item_count', c.item_count, 'first_item', c.first_item, 'has_last_one', c.has_last_one),
           'cart_1:' || c.user_id || ':' || extract(epoch from c.last_change)::text, now(), 5, true))
    into cart1 from public.push_cart_candidates(1) c;

  select count(public.enqueue_job('push.customer',
           jsonb_build_object('user_id', c.user_id, 'kind', 'cart_2', 'stage', 2, 'ref', c.last_change,
                              'item_count', c.item_count, 'first_item', c.first_item, 'has_last_one', c.has_last_one),
           'cart_2:' || c.user_id || ':' || extract(epoch from c.last_change)::text, now(), 5, true))
    into cart2 from public.push_cart_candidates(2) c;

  select count(public.enqueue_job('push.customer',
           jsonb_build_object('user_id', c.user_id, 'kind', 'inactive', 'ref', c.last_active, 'new_items', c.new_items),
           'inactive:' || c.user_id || ':' || extract(epoch from c.last_active)::text, now(), 5, true))
    into inactive from public.push_inactive_candidates() c;

  return jsonb_build_object('cart_1', cart1, 'cart_2', cart2, 'inactive', inactive);
end $$;

-- Starts sending one promotion: marks it "sending" and queues one job per customer who may receive it.
-- Customers already at their weekly limit are skipped (and counted). Returns what it queued.
create or replace function public.plan_promo(p_promo_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  p public.promo_messages;
  queued integer;
  skipped integer;
  link text;
begin
  update promo_messages set status = 'sending', started_at = now()
   where id = p_promo_id and status = 'scheduled'
  returning * into p;
  if not found then
    return jsonb_build_object('queued', 0, 'skipped_cap', 0, 'note', 'not scheduled');
  end if;

  link := case when p.url like '/%' then p.url else '/' end;   -- only links inside the store

  select count(public.enqueue_job('push.customer',
           jsonb_build_object('user_id', a.user_id, 'kind', 'promo', 'ref', p.id::text,
                              'title', p.title, 'body', p.body, 'url', link),
           'promo:' || p.id || ':' || a.user_id, now(), 5, false))
    into queued from public.push_promo_audience() a where not a.over_cap;

  select count(*)::int into skipped from public.push_promo_audience() a where a.over_cap;

  update promo_messages set skipped_cap = skipped where id = p.id;
  return jsonb_build_object('queued', queued, 'skipped_cap', skipped);
end $$;

-- Starts every promotion that is due, and closes the ones whose sends have all finished.
create or replace function public.plan_due_promos()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  due record;
  started integer := 0;
  closed integer;
begin
  for due in
    select id from promo_messages where status = 'scheduled' and scheduled_for <= now() order by scheduled_for limit 5
  loop
    perform public.plan_promo(due.id);
    started := started + 1;
  end loop;

  with finished as (
    update promo_messages p
       set status = 'sent', sent_at = now(),
           recipients = (select count(*)::int from push_log l where l.kind = 'promo' and l.ref = p.id::text)
     where p.status = 'sending'
       and not exists (
         select 1 from jobs j
          where j.kind = 'push.customer' and j.status in ('queued', 'running') and j.payload ->> 'ref' = p.id::text
       )
    returning 1
  )
  select count(*)::int into closed from finished;

  return jsonb_build_object('started', started, 'finished', closed);
end $$;

-- Orders that have been "placed" for a while with nobody confirming them: ONE job that tells the owner about all
-- of them. Only one such job is open at a time, so the owner is not nudged twice for the same orders.
create or replace function public.plan_owner_order_reminder()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s public.push_settings;
  ids uuid[];
  job bigint;
begin
  select * into s from push_settings where id = 1;
  if not found or not s.confirm_enabled then
    return jsonb_build_object('waiting', 0);
  end if;

  if exists (select 1 from jobs where kind = 'owner.orders_waiting' and status in ('queued', 'running')) then
    return jsonb_build_object('waiting', 0, 'note', 'a reminder is already queued');
  end if;

  select array_agg(o.id order by o.created_at) into ids
    from orders o
   where o.status = 'placed'
     and o.admin_reminded_at is null
     and o.created_at <= now() - make_interval(mins => s.confirm_after_min)
     and o.created_at >= now() - interval '12 hours';   -- never dig up old orders

  if ids is null then
    return jsonb_build_object('waiting', 0);
  end if;

  job := public.enqueue_job('owner.orders_waiting', jsonb_build_object('order_ids', to_jsonb(ids)),
                            'orders_waiting:' || md5(array_to_string(ids, ',')), now(), 5, false, 10::smallint);
  return jsonb_build_object('waiting', cardinality(ids), 'queued', job is not null);
end $$;

-- The one call the timer makes. Does nothing until queue_enabled is switched on.
create or replace function public.plan_all()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  s public.push_settings;
begin
  select * into s from push_settings where id = 1;
  if not found or not s.queue_enabled then
    return jsonb_build_object('enabled', false);
  end if;

  return jsonb_build_object(
    'enabled',   true,
    'reaped',    public.reap_expired_jobs(),
    'owner',     public.plan_owner_order_reminder(),
    'promos',    public.plan_due_promos(),
    'customers', public.plan_customer_reminders(),
    'purged',    public.purge_finished_jobs()
  );
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7. The owner's tools (these check that the caller is the owner)
-- ---------------------------------------------------------------------------------------------

-- A health summary: how many jobs are in each state, how long the oldest waiting one has waited, and the
-- latest jobs that gave up (with the reason).
create or replace function public.admin_job_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'enabled', coalesce((select queue_enabled from push_settings where id = 1), false),
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'status', status, 'n', n) order by kind, status)
        from (select kind, status, count(*)::int as n from jobs group by kind, status) c
    ), '[]'::jsonb),
    'oldest_waiting_seconds', (
      select extract(epoch from now() - min(run_at))::int from jobs where status = 'queued' and run_at <= now()
    ),
    'dead', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.finished_at desc)
        from (select id, kind, attempts, last_error, finished_at, payload ->> 'kind' as sub_kind
                from jobs where status = 'dead' order by finished_at desc limit 20) d
    ), '[]'::jsonb)
  );
end $$;

-- Gives a dead job another go from the start.
create or replace function public.admin_requeue_job(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  update jobs set status = 'queued', attempts = 0, run_at = now(), finished_at = null, last_error = null, updated_at = now()
   where id = p_id and status in ('dead', 'cancelled');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Takes a waiting job off the queue.
create or replace function public.admin_cancel_job(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  update jobs set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id and status = 'queued';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- "Send now" for a scheduled promotion. Queues it straight away; the workers send it within moments.
create or replace function public.admin_send_promo_now(p_promo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if not coalesce((select queue_enabled from push_settings where id = 1), false) then
    raise exception 'QUEUE_DISABLED';
  end if;
  update promo_messages set scheduled_for = now() where id = p_promo_id and status = 'scheduled' and scheduled_for > now();
  return public.plan_promo(p_promo_id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Who may call what
-- ---------------------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Worker and planner functions: the server's key only (the browser must never touch the queue).
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'enqueue_job', 'reap_expired_jobs', 'claim_jobs', 'complete_job', 'fail_job', 'defer_job', 'purge_finished_jobs',
         'job_is_stale', 'plan_customer_reminders', 'plan_promo', 'plan_due_promos', 'plan_owner_order_reminder', 'plan_all',
         'next_send_time', 'is_quiet_hour', 'job_backoff'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant  execute on function %s to service_role', r.sig);
  end loop;

  -- The owner's tools: callable when logged in, and each one checks is_admin() itself.
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array['admin_job_overview', 'admin_requeue_job', 'admin_cancel_job', 'admin_send_promo_now'])
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
