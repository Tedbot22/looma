-- 0003_performance_indexes.sql
-- Indexes for the shop, order lists and the every-minute expiry job.
-- Existing indexes are kept; drop the superseded ones in a later migration once you have
-- confirmed in Supabase's index advisor that they are unused.

set search_path = public, extensions;

create extension if not exists pg_trgm with schema extensions;

-- Shop: newest-first listing, with and without a category filter (partial: only sellable rows).
create index if not exists products_active_created_idx
  on public.products (created_at desc, id) where is_active;
create index if not exists products_category_created_idx
  on public.products (category_id, created_at desc, id) where is_active;

-- Search: fuzzy / prefix matching on product name (used by the upcoming search_products RPC).
create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops) where is_active;

-- "My orders" and the admin order list.
create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);
create index if not exists orders_created_idx
  on public.orders (created_at desc);

-- release_expired_orders() runs every minute: index only the rows it can act on.
create index if not exists orders_pending_expiry_idx
  on public.orders (expires_at) where status = 'pending_payment';

-- Foreign keys that were unindexed (restocking, coupon release, deletes).
create index if not exists order_items_variant_idx
  on public.order_items (variant_id) where variant_id is not null;
create index if not exists orders_coupon_idx
  on public.orders (coupon_id) where coupon_id is not null;

-- Low-stock / in-stock filtering on variants.
create index if not exists variants_product_active_idx
  on public.product_variants (product_id) where is_active and stock > 0;
