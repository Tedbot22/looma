-- 0005_shop_search_rpcs.sql
-- Server-side paging and search for the shop, so the browser no longer downloads the whole catalogue.
--
--   browse_products()  one page of the shop, in the same "random with a nudge for new and discounted"
--                      order the app already uses, steady across pages for one visit (same seed).
--   search_products()  finds candidate products for typed words. The app still does the final ranking,
--                      so results are ranked exactly as before (see src/lib/search.ts).
--
-- Needs 0002 and 0003 first (0003 creates the pg_trgm extension).
-- Safe to run more than once.

set search_path = public, extensions;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- 1. One searchable text per product (name, category, colours, sizes, details, description).
--    Kept in its own table so `select *` on products stays small everywhere else in the app.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.product_search (
  product_id  uuid primary key references public.products (id) on delete cascade,
  search_text text not null default ''
);

alter table public.product_search enable row level security;

-- Readable only for products a customer can see. Nobody writes through the API: triggers do it.
drop policy if exists "public read active product search" on public.product_search;
create policy "public read active product search" on public.product_search
  for select using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active)
    or (select public.is_admin())
  );

revoke all on public.product_search from anon, authenticated;
grant select on public.product_search to anon, authenticated, service_role;

create index if not exists product_search_trgm_idx
  on public.product_search using gin (search_text gin_trgm_ops);

