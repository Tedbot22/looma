-- A miniature copy of the tables the job queue touches, so its SQL can be tested on a plain Postgres
-- (locally and in CI) without a Supabase project. Column names and types follow the live schema.
-- The three "candidate" functions are copied from the live database; the queue's planners call them.

create schema if not exists extensions;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- The server's key bypasses row security and can use every table, like the real Supabase role.
alter role service_role bypassrls;
grant usage on schema public, extensions, auth to service_role, anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Stand-in for Supabase's login helper: tests choose "who is logged in" with  set test.uid = '<uuid>'.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text, phone text,
  is_admin boolean not null default false,
  last_seen_at timestamptz
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
  $$ select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) $$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  order_number integer, total numeric not null default 0,
  status text not null default 'placed',
  payment_method text not null default 'online',
  created_at timestamptz not null default now(),
  admin_reminded_at timestamptz
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Item', is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  stock integer not null default 1, is_active boolean not null default true
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  variant_id uuid references public.product_variants (id),
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  endpoint text not null unique, subscription jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  token text not null unique, platform text not null default 'web',
  created_at timestamptz not null default now()
);
create table public.push_preferences (
  user_id uuid primary key references public.profiles (id),
  marketing boolean not null default true, updated_at timestamptz not null default now()
);
create table public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id),
  kind text not null, ref text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create table public.promo_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null, url text not null default '/',
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  started_at timestamptz, sent_at timestamptz,
  recipients integer, skipped_cap integer,
  created_by uuid, created_at timestamptz not null default now()
);
create table public.push_settings (
  id integer primary key default 1,
  cart_enabled boolean not null default true,
  cart_first_hours numeric not null default 4,
  cart_second_hours numeric not null default 24,
  confirm_enabled boolean not null default true,
  confirm_after_min integer not null default 20,
  inactive_enabled boolean not null default true,
  inactive_after_days integer not null default 10,
  promo_weekly_cap integer not null default 2,
  quiet_start_hour integer not null default 21,
  quiet_end_hour integer not null default 8,
  updated_at timestamptz not null default now()
);
insert into public.push_settings (id) values (1);

grant all on all tables in schema public to service_role;

-- Copied from the live database (pg_get_functiondef):
CREATE OR REPLACE FUNCTION public.push_cart_candidates(p_stage integer)
 RETURNS TABLE(user_id uuid, last_change timestamp with time zone, item_count integer, first_item text, has_last_one boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select * from public.push_settings where id = 1),
  carts as (
    select c.user_id,
           max(c.updated_at)                                         as last_change,
           count(*)::int                                             as item_count,
           (array_agg(p.name order by c.created_at))[1]              as first_item,
           bool_or(v.stock = 1)                                      as has_last_one
      from public.cart_items c
      join public.product_variants v on v.id = c.variant_id and v.is_active and v.stock > 0
      join public.products p         on p.id = v.product_id   and p.is_active
     where c.variant_id is not null
     group by c.user_id
  )
  select k.user_id, k.last_change, k.item_count, k.first_item, k.has_last_one
    from carts k, s
   where s.cart_enabled
     -- this device/account can actually receive a push
     and exists (select 1 from public.customer_push_subscriptions sub where sub.user_id = k.user_id)
     -- they haven't switched off offers & reminders
     and not exists (select 1 from public.push_preferences pp where pp.user_id = k.user_id and not pp.marketing)
     -- they haven't started or finished a checkout since the cart last changed
     and not exists (
       select 1 from public.orders o
        where o.user_id = k.user_id and o.created_at > k.last_change and o.status <> 'cancelled'
     )
     and (
       (p_stage = 1
         and k.last_change <= now() - make_interval(secs => (s.cart_first_hours * 3600)::int)
         and k.last_change >  now() - interval '24 hours'
         and not exists (select 1 from public.push_log l where l.user_id = k.user_id and l.kind = 'cart_1' and l.sent_at >= k.last_change))
       or
       (p_stage = 2
         and k.last_change > now() - interval '96 hours'
         and exists (
           select 1 from public.push_log l
            where l.user_id = k.user_id and l.kind = 'cart_1'
              and l.sent_at >= k.last_change
              and l.sent_at <= now() - make_interval(secs => (s.cart_second_hours * 3600)::int))
         and not exists (select 1 from public.push_log l where l.user_id = k.user_id and l.kind = 'cart_2' and l.sent_at >= k.last_change))
     );
$function$;

CREATE OR REPLACE FUNCTION public.push_inactive_candidates()
 RETURNS TABLE(user_id uuid, last_active timestamp with time zone, new_items integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select * from public.push_settings where id = 1),
  people as (
    select pr.id as user_id,
           greatest(
             coalesce(pr.last_seen_at, 'epoch'::timestamptz),
             coalesce((select max(o.created_at) from public.orders o where o.user_id = pr.id), 'epoch'::timestamptz)
           ) as last_active
      from public.profiles pr
  )
  select p.user_id, p.last_active,
         (select count(*)::int from public.products x where x.is_active and x.created_at > p.last_active) as new_items
    from people p, s
   where s.inactive_enabled
     and p.last_active <= now() - make_interval(days => s.inactive_after_days)
     and exists (select 1 from public.customer_push_subscriptions sub where sub.user_id = p.user_id)
     and not exists (select 1 from public.push_preferences pp where pp.user_id = p.user_id and not pp.marketing)
     -- once per absence
     and not exists (select 1 from public.push_log l where l.user_id = p.user_id and l.kind = 'inactive' and l.sent_at >= p.last_active)
     -- and never on top of another message sent in the last day
     and not exists (select 1 from public.push_log l where l.user_id = p.user_id and l.sent_at > now() - interval '24 hours');
$function$;

CREATE OR REPLACE FUNCTION public.push_promo_audience()
 RETURNS TABLE(user_id uuid, over_cap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select * from public.push_settings where id = 1)
  select u.user_id,
         (select count(*) from public.push_log l
           where l.user_id = u.user_id and l.kind = 'promo' and l.sent_at > now() - interval '7 days') >= s.promo_weekly_cap
    from (select distinct sub.user_id from public.customer_push_subscriptions sub) u, s
   where not exists (select 1 from public.push_preferences pp where pp.user_id = u.user_id and not pp.marketing);
$function$;

