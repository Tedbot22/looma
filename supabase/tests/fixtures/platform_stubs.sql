-- Stand-ins for the pieces Supabase provides (roles, the auth schema, the scheduler and HTTP extensions, storage
-- helpers), so the production schema baseline can be loaded into a plain Postgres for testing.
-- Not for production: Supabase already has the real ones.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists cron;
create schema if not exists net;
create schema if not exists storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

-- The scheduler and HTTP extensions are not in a plain Postgres: calls to them do nothing here.
create function cron.schedule_in_database(text, text, text, text default null, text default null, boolean default true) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;

create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;

create publication supabase_realtime;