-- Lower-case, no accents, punctuation turned into spaces (mirrors normalize() in src/lib/search.ts).
create or replace function public.normalize_search_text(t text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select btrim(regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.refresh_product_search(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.product_search (product_id, search_text)
  select p.id,
         public.normalize_search_text(concat_ws(' ',
           p.name,
           c.name,
           (select string_agg(concat_ws(' ', v.color, v.size), ' ')
              from public.product_variants v
             where v.product_id = p.id and v.is_active),
           p.details,
           p.description))
    from public.products p
    left join public.categories c on c.id = p.category_id
   where p.id = p_id
  on conflict (product_id) do update set search_text = excluded.search_text
$$;

-- Triggers. Each is limited to the columns that matter, so stock changes (which happen on every sale)
-- never touch the search table.
create or replace function public.trg_product_search_from_product()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_product_search(new.id);
  return null;
end $$;

create or replace function public.trg_product_search_from_variant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_product_search(old.product_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) then
    perform public.refresh_product_search(new.product_id);
  end if;
  return null;
end $$;

create or replace function public.trg_product_search_from_category()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.products where category_id = new.id loop
    perform public.refresh_product_search(r.id);
  end loop;
  return null;
end $$;

drop trigger if exists product_search_on_product on public.products;
create trigger product_search_on_product
  after insert or update of name, description, details, category_id on public.products
  for each row execute function public.trg_product_search_from_product();

drop trigger if exists product_search_on_variant on public.product_variants;
create trigger product_search_on_variant
  after insert or update of color, size, is_active, product_id or delete on public.product_variants
  for each row execute function public.trg_product_search_from_variant();

drop trigger if exists product_search_on_category on public.categories;
create trigger product_search_on_category
  after update of name on public.categories
  for each row execute function public.trg_product_search_from_category();

-- The words used across the catalogue, in the same trimmed form the app uses ("jeans" -> "jean").
-- Lets a misspelling such as "jaket" or "sneekers" be matched to real words by edit distance.
create table if not exists public.product_search_vocab (word text primary key);
alter table public.product_search_vocab enable row level security;
drop policy if exists "public read search vocab" on public.product_search_vocab;
create policy "public read search vocab" on public.product_search_vocab for select using (true);
revoke all on public.product_search_vocab from anon, authenticated;
grant select on public.product_search_vocab to anon, authenticated, service_role;

-- Same rules as stem() in src/lib/search.ts.
create or replace function public.stem_word(w text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when length(w) <= 3                                   then w
    when w like '%ies' and length(w) > 4                  then left(w, -3) || 'y'
    when w like '%sses'                                   then left(w, -2)
    when w like '%s' and w not like '%ss'                 then left(w, -1)
    else w end
$$;

-- True when two words are about one slip apart (a letter added, dropped, changed or swapped).
-- Slightly generous on purpose; the app does the exact check afterwards.
create or replace function public.search_word_near(a text, b text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when length(a) = length(b)                then levenshtein_less_equal(a, b, 2) <= 2
    when abs(length(a) - length(b)) = 1       then levenshtein_less_equal(a, b, 1) <= 1
    else false end
$$;

create or replace function public.trg_product_search_vocab()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.product_search_vocab (word)
  select distinct public.stem_word(w)
    from new_rows n, regexp_split_to_table(n.search_text, ' ') w
   where length(w) >= 5
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists product_search_vocab_ins on public.product_search;
create trigger product_search_vocab_ins
  after insert on public.product_search
  referencing new table as new_rows
  for each statement execute function public.trg_product_search_vocab();

drop trigger if exists product_search_vocab_upd on public.product_search;
create trigger product_search_vocab_upd
  after update on public.product_search
  referencing new table as new_rows
  for each statement execute function public.trg_product_search_vocab();

-- Fill it for everything that exists today.
select public.refresh_product_search(id) from public.products;

-- Trigger and helper functions are internal.
revoke execute on function public.refresh_product_search(uuid)           from public, anon, authenticated;
revoke execute on function public.trg_product_search_from_product()      from public, anon, authenticated;
revoke execute on function public.trg_product_search_from_variant()      from public, anon, authenticated;
revoke execute on function public.trg_product_search_from_category()     from public, anon, authenticated;
revoke execute on function public.trg_product_search_vocab()             from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. browse_products: one page of the shop.
--
--    score = 80% random (steady for one seed) + 20% priority, where priority is
--            60% newness (newest = 1, oldest = 0, among the items being shown)
--          + 40% discount (50% off or more = 1).
--    This is the same formula as shopOrder() in src/lib/productOrder.ts.
--
--    Returns { "total": <all matching items>, "items": [ <product with product_variants and categories> ] }
-- ---------------------------------------------------------------------------------------------

create or replace function public.browse_products(
  p_seed     bigint,
  p_category uuid    default null,
  p_min      numeric default null,
  p_max      numeric default null,
  p_offset   integer default 0,
  p_limit    integer default 24
) returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with base as (
    select p.id,
           1 - (row_number() over (order by p.created_at desc, p.id) - 1)::float8
                 / greatest(count(*) over () - 1, 1)                                   as newness,
           case when p.compare_at_price > p.price
                then round((p.compare_at_price - p.price) / p.compare_at_price * 100)
                else 0 end                                                              as off,
           count(*) over ()                                                             as total
      from public.products p
     where p.is_active
       and (p_category is null or p.category_id = p_category)
       and (p_min is null or p.price >= p_min)
       and (p_max is null or p.price <= p_max)
  ),
  scored as (
    select id, total,
           0.8 * ((hashtextextended(id::text, p_seed) & 2147483647) / 2147483648.0)
         + 0.2 * (0.6 * newness + 0.4 * least(off, 50) / 50.0)                           as score
      from base
  ),
  page as (
    select id, total, score
      from scored
     order by score desc, id
    offset greatest(p_offset, 0)
     limit least(greatest(p_limit, 1), 60)
  )
  select jsonb_build_object(
    'total', coalesce((select max(total) from page), 0),
    'items', coalesce(jsonb_agg(
      (to_jsonb(p) || jsonb_build_object(
        'product_variants', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb)
                               from public.product_variants v where v.product_id = p.id),
        'categories',       (select jsonb_build_object('name', c.name)
                               from public.categories c where c.id = p.category_id)
      )) order by pg.score desc, pg.id), '[]'::jsonb)
  )
  from page pg
  join public.products p on p.id = pg.id
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. search_products: candidates for typed words.
--
--    p_terms   one entry per typed word, each a list of acceptable alternatives (the word itself and
--              its synonyms), e.g. [["black"],["jacket","coat","outerwear"]].  Built by queryAlternatives().
--    p_phrase  the words as typed, only used to order candidates when more than p_limit match.
--
--    A product is a candidate when EVERY typed word is found in its search text:
--      * as the start of a word (so "den" finds "denim", "jacket" finds "jackets");
--      * short words (up to 3 letters, like sizes "s", "xl", "42") only as a whole word, unless it is the
--        word still being typed;
--      * words of 5+ letters also through catalogue words about one slip away ("jaket" -> "jacket").
--    This is deliberately a little wider than the app's own matching. The app then re-ranks the
--    candidates and drops any that don't really match, so results and their order are unchanged.
-- ---------------------------------------------------------------------------------------------

create or replace function public.search_products(
  p_terms    jsonb,
  p_phrase   text    default '',
  p_category uuid    default null,
  p_min      numeric default null,
  p_max      numeric default null,
  p_limit    integer default 120
) returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with raw as (
    select g.ord, a.n,
           regexp_replace(lower(a.alt), '[^a-z0-9 ]', '', 'g') as w
      from jsonb_array_elements(case when jsonb_typeof(p_terms) = 'array' then p_terms else '[]'::jsonb end)
             with ordinality g(alts, ord)
      cross join lateral jsonb_array_elements_text(
             case when jsonb_typeof(g.alts) = 'array' then g.alts else '[]'::jsonb end)
             with ordinality a(alt, n)
     where g.ord <= 8 and a.n <= 8
  ),
  typed as (select max(ord) as last_ord from raw),
  words as (
    select ord, w, false as fuzzy from raw where w <> ''
    union
    select ord, left(w, -1) || 'ies', false        -- the app trims "accessories" to "accessory"
      from raw where w like '%y' and length(w) >= 4
    union
    select r.ord, v.word, true                      -- catalogue words about one slip away
      from raw r
      join public.product_search_vocab v
        on length(r.w) >= 5 and public.search_word_near(r.w, v.word)
  ),
  groups as (                                        -- one pattern per typed word
    select w.ord,
           '\m(?:' || string_agg(
             case when w.fuzzy or length(w.w) >= 4
                       or (w.ord = t.last_ord and length(w.w) >= case when t.last_ord > 1 then 1 else 2 end)
                  then w.w                           -- start of a word
                  else w.w || '(?:s|es)?\M'         -- whole word (plural allowed)
             end, '|') || ')' as re
      from words w cross join typed t
     group by w.ord, t.last_ord
  ),
  cand as (
    select p.id, p.created_at,
           word_similarity(public.normalize_search_text(p_phrase), s.search_text) as sim
      from public.products p
      join public.product_search s on s.product_id = p.id
     where p.is_active
       and exists (select 1 from groups)
       and (p_category is null or p.category_id = p_category)
       and (p_min is null or p.price >= p_min)
       and (p_max is null or p.price <= p_max)
       and not exists (select 1 from groups gr where s.search_text !~ gr.re)
  ),
  page as (
    select id, sim, created_at from cand
     order by sim desc, created_at desc, id
     limit least(greatest(p_limit, 1), 200)
  )
  select coalesce(jsonb_agg(
    (to_jsonb(p) || jsonb_build_object(
      'product_variants', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb)
                             from public.product_variants v where v.product_id = p.id),
      'categories',       (select jsonb_build_object('name', c.name)
                             from public.categories c where c.id = p.category_id)
    )) order by pg.created_at desc, pg.id), '[]'::jsonb)
  from page pg
  join public.products p on p.id = pg.id
$$;

-- These two are the public storefront API, so (unlike the internal functions) browsers may call them.
-- They run with the caller's rights, so row-level security still decides what is visible.
grant execute on function public.browse_products(bigint, uuid, numeric, numeric, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.search_products(jsonb, text, uuid, numeric, numeric, integer)
  to anon, authenticated, service_role;

-- Make the new functions visible to the API straight away.
notify pgrst, 'reload schema';
