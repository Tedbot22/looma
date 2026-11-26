-- 0004_rls_initplan.sql
-- Wraps auth.uid() and is_admin() in (select ...) inside RLS policies so Postgres evaluates
-- them once per query instead of once per row (Supabase advisor: auth_rls_initplan).
-- Behaviour is unchanged. Generated from the live pg_policies export.

alter policy "own quotes read" on public.delivery_quotes
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "own order events read" on public.order_events
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_events.order_id) AND (o.user_id = (select auth.uid())))))));

alter policy "pages admin" on public.site_pages
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "banners admin" on public.hero_banners
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "banners read" on public.hero_banners
  using ((is_active OR (select public.is_admin())));

alter policy "admin payments read" on public.payments
  using ((select public.is_admin()));

alter policy "admin issues read" on public.payment_issues
  using ((select public.is_admin()));

alter policy "admin issues resolve" on public.payment_issues
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "admin manages categories" on public.categories
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND profiles.is_admin))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND profiles.is_admin))));

alter policy "admin write" on public.categories
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "admin write" on public.app_settings
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "admin write" on public.product_variants
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "catalog read" on public.product_variants
  using ((is_active OR (select public.is_admin())));

alter policy "admin write" on public.products
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "catalog read" on public.products
  using ((is_active OR (select public.is_admin())));

alter policy "admin devices" on public.device_tokens
  using (((select public.is_admin()) AND (user_id = (select auth.uid()))))
  with check (((select public.is_admin()) AND (user_id = (select auth.uid()))));

alter policy "own wishlist" on public.wishlist_items
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "own order items read" on public.order_items
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = (select auth.uid())))))));

alter policy "own profile read" on public.profiles
  using (((id = (select auth.uid())) OR (select public.is_admin())));

alter policy "own profile update" on public.profiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy "own cart" on public.cart_items
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "own addresses" on public.addresses
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "zones admin" on public.delivery_zones
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "zones read" on public.delivery_zones
  using ((is_active OR (select public.is_admin())));

alter policy "own orders read" on public.orders
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "templates admin" on public.coupon_templates
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "own coupons read" on public.coupons
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "admin manages push settings" on public.push_settings
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "customer adds own push preference" on public.push_preferences
  with check ((user_id = (select auth.uid())));

alter policy "customer changes own push preference" on public.push_preferences
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "customer reads own push preference" on public.push_preferences
  using ((user_id = (select auth.uid())));

alter policy "admin manages promos" on public.promo_messages
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "admin reads push log" on public.push_log
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "reviews admin delete" on public.store_reviews
  using ((select public.is_admin()));

alter policy "reviews admin update" on public.store_reviews
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "reviews insert own" on public.store_reviews
  with check (((user_id = (select auth.uid())) AND (is_visible = true) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = store_reviews.order_id) AND (o.user_id = (select auth.uid())) AND (o.status = 'delivered'::text))))));

alter policy "reviews read own" on public.store_reviews
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "admin reads assignments" on public.delivery_assignments
  using ((select public.is_admin()));

alter policy "admin reads delivery events" on public.delivery_events
  using ((select public.is_admin()));

alter policy "own chats" on public.support_conversations
  using (((select auth.uid()) = user_id));

alter policy "owner reads chats" on public.support_conversations
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "owner resolves chats" on public.support_conversations
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "own chat messages" on public.support_messages
  using ((EXISTS ( SELECT 1
   FROM support_conversations c
  WHERE ((c.id = support_messages.conversation_id) AND (c.user_id = (select auth.uid()))))));

alter policy "owner reads chat messages" on public.support_messages
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND p.is_admin))));

alter policy "own push devices: delete" on public.customer_push_subscriptions
  using ((user_id = (select auth.uid())));

alter policy "own push devices: select" on public.customer_push_subscriptions
  using ((user_id = (select auth.uid())));

alter policy "review_media: admin can remove" on public.review_media
  using ((select public.is_admin()));

alter policy "review_media: customers add to their own review" on public.review_media
  with check (((user_id = (select auth.uid())) AND (url ~~ (('%/storage/v1/object/public/review-media/'::text || ((select auth.uid()))::text) || '/%'::text)) AND (EXISTS ( SELECT 1
   FROM store_reviews r
  WHERE ((r.id = review_media.review_id) AND (r.user_id = (select auth.uid())))))));

alter policy "review_media: owner and admin can read" on public.review_media
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));
