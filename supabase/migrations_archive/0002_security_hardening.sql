-- 0002_security_hardening.sql
-- Server-only and internal functions must not be callable through the public API.
--
-- Why: Supabase grants EXECUTE on public functions to anon/authenticated by default.
-- cancel_order() trusts its p_actor / p_as_admin arguments and mark_order_paid() performs
-- no caller check, so if they are executable by the browser's role, any user could cancel
-- someone else's order or mark an unpaid order as paid. They are only ever called from
-- edge functions using the service-role key, which keeps working after this migration.
--
-- Safe to run more than once.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any(array[
      -- called only by edge functions (service role)
      'cancel_order',
      'mark_order_paid',
      'push_cart_candidates',
      'push_inactive_candidates',
      'push_promo_audience',
      'delivery_otp_sms_result',
      'rider_get_delivery',
      'rider_request_otp',
      -- called only by cron, triggers or other functions
      'issue_coupon',
      'release_expired_orders',
      'run_payment_reconciliation',
      '_close_assignment',
      '_create_assignment',
      '_delivery_event',
      '_issue_link',
      '_lock_assignment',
      '_lock_order_for_token',
      '_resolve_link',
      'rider_complete_delivery_core',
      'rider_verify_otp_core',
      'rider_verify_qr_core'
       ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant  execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Future functions in public are private until you grant them on purpose.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
