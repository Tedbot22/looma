SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

CREATE EXTENSION "fuzzystrmatch" SCHEMA "extensions";

CREATE EXTENSION "pg_cron";

CREATE EXTENSION "pg_net" SCHEMA "public";

CREATE EXTENSION "pg_trgm" SCHEMA "extensions";

CREATE EXTENSION "unaccent" SCHEMA "extensions";

CREATE TABLE "public"."addresses" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "zone_id"    uuid                     NOT NULL,
  "details"    text                     NOT NULL,
  "is_default" boolean                  NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "latitude"   numeric(9,6)             NOT NULL,
  "longitude"  numeric(9,6)             NOT NULL,
  "note"       text,
  CONSTRAINT "addresses_details_check" CHECK ((length(TRIM(BOTH FROM details)) >= 3)),
  CONSTRAINT "addresses_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."addresses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."app_settings" (
  "key"   text NOT NULL,
  "value" text NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY (key)
);

ALTER TABLE "public"."app_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cart_items" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "variant_id" uuid                     NOT NULL,
  "quantity"   integer                  NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cart_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "cart_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "cart_items_user_variant_key" UNIQUE (user_id, variant_id)
);

ALTER TABLE "public"."cart_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."categories" (
  "id"         uuid    NOT NULL DEFAULT gen_random_uuid(),
  "name"       text    NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "categories_name_key" UNIQUE (name),
  CONSTRAINT "categories_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categories"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."coupon_templates" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"         text                     NOT NULL,
  "kind"         text                     NOT NULL,
  "value"        numeric(12,2)            NOT NULL DEFAULT 0,
  "max_discount" numeric(12,2)            NOT NULL,
  "min_order"    numeric(12,2)            NOT NULL DEFAULT 0,
  "weight"       integer                  NOT NULL DEFAULT 1,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "coupon_templates_check1" CHECK (((kind <> ALL (ARRAY['percent_checkout'::text, 'percent_item'::text])) OR (value <= (100)::numeric))),
  CONSTRAINT "coupon_templates_check" CHECK (((kind = 'free_delivery'::text) OR (value > (0)::numeric))),
  CONSTRAINT "coupon_templates_kind_check" CHECK ((kind = ANY (ARRAY['free_delivery'::text, 'fixed_off'::text, 'percent_checkout'::text, 'percent_item'::text]))),
  CONSTRAINT "coupon_templates_max_discount_check" CHECK ((max_discount > (0)::numeric)),
  CONSTRAINT "coupon_templates_min_order_check" CHECK ((min_order >= (0)::numeric)),
  CONSTRAINT "coupon_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "coupon_templates_value_check" CHECK ((value >= (0)::numeric)),
  CONSTRAINT "coupon_templates_weight_check" CHECK ((weight >= 0))
);

ALTER TABLE "public"."coupon_templates"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."coupons" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "template_id"      uuid,
  "code"             text                     NOT NULL,
  "name"             text                     NOT NULL,
  "kind"             text                     NOT NULL,
  "value"            numeric(12,2)            NOT NULL,
  "max_discount"     numeric(12,2)            NOT NULL,
  "min_order"        numeric(12,2)            NOT NULL,
  "source"           text                     NOT NULL DEFAULT 'referral'::text,
  "issued_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"       timestamp with time zone NOT NULL,
  "used_at"          timestamp with time zone,
  "used_order_id"    uuid,
  "discount_applied" numeric(12,2),
  CONSTRAINT "coupons_code_key" UNIQUE (code),
  CONSTRAINT "coupons_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."coupons"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."customer_push_subscriptions" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "endpoint"     text                     NOT NULL,
  "subscription" jsonb                    NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_push_subscriptions_endpoint_key" UNIQUE (endpoint),
  CONSTRAINT "customer_push_subscriptions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."customer_push_subscriptions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."customer_push_subscriptions" FROM "anon";

CREATE TABLE "public"."delivery_assignments" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"         uuid                     NOT NULL,
  "rider_name"       text                     NOT NULL,
  "rider_phone"      text                     NOT NULL,
  "dispatch_company" text,
  "status"           text                     NOT NULL DEFAULT 'assigned'::text,
  "expires_at"       timestamp with time zone NOT NULL,
  "qr_verified_at"   timestamp with time zone,
  "completed_at"     timestamp with time zone,
  "closed_reason"    text,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "delivery_assignments_dispatch_company_check" CHECK (((dispatch_company IS NULL) OR (char_length(dispatch_company) <= 100))),
  CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "delivery_assignments_rider_name_check" CHECK (((char_length(TRIM(BOTH FROM rider_name)) >= 2) AND (char_length(TRIM(BOTH FROM rider_name)) <= 100))),
  CONSTRAINT "delivery_assignments_rider_phone_check" CHECK ((rider_phone ~ '^[0-9+() -]{7,20}$'::text)),
  CONSTRAINT "delivery_assignments_status_check"
    CHECK ((status = ANY (ARRAY['assigned'::text, 'out_for_delivery'::text, 'qr_verified'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text, 'reassigned'::text])))
);

ALTER TABLE "public"."delivery_assignments"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."delivery_assignments" FROM "anon";

CREATE TABLE "public"."delivery_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"      uuid                     NOT NULL,
  "assignment_id" uuid,
  "event_type"    text                     NOT NULL,
  "outcome"       text,
  "actor"         text                     NOT NULL,
  "actor_id"      uuid,
  "detail"        jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "delivery_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."delivery_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."delivery_events" FROM "anon";

CREATE TABLE "public"."delivery_link_tokens" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" uuid                     NOT NULL,
  "token_hash"    text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"    timestamp with time zone NOT NULL,
  "revoked_at"    timestamp with time zone,
  "consumed_at"   timestamp with time zone,
  CONSTRAINT "delivery_link_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "delivery_link_tokens_token_hash_key" UNIQUE (token_hash)
);

ALTER TABLE "public"."delivery_link_tokens"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."delivery_link_tokens" FROM "anon", "authenticated";

CREATE TABLE "public"."delivery_qr_tokens" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"      uuid                     NOT NULL,
  "assignment_id" uuid                     NOT NULL,
  "customer_id"   uuid                     NOT NULL,
  "token_hash"    text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"    timestamp with time zone NOT NULL,
  "verified_at"   timestamp with time zone,
  "consumed_at"   timestamp with time zone,
  "kind"          text                     NOT NULL DEFAULT 'qr'::text,
  "attempts"      integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "delivery_qr_tokens_kind_check" CHECK ((kind = ANY (ARRAY['qr'::text, 'otp'::text]))),
  CONSTRAINT "delivery_qr_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "delivery_qr_tokens_token_hash_key" UNIQUE (token_hash)
);

ALTER TABLE "public"."delivery_qr_tokens"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."delivery_qr_tokens" FROM "anon", "authenticated";

CREATE TABLE "public"."delivery_quotes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "address"    text                     NOT NULL,
  "note"       text,
  "lat"        numeric(9,6)             NOT NULL,
  "lon"        numeric(9,6)             NOT NULL,
  "origin_lat" numeric(9,6)             NOT NULL,
  "origin_lon" numeric(9,6)             NOT NULL,
  "distance_m" integer                  NOT NULL,
  "fee"        numeric(12,2)            NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "delivery_quotes_fee_check" CHECK ((fee >= (0)::numeric)),
  CONSTRAINT "delivery_quotes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."delivery_quotes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."delivery_zones" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "fee"        numeric(12,2)            NOT NULL DEFAULT 0,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "sort_order" integer                  NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "kind"       text                     NOT NULL DEFAULT 'campus'::text,
  "latitude"   double precision,
  "longitude"  double precision,
  CONSTRAINT "delivery_zones_fee_check" CHECK ((fee >= (0)::numeric)),
  CONSTRAINT "delivery_zones_kind_check" CHECK ((kind = ANY (ARRAY['campus'::text, 'home'::text]))),
  CONSTRAINT "delivery_zones_name_key" UNIQUE (name),
  CONSTRAINT "delivery_zones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."delivery_zones"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."device_tokens" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "token"      text                     NOT NULL,
  "platform"   text                     NOT NULL DEFAULT 'web'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "device_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "device_tokens_token_key" UNIQUE (token)
);

ALTER TABLE "public"."device_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."hero_banners" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "image_url"    text                     NOT NULL,
  "title"        text,
  "subtitle"     text,
  "button_label" text,
  "link_url"     text,
  "sort_order"   integer                  NOT NULL DEFAULT 0,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "hero_banners_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."hero_banners"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."order_events" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"   uuid                     NOT NULL,
  "status"     text                     NOT NULL,
  "note"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."order_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."order_items" (
  "id"         uuid          NOT NULL DEFAULT gen_random_uuid(),
  "order_id"   uuid          NOT NULL,
  "variant_id" uuid,
  "name"       text          NOT NULL,
  "quantity"   integer       NOT NULL,
  "unit_price" numeric(12,2) NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0))
);

ALTER TABLE "public"."order_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."orders" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_number"         bigint                   NOT NULL,
  "user_id"              uuid                     NOT NULL,
  "total"                numeric(12,2)            NOT NULL DEFAULT 0,
  "payment_method"       text                     NOT NULL,
  "payment_status"       text                     NOT NULL DEFAULT 'pending'::text,
  "status"               text                     NOT NULL,
  "delivery_address"     text                     NOT NULL,
  "phone"                text                     NOT NULL,
  "expires_at"           timestamp with time zone,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "notified_at"          timestamp with time zone,
  "payment_reference"    text,
  "paid_at"              timestamp with time zone,
  "subtotal"             numeric(12,2)            NOT NULL DEFAULT 0,
  "delivery_fee"         numeric(12,2)            NOT NULL DEFAULT 0,
  "delivery_zone"        text,
  "coupon_id"            uuid,
  "discount"             numeric(12,2)            NOT NULL DEFAULT 0,
  "delivery_note"        text,
  "delivery_lat"         numeric(9,6),
  "delivery_lon"         numeric(9,6),
  "delivery_distance_m"  integer,
  "origin_lat"           numeric(9,6),
  "origin_lon"           numeric(9,6),
  "refund_needs_details" boolean                  NOT NULL DEFAULT false,
  "admin_reminded_at"    timestamp with time zone,
  CONSTRAINT "orders_payment_method_check" CHECK ((payment_method = ANY (ARRAY['online'::text, 'on_delivery'::text]))),
  CONSTRAINT "orders_payment_status_check"
    CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refund_pending'::text, 'refunded'::text, 'refund_failed'::text]))),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_status_check"
    CHECK ((status = ANY (ARRAY['pending_payment'::text, 'placed'::text, 'confirmed'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."orders"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payment_issues" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"    uuid,
  "reference"   text,
  "kind"        text                     NOT NULL,
  "detail"      text,
  "raw"         jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  CONSTRAINT "payment_issues_kind_check"
    CHECK ((kind = ANY (ARRAY['refund_failed'::text, 'refund_needs_attention'::text, 'payment_mismatch'::text, 'dispute'::text, 'other'::text]))),
  CONSTRAINT "payment_issues_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."payment_issues"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"           uuid,
  "kind"               text                     NOT NULL,
  "reference"          text                     NOT NULL,
  "paystack_refund_id" text,
  "amount_kobo"        bigint,
  "currency"           text                     NOT NULL DEFAULT 'NGN'::text,
  "status"             text                     NOT NULL,
  "reason"             text,
  "raw"                jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payments_kind_check" CHECK ((kind = ANY (ARRAY['charge'::text, 'refund'::text]))),
  CONSTRAINT "payments_kind_reference_key" UNIQUE (kind, reference),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."private_settings" (
  "key"   text NOT NULL,
  "value" text NOT NULL,
  CONSTRAINT "private_settings_pkey" PRIMARY KEY (key)
);

ALTER TABLE "public"."private_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."product_search_vocab" (
  "word" text NOT NULL,
  CONSTRAINT "product_search_vocab_pkey" PRIMARY KEY (word)
);

ALTER TABLE "public"."product_search_vocab"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."product_search" (
  "product_id"  uuid NOT NULL,
  "search_text" text NOT NULL DEFAULT ''::text,
  CONSTRAINT "product_search_pkey" PRIMARY KEY (product_id)
);

ALTER TABLE "public"."product_search"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."product_variants" (
  "id"         uuid    NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid    NOT NULL,
  "color"      text,
  "size"       text,
  "image"      text,
  "stock"      integer NOT NULL DEFAULT 0,
  "is_active"  boolean NOT NULL DEFAULT true,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY (id),
  CONSTRAINT "product_variants_product_id_color_size_key" UNIQUE (product_id, color, size),
  CONSTRAINT "product_variants_stock_check" CHECK ((stock >= 0))
);

ALTER TABLE "public"."product_variants"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."products" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "category_id"      uuid                     NOT NULL,
  "name"             text                     NOT NULL,
  "description"      text,
  "price"            numeric(12,2)            NOT NULL,
  "compare_at_price" numeric(12,2),
  "images"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "is_active"        boolean                  NOT NULL DEFAULT true,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "sizes"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "details"          text,
  "size_guide"       text,
  CONSTRAINT "products_check" CHECK (((compare_at_price IS NULL) OR (compare_at_price > price))),
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_price_check" CHECK ((price >= (0)::numeric)),
  CONSTRAINT "products_size_guide_check" CHECK ((size_guide = ANY (ARRAY['clothing'::text, 'shoes'::text, 'none'::text])))
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"             uuid                     NOT NULL,
  "full_name"      text,
  "phone"          text,
  "referral_code"  text                     NOT NULL,
  "referred_by"    uuid,
  "is_admin"       boolean                  NOT NULL DEFAULT false,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "deactivated_at" timestamp with time zone,
  "last_seen_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_referral_code_key" UNIQUE (referral_code)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."promo_messages" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"         text                     NOT NULL,
  "body"          text                     NOT NULL,
  "url"           text                     NOT NULL DEFAULT '/'::text,
  "scheduled_for" timestamp with time zone NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'scheduled'::text,
  "started_at"    timestamp with time zone,
  "sent_at"       timestamp with time zone,
  "recipients"    integer,
  "skipped_cap"   integer,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "promo_messages_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 160))),
  CONSTRAINT "promo_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "promo_messages_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'sending'::text, 'sent'::text, 'cancelled'::text]))),
  CONSTRAINT "promo_messages_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 60)))
);

ALTER TABLE "public"."promo_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."push_log" (
  "id"      bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" uuid                     NOT NULL,
  "kind"    text                     NOT NULL,
  "ref"     text                     NOT NULL,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "push_log_kind_check" CHECK ((kind = ANY (ARRAY['cart_1'::text, 'cart_2'::text, 'inactive'::text, 'promo'::text]))),
  CONSTRAINT "push_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."push_log"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."push_preferences" (
  "user_id"    uuid                     NOT NULL,
  "marketing"  boolean                  NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "push_preferences_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."push_preferences"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."push_settings" (
  "id"                  integer                  NOT NULL DEFAULT 1,
  "cart_enabled"        boolean                  NOT NULL DEFAULT true,
  "cart_first_hours"    numeric                  NOT NULL DEFAULT 4,
  "cart_second_hours"   numeric                  NOT NULL DEFAULT 24,
  "confirm_enabled"     boolean                  NOT NULL DEFAULT true,
  "confirm_after_min"   integer                  NOT NULL DEFAULT 20,
  "inactive_enabled"    boolean                  NOT NULL DEFAULT true,
  "inactive_after_days" integer                  NOT NULL DEFAULT 10,
  "promo_weekly_cap"    integer                  NOT NULL DEFAULT 2,
  "quiet_start_hour"    integer                  NOT NULL DEFAULT 21,
  "quiet_end_hour"      integer                  NOT NULL DEFAULT 8,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "push_settings_cart_first_hours_check" CHECK (((cart_first_hours >= (2)::numeric) AND (cart_first_hours <= (6)::numeric))),
  CONSTRAINT "push_settings_cart_second_hours_check" CHECK (((cart_second_hours >= (12)::numeric) AND (cart_second_hours <= (72)::numeric))),
  CONSTRAINT "push_settings_confirm_after_min_check" CHECK (((confirm_after_min >= 15) AND (confirm_after_min <= 30))),
  CONSTRAINT "push_settings_id_check" CHECK ((id = 1)),
  CONSTRAINT "push_settings_inactive_after_days_check" CHECK (((inactive_after_days >= 7) AND (inactive_after_days <= 14))),
  CONSTRAINT "push_settings_pkey" PRIMARY KEY (id),
  CONSTRAINT "push_settings_promo_weekly_cap_check" CHECK (((promo_weekly_cap >= 1) AND (promo_weekly_cap <= 2))),
  CONSTRAINT "push_settings_quiet_end_hour_check" CHECK (((quiet_end_hour >= 0) AND (quiet_end_hour <= 23))),
  CONSTRAINT "push_settings_quiet_start_hour_check" CHECK (((quiet_start_hour >= 0) AND (quiet_start_hour <= 23)))
);

ALTER TABLE "public"."push_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."review_media" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "review_id"  uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "kind"       text                     NOT NULL,
  "url"        text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_media_kind_check" CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text]))),
  CONSTRAINT "review_media_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."review_media"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."rider_transfer_accounts" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"       uuid                     NOT NULL,
  "reference"      text                     NOT NULL,
  "account_number" text                     NOT NULL,
  "account_name"   text,
  "bank_name"      text,
  "amount_kobo"    bigint                   NOT NULL,
  "expires_at"     timestamp with time zone NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'pending'::text,
  "paid_at"        timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rider_transfer_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "rider_transfer_accounts_reference_key" UNIQUE (reference),
  CONSTRAINT "rider_transfer_accounts_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'rejected'::text])))
);

ALTER TABLE "public"."rider_transfer_accounts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."rider_transfer_accounts" FROM "anon", "authenticated";

CREATE TABLE "public"."site_pages" (
  "slug"       text                     NOT NULL,
  "title"      text                     NOT NULL,
  "content"    text                     NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "site_pages_pkey" PRIMARY KEY (slug)
);

ALTER TABLE "public"."site_pages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."store_review_products" (
  "review_id"  uuid NOT NULL,
  "product_id" uuid NOT NULL,
  CONSTRAINT "store_review_products_pkey" PRIMARY KEY (review_id, product_id)
);

ALTER TABLE "public"."store_review_products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."store_reviews" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"       uuid                     NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "rating"         smallint                 NOT NULL,
  "size_fit"       text,
  "comfort"        text,
  "delivery"       text,
  "item_condition" text,
  "message"        text,
  "is_visible"     boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "store_reviews_comfort_check" CHECK ((comfort = ANY (ARRAY['bad'::text, 'good'::text, 'very_good'::text]))),
  CONSTRAINT "store_reviews_delivery_check" CHECK ((delivery = ANY (ARRAY['bad'::text, 'good'::text, 'very_good'::text]))),
  CONSTRAINT "store_reviews_item_condition_check" CHECK ((item_condition = ANY (ARRAY['worse'::text, 'as_described'::text, 'better'::text]))),
  CONSTRAINT "store_reviews_message_check" CHECK (((message IS NULL) OR (char_length(message) <= 1000))),
  CONSTRAINT "store_reviews_order_id_key" UNIQUE (order_id),
  CONSTRAINT "store_reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "store_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "store_reviews_size_fit_check" CHECK ((size_fit = ANY (ARRAY['bad'::text, 'good'::text, 'very_good'::text])))
);

ALTER TABLE "public"."store_reviews"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."support_conversations" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "status"            text                     NOT NULL DEFAULT 'ai'::text,
  "escalation_reason" text,
  "summary"           text,
  "order_id"          uuid,
  "escalated_at"      timestamp with time zone,
  "owner_alerted_at"  timestamp with time zone,
  "resolved_at"       timestamp with time zone,
  "last_message_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_conversations_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_conversations_status_check" CHECK ((status = ANY (ARRAY['ai'::text, 'escalated'::text, 'resolved'::text])))
);

ALTER TABLE "public"."support_conversations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."support_messages" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid                     NOT NULL,
  "role"            text                     NOT NULL,
  "content"         text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_messages_content_check" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000))),
  CONSTRAINT "support_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

ALTER TABLE "public"."support_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."wishlist_items" (
  "user_id"       uuid                     NOT NULL,
  "variant_id"    uuid                     NOT NULL,
  "auto_moved_at" timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "wishlist_items_pkey" PRIMARY KEY (user_id, variant_id)
);

ALTER TABLE "public"."wishlist_items"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._close_assignment (
  p_assignment uuid,
  p_status     text,
  p_reason     text,
  p_actor      text,
  p_actor_id   uuid DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_a delivery_assignments%rowtype;
  v_o orders%rowtype;
begin
  select * into v_a from delivery_assignments
   where id = p_assignment and status in ('assigned', 'out_for_delivery', 'qr_verified');
  if not found then
    return;   -- already closed: nothing to do (makes repeat calls harmless)
  end if;

  update delivery_assignments
     set status = p_status, closed_reason = p_reason
   where id = p_assignment;

  update delivery_link_tokens
     set revoked_at = now()
   where assignment_id = p_assignment and revoked_at is null and consumed_at is null;

  update delivery_qr_tokens
     set expires_at = least(expires_at, now())
   where assignment_id = p_assignment and consumed_at is null;

  perform _delivery_event(
    v_a.order_id, p_assignment,
    case p_status when 'reassigned' then 'rider_reassigned'
                  when 'failed'     then 'delivery_failed'
                  else 'assignment_cancelled' end,
    case p_status when 'failed' then 'failure' else 'success' end,
    p_actor, p_actor_id, jsonb_build_object('reason', p_reason));

  if p_status in ('failed', 'cancelled') then
    select * into v_o from orders where id = v_a.order_id;
    if v_o.status = 'out_for_delivery' then
      perform set_config('app.order_note',
        case p_status when 'failed' then 'Delivery attempt unsuccessful. We will arrange a new delivery.'
                      else 'Delivery was called off. We will arrange a new delivery.' end, true);
      update orders set status = 'confirmed' where id = v_o.id;
      perform set_config('app.order_note', '', true);
    end if;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."_close_assignment"(uuid, text, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._create_assignment (
  p_order   uuid,
  p_name    text,
  p_phone   text,
  p_company text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_id   uuid;
  v_link jsonb;
begin
  insert into delivery_assignments (order_id, rider_name, rider_phone, dispatch_company, expires_at, created_by)
  values (p_order, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_company, '')), ''), now(), auth.uid())
  returning id into v_id;

  perform _delivery_event(p_order, v_id, 'rider_assigned', 'success', 'admin', auth.uid(),
                          jsonb_build_object('rider_name', trim(p_name), 'rider_phone', trim(p_phone)));

  v_link := _issue_link(v_id);
  return jsonb_build_object('assignment_id', v_id) || v_link;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."_create_assignment"(uuid, text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._delivery_event (
  p_order      uuid,
  p_assignment uuid,
  p_type       text,
  p_outcome    text,
  p_actor      text,
  p_actor_id   uuid  DEFAULT NULL::uuid,
  p_detail     jsonb DEFAULT NULL::jsonb
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
  insert into delivery_events (order_id, assignment_id, event_type, outcome, actor, actor_id, detail)
  values (p_order, p_assignment, p_type, p_outcome, p_actor, p_actor_id, p_detail);
$function$;

REVOKE ALL ON FUNCTION "public"."_delivery_event"(uuid, uuid, text, text, text, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._issue_link (
  p_assignment uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');   -- 256 bits
  v_hours int  := coalesce((select value::int from app_settings where key = 'delivery_link_hours'), 24);
  v_exp   timestamptz := now() + make_interval(hours => v_hours);
  v_order uuid;
begin
  select order_id into v_order from delivery_assignments where id = p_assignment;

  update delivery_link_tokens
     set revoked_at = now()
   where assignment_id = p_assignment and revoked_at is null and consumed_at is null;

  insert into delivery_link_tokens (assignment_id, token_hash, expires_at)
  values (p_assignment, encode(digest(v_token, 'sha256'), 'hex'), v_exp);

  update delivery_assignments set expires_at = v_exp where id = p_assignment;

  perform _delivery_event(v_order, p_assignment, 'link_generated', 'success', 'system', null,
                          jsonb_build_object('expires_at', v_exp));

  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."_issue_link"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._lock_assignment (
  p_assignment uuid
)
  RETURNS public.delivery_assignments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_order uuid;
  v_a     delivery_assignments%rowtype;
begin
  select order_id into v_order from delivery_assignments where id = p_assignment;
  if not found then
    raise exception 'ASSIGNMENT_NOT_FOUND';
  end if;
  perform 1 from orders where id = v_order for update;
  select * into v_a from delivery_assignments where id = p_assignment for update;
  return v_a;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."_lock_assignment"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._lock_order_for_token (
  p_token text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
  select 1
    from orders o
   where o.id = (
     select a.order_id
       from delivery_link_tokens t
       join delivery_assignments a on a.id = t.assignment_id
      where t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
   )
   for update;
$function$;

REVOKE ALL ON FUNCTION "public"."_lock_order_for_token"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public._resolve_link (
  p_token text,
  OUT     o_code text,
  OUT     o_assignment_id uuid
)
  RETURNS record
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  r record;
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 200 then
    o_code := 'LINK_INVALID';
    return;
  end if;

  select a.id as aid, a.status as a_status, t.revoked_at as t_revoked, t.expires_at as t_exp
    into r
    from delivery_link_tokens t
    join delivery_assignments a on a.id = t.assignment_id
   where t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
   for update of a;

  if not found then
    o_code := 'LINK_INVALID';
    return;
  end if;

  o_assignment_id := r.aid;
  if    r.a_status = 'delivered'  then o_code := 'ALREADY_DELIVERED';
  elsif r.a_status = 'cancelled'  then o_code := 'CANCELLED';
  elsif r.a_status = 'reassigned' then o_code := 'REASSIGNED';
  elsif r.a_status = 'failed'     then o_code := 'DELIVERY_FAILED';
  elsif r.t_revoked is not null   then o_code := 'LINK_REVOKED';
  elsif r.t_exp < now()           then o_code := 'LINK_EXPIRED';
  else                                 o_code := 'OK';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."_resolve_link"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.admin_customers (
  p_search text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select jsonb_build_object(
    'total', (
      select count(*) from auth.users u
      left join public.profiles p on p.id = u.id
      where v_search is null
         or u.email ilike '%' || v_search || '%'
         or p.full_name ilike '%' || v_search || '%'
         or p.phone ilike '%' || v_search || '%'
    ),
    'rows', coalesce((
      select jsonb_agg(r) from (
        select
          u.id,
          u.email,
          u.created_at as joined_at,
          p.full_name,
          p.phone,
          coalesce(p.is_admin, false) as is_admin,
          coalesce(s.orders, 0) as orders,
          coalesce(s.spent, 0) as spent,
          s.last_order_at
        from auth.users u
        left join public.profiles p on p.id = u.id
        left join lateral (
          select count(*)::int as orders, sum(o.total) as spent, max(o.created_at) as last_order_at
          from public.orders o
          where o.user_id = u.id
            and o.status not in ('pending_payment', 'cancelled')
            and o.payment_status not in ('failed', 'refunded', 'refund_pending', 'refund_failed')
        ) s on true
        where v_search is null
           or u.email ilike '%' || v_search || '%'
           or p.full_name ilike '%' || v_search || '%'
           or p.phone ilike '%' || v_search || '%'
        order by u.created_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
        offset greatest(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_customers"(text, integer, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_dashboard (
  p_days integer DEFAULT 30
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
declare
  v_days   int := greatest(1, least(coalesce(p_days, 30), 365));
  v_tz     text := 'Africa/Lagos';
  v_today  date := (now() at time zone v_tz)::date;
  v_from   timestamptz := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;
  v_prev   timestamptz := ((v_today - (2 * v_days - 1))::timestamp) at time zone v_tz;
  result   jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  with sales as (
    select o.id, o.total, o.created_at, o.payment_method
    from public.orders o
    where o.status not in ('pending_payment', 'cancelled')
      and o.payment_status not in ('failed', 'refunded', 'refund_pending', 'refund_failed')
  ),
  cur as (select * from sales where created_at >= v_from),
  prev as (select * from sales where created_at >= v_prev and created_at < v_from),
  days as (
    select d::date as day
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
  ),
  daily as (
    select
      days.day,
      coalesce((select sum(c.total) from cur c where (c.created_at at time zone v_tz)::date = days.day), 0) as revenue,
      (select count(*) from cur c where (c.created_at at time zone v_tz)::date = days.day) as orders,
      (select count(*) from auth.users u where (u.created_at at time zone v_tz)::date = days.day) as users
    from days
    order by days.day
  )
  select jsonb_build_object(
    'days', v_days,
    'revenue', coalesce((select sum(total) from cur), 0),
    'orders', (select count(*) from cur),
    'avg_order', coalesce((select round(avg(total)) from cur), 0),
    'prev_revenue', coalesce((select sum(total) from prev), 0),
    'prev_orders', (select count(*) from prev),
    'new_users', (select count(*) from auth.users where created_at >= v_from),
    'prev_new_users', (select count(*) from auth.users where created_at >= v_prev and created_at < v_from),
    'total_users', (select count(*) from auth.users),
    'repeat_customers', (
      select count(*) from (
        select o.user_id from public.orders o
        where o.status not in ('pending_payment', 'cancelled')
          and o.payment_status not in ('failed', 'refunded', 'refund_pending', 'refund_failed')
        group by o.user_id having count(*) > 1
      ) r
    ),
    'waiting_orders', (select count(*) from public.orders where status = 'placed'),
    'cancelled', (select count(*) from public.orders where status = 'cancelled' and created_at >= v_from),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue, 'orders', orders, 'users', users)) from daily), '[]'::jsonb),
    'by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.orders where created_at >= v_from group by status
      ) s
    ), '{}'::jsonb),
    'by_payment', coalesce((
      select jsonb_agg(jsonb_build_object('method', payment_method, 'orders', n, 'revenue', rev)) from (
        select payment_method, count(*) n, sum(total) rev from cur group by payment_method
      ) p
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.name, sum(oi.quantity)::int as units, sum(oi.quantity * oi.unit_price) as revenue
        from public.order_items oi
        join cur c on c.id = oi.order_id
        group by oi.name
        order by sum(oi.quantity * oi.unit_price) desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'low_stock', coalesce((
      select jsonb_agg(l) from (
        select p.id as product_id, p.name, v.color, v.size, v.stock
        from public.product_variants v
        join public.products p on p.id = v.product_id
        where v.is_active and p.is_active and v.stock <= 2
        order by v.stock, p.name
        limit 8
      ) l
    ), '[]'::jsonb),
    'reviews', (
      select jsonb_build_object('count', count(*), 'average', coalesce(round(avg(rating)::numeric, 2), 0))
      from public.store_reviews where is_visible
    )
  ) into result;

  return result;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_dashboard"(integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.admin_delete_product (
  p_product_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  begin
    delete from public.cart_items
      where variant_id in (select id from public.product_variants where product_id = p_product_id);
    delete from public.wishlist_items
      where variant_id in (select id from public.product_variants where product_id = p_product_id);
    delete from public.product_variants where product_id = p_product_id;
    delete from public.products where id = p_product_id;
    return 'deleted';
  exception when foreign_key_violation then
    -- everything above is rolled back; keep the product but take it off sale
    update public.product_variants set is_active = false, stock = 0 where product_id = p_product_id;
    update public.products set is_active = false where id = p_product_id;
    return 'archived';
  end;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_delete_product"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.assign_order_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  candidate bigint;
  tries int := 0;
begin
  if new.order_number is not null then
    return new;
  end if;

  loop
    candidate := 1000000000 + floor(random() * 9000000000)::bigint;
    exit when not exists (select 1 from public.orders where order_number = candidate);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'ORDER_NUMBER_UNAVAILABLE';
    end if;
  end loop;

  new.order_number := candidate;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_rider (
  p_order_id uuid,
  p_name     text,
  p_phone    text,
  p_company  text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_order orders%rowtype;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or trim(coalesce(p_phone, '')) !~ '^[0-9+() -]{7,20}$' then
    raise exception 'INVALID_RIDER_DETAILS';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('placed', 'confirmed', 'out_for_delivery') then
    raise exception 'ORDER_NOT_ASSIGNABLE';     -- unpaid, delivered or cancelled
  end if;
  if exists (select 1 from delivery_assignments
              where order_id = p_order_id and status in ('assigned', 'out_for_delivery', 'qr_verified')) then
    raise exception 'ALREADY_ASSIGNED';         -- use reassign instead
  end if;

  return _create_assignment(p_order_id, p_name, p_phone, p_company);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."assign_rider"(uuid, text, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.browse_products (
  p_seed     bigint,
  p_category uuid    DEFAULT NULL::uuid,
  p_min      numeric DEFAULT NULL::numeric,
  p_max      numeric DEFAULT NULL::numeric,
  p_offset   integer DEFAULT 0,
  p_limit    integer DEFAULT 24
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_assignment (
  p_assignment_id uuid,
  p_reason        text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_a delivery_assignments%rowtype;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_a := _lock_assignment(p_assignment_id);
  if v_a.status not in ('assigned', 'out_for_delivery', 'qr_verified') then
    raise exception 'ASSIGNMENT_CLOSED';
  end if;
  perform _close_assignment(v_a.id, 'cancelled', coalesce(nullif(trim(p_reason), ''), 'Cancelled by admin'),
                            'admin', auth.uid());
end;
$function$;

REVOKE ALL ON FUNCTION "public"."cancel_assignment"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.cancel_order (
  p_order_id uuid,
  p_actor    uuid,
  p_as_admin boolean,
  p_note     text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_order orders%rowtype;
  v_item  record;
begin
  select * into v_order from orders where id = p_order_id for update;

  -- Same answer for "not yours" and "doesn't exist", so nobody can probe other people's orders.
  if not found or (not p_as_admin and v_order.user_id is distinct from p_actor) then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'ORDER_CLOSED';
  end if;
  if not p_as_admin and v_order.status not in ('pending_payment', 'placed', 'confirmed') then
    raise exception 'TOO_LATE';
  end if;

  for v_item in select variant_id, quantity from order_items where order_id = v_order.id loop
    update product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
  end loop;

  perform set_config('app.order_note', coalesce(trim(p_note), ''), true);  -- this transaction only

  update orders
     set status = 'cancelled',
         expires_at = null,
         payment_status = case
           when payment_method = 'online' and payment_status = 'pending' then 'failed'
           else payment_status   -- a PAID order stays 'paid' until the refund is actually started
         end
   where id = v_order.id;

  perform set_config('app.order_note', '', true);

  return jsonb_build_object(
    'order_id',          v_order.id,
    'order_number',      v_order.order_number,
    'total',             v_order.total,
    'payment_method',    v_order.payment_method,
    'payment_status',    v_order.payment_status,      -- as it was BEFORE cancelling
    'payment_reference', v_order.payment_reference
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."cancel_order"(uuid, uuid, boolean, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.check_address_zone()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not exists (select 1 from delivery_zones where id = new.zone_id and kind = 'home') then
    raise exception 'Saved addresses must use a home delivery option';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_refund_details_flag()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.kind = 'refund_needs_attention' and new.resolved_at is not null and old.resolved_at is null and new.order_id is not null then
    update orders set refund_needs_details = false where id = new.order_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_assignment_on_order_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_id uuid;
begin
  if new.status in ('cancelled', 'delivered') and new.status is distinct from old.status then
    for v_id in
      select id from delivery_assignments
       where order_id = new.id and status in ('assigned', 'out_for_delivery', 'qr_verified')
    loop
      if new.status = 'delivered' then
        perform _delivery_event(new.id, v_id, 'manual_override', 'info', 'admin', auth.uid(),
                                jsonb_build_object('note', 'Order marked delivered by hand, without QR verification'));
      end if;
      perform _close_assignment(
        v_id, 'cancelled',
        case when new.status = 'cancelled' then 'Order cancelled'
             else 'Order marked delivered manually' end,
        'system', null);
    end loop;
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."close_assignment_on_order_change"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.create_delivery_qr (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_order   orders%rowtype;
  v_a       delivery_assignments%rowtype;
  v_token   text := encode(gen_random_bytes(24), 'hex');   -- 192 bits
  v_minutes int  := coalesce((select value::int from app_settings where key = 'delivery_qr_minutes'), 5);
  v_exp     timestamptz := now() + make_interval(mins => v_minutes);
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Same answer for "not yours" and "doesn't exist".
  select * into v_order from orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into v_a from delivery_assignments
   where order_id = p_order_id and status in ('assigned', 'out_for_delivery', 'qr_verified')
   for update;
  if not found then raise exception 'NO_ACTIVE_DELIVERY'; end if;
  if v_a.status = 'qr_verified' then raise exception 'ALREADY_VERIFIED'; end if;

  -- Stop someone hammering the button.
  if (select count(*) from delivery_qr_tokens
       where assignment_id = v_a.id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'TOO_MANY_CODES';
  end if;

  -- Only one live code at a time: a new one kills the old one.
  update delivery_qr_tokens
     set expires_at = least(expires_at, now())
   where assignment_id = v_a.id and consumed_at is null;

  insert into delivery_qr_tokens (order_id, assignment_id, customer_id, token_hash, expires_at)
  values (p_order_id, v_a.id, auth.uid(), encode(digest(v_token, 'sha256'), 'hex'), v_exp);

  perform _delivery_event(p_order_id, v_a.id, 'qr_generated', 'success', 'customer', auth.uid(), null);

  -- expires_in_seconds lets the phone count down without trusting its own clock.
  return jsonb_build_object('token', v_token, 'expires_at', v_exp, 'expires_in_seconds', v_minutes * 60);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."create_delivery_qr"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.deactivate_my_account()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
begin
  if auth.uid() is null then
    raise exception 'NOT_LOGGED_IN';
  end if;

  if public.is_admin() then
    raise exception 'ADMIN_ACCOUNT';
  end if;

  if exists (
    select 1 from public.orders
    where user_id = auth.uid()
      and status in ('pending_payment', 'placed', 'confirmed', 'out_for_delivery')
  ) then
    raise exception 'ACTIVE_ORDERS';
  end if;

  update public.profiles set deactivated_at = now() where id = auth.uid();
  update auth.users set banned_until = 'infinity' where id = auth.uid();
end;
$function$;

REVOKE ALL ON FUNCTION "public"."deactivate_my_account"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.delivery_otp_sms_result (
  p_otp_id uuid,
  p_ok     boolean,
  p_hint   text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_t delivery_qr_tokens%rowtype;
begin
  select * into v_t from delivery_qr_tokens
   where id = p_otp_id and kind = 'otp' and consumed_at is null and verified_at is null;
  if not found then
    return;
  end if;

  if p_ok then
    perform _delivery_event(v_t.order_id, v_t.assignment_id, 'otp_sms_sent', 'success', 'system', null,
                            jsonb_build_object('phone_hint', left(coalesce(p_hint, ''), 20)));
  else
    delete from delivery_qr_tokens where id = p_otp_id;
    perform _delivery_event(v_t.order_id, v_t.assignment_id, 'otp_sms_failed', 'failure', 'system', null,
                            jsonb_build_object('reason', left(coalesce(p_hint, 'unknown'), 40)));
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."delivery_otp_sms_result"(uuid, boolean, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.fill_campus_delivery_coords()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.delivery_lat is null and new.delivery_lon is null and new.delivery_zone is not null then
    select z.latitude, z.longitude
      into new.delivery_lat, new.delivery_lon
      from public.delivery_zones z
     where z.kind = 'campus' and z.name = new.delivery_zone and z.latitude is not null and z.longitude is not null
     limit 1;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_referral_reward()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_min       numeric := (select value::numeric from app_settings where key = 'referral_min_order');
  v_target    int     := (select value::int     from app_settings where key = 'referral_target');
  v_referrer  uuid;
  v_qualified int;
  v_earned    int;
begin
  if new.status <> 'delivered' or old.status = 'delivered' or new.subtotal < v_min then
    return new;
  end if;

  select referred_by into v_referrer from profiles where id = new.user_id;
  if v_referrer is null then
    return new;
  end if;

  -- Only the buyer's first qualifying order counts toward the referrer.
  if exists (
    select 1 from orders
    where user_id = new.user_id and id <> new.id and status = 'delivered' and subtotal >= v_min
  ) then
    return new;
  end if;

  select count(distinct o.user_id) into v_qualified
  from orders o
  join profiles p on p.id = o.user_id
  where p.referred_by = v_referrer and o.status = 'delivered' and o.subtotal >= v_min;

  select count(*) into v_earned from coupons where user_id = v_referrer and source = 'referral';

  -- One coupon for every block of 10 qualified friends.
  if v_qualified / v_target > v_earned then
    perform issue_coupon(v_referrer, 'referral');
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_referrer uuid;
  v_code     text;
begin
  select id into v_referrer
  from profiles
  where referral_code = upper(new.raw_user_meta_data->>'referral_code');

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;

  insert into profiles (id, full_name, phone, referral_code, referred_by)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    v_code,
    v_referrer
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.issue_coupon (
  p_user_id uuid,
  p_source  text DEFAULT 'referral'::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_budget  numeric := coalesce((select value::numeric from app_settings where key = 'coupon_max_cost'), 0);
  v_days    int     := coalesce((select value::int     from app_settings where key = 'coupon_valid_days'), 30);
  v_total   numeric;
  v_pick    numeric;
  v_running numeric := 0;
  v_t       coupon_templates%rowtype;
  v_code    text;
  v_id      uuid;
begin
  -- Only rewards that can't cost more than the budget are even candidates.
  select coalesce(sum(weight), 0) into v_total
  from coupon_templates
  where is_active and weight > 0 and max_discount <= v_budget;

  if v_total = 0 then
    -- Don't raise an error: this runs inside an order update, and the order must still succeed.
    -- The customer's reward is simply retried at their friend's next qualifying order.
    raise warning 'issue_coupon: no affordable active coupon in the pool (budget %)', v_budget;
    return null;
  end if;

  -- A weighted random pick: a template with weight 40 is twice as likely as one with 20.
  v_pick := random() * v_total;
  for v_t in
    select * from coupon_templates
    where is_active and weight > 0 and max_discount <= v_budget
    order by created_at, id
  loop
    v_running := v_running + v_t.weight;
    exit when v_pick < v_running;
  end loop;

  loop
    v_code := 'LOOMA-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from coupons where code = v_code);
  end loop;

  insert into coupons (user_id, template_id, code, name, kind, value, max_discount, min_order, source, expires_at)
  values (p_user_id, v_t.id, v_code, v_t.name, v_t.kind, v_t.value, v_t.max_discount, v_t.min_order,
          p_source, now() + make_interval(days => v_days))
  returning id into v_id;

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."issue_coupon"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.link_review_to_products()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.store_review_products (review_id, product_id)
  select distinct new.id, pv.product_id
  from public.order_items oi
  join public.product_variants pv on pv.id = oi.variant_id
  where oi.order_id = new.order_id
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_default_address()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if tg_op = 'INSERT' and not exists (select 1 from addresses where user_id = new.user_id) then
    new.is_default := true;
  end if;

  if new.is_default then
    update addresses set is_default = false
     where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid (
  p_order_id  uuid,
  p_reference text DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update orders
     set payment_status = 'paid',
         status = 'placed',
         expires_at = null,
         payment_reference = coalesce(p_reference, payment_reference),
         paid_at = now()
   where id = p_order_id
     and status = 'pending_payment';
  return found;   -- false if it was already handled, or the hold expired first
end;
$function$;

REVOKE ALL ON FUNCTION "public"."mark_order_paid"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.move_sold_out_cart_items()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if (new.stock <= 0 and old.stock > 0) or (not new.is_active and old.is_active) then
    insert into wishlist_items (user_id, variant_id, auto_moved_at)
    select user_id, new.id, now()
    from cart_items
    where variant_id = new.id
    on conflict (user_id, variant_id) do update set auto_moved_at = now();

    delete from cart_items where variant_id = new.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_delivery (
  p_order_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
  select jsonb_build_object(
           'status',           a.status,
           'rider_name',       a.rider_name,
           'rider_phone',      a.rider_phone,
           'dispatch_company', a.dispatch_company,
           'active',           a.status in ('assigned', 'out_for_delivery', 'qr_verified'),
           'qr_verified',      a.status = 'qr_verified',
           'delivered_at',     a.completed_at)
    from delivery_assignments a
    join orders o on o.id = a.order_id
   where a.order_id = p_order_id
     and o.user_id = auth.uid()
   order by a.created_at desc
   limit 1;
$function$;

REVOKE ALL ON FUNCTION "public"."my_delivery"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.my_referral_progress()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select count(distinct o.user_id)::int
  from orders o
  join profiles p on p.id = o.user_id
  where p.referred_by = auth.uid()
    and o.status = 'delivered'
    and o.subtotal >= (select value::numeric from app_settings where key = 'referral_min_order');
$function$;

CREATE OR REPLACE FUNCTION public.normalize_search_text (
  t text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
  select btrim(regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$function$;

REVOKE ALL ON FUNCTION "public"."normalize_search_text"(text) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.place_order (
  p_items          jsonb,
  p_payment_method text,
  p_zone_id        uuid,
  p_phone          text,
  p_coupon_id      uuid  DEFAULT NULL::uuid,
  p_quote_id       uuid  DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_qty      int;
  v_subtotal numeric(12,2) := 0;
  v_max_unit numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_fee      numeric(12,2);
  v_variant  product_variants%rowtype;
  v_product  products%rowtype;
  v_zone     delivery_zones%rowtype;
  v_coupon   coupons%rowtype;
  v_quote    delivery_quotes%rowtype;
  v_address  text := '';
  v_note     text;
  v_lat      numeric(9,6);
  v_lon      numeric(9,6);
  v_dist     int;
  v_olat     numeric(9,6);
  v_olon     numeric(9,6);
  v_hold     int := (select value::int from app_settings where key = 'payment_hold_minutes');
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_payment_method not in ('online', 'on_delivery') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  select * into v_zone from delivery_zones where id = p_zone_id and is_active;
  if not found then
    raise exception 'INVALID_ZONE';
  end if;

  if v_zone.kind = 'home' then
    -- Home delivery: the price must come from a quote the SERVER made for this customer.
    if p_quote_id is null then
      raise exception 'QUOTE_REQUIRED';
    end if;
    select * into v_quote from delivery_quotes where id = p_quote_id and user_id = auth.uid();
    if not found then
      raise exception 'QUOTE_INVALID';
    end if;
    if v_quote.expires_at < now() then
      raise exception 'QUOTE_EXPIRED';
    end if;

    v_fee     := v_quote.fee;
    v_address := v_quote.address;
    v_note    := v_quote.note;
    v_lat     := v_quote.lat;
    v_lon     := v_quote.lon;
    v_dist    := v_quote.distance_m;
    v_olat    := v_quote.origin_lat;
    v_olon    := v_quote.origin_lon;
  else
    -- A campus option: a flat fee and no address.
    v_fee := v_zone.fee;
  end if;

  insert into orders (
    user_id, payment_method, status, delivery_zone, delivery_fee, delivery_address, delivery_note,
    delivery_lat, delivery_lon, delivery_distance_m, origin_lat, origin_lon, phone, expires_at
  )
  values (
    auth.uid(),
    p_payment_method,
    case when p_payment_method = 'online' then 'pending_payment' else 'placed' end,
    v_zone.name,
    v_fee,
    v_address,
    v_note,
    v_lat, v_lon, v_dist, v_olat, v_olon,
    p_phone,
    case when p_payment_method = 'online' then now() + make_interval(mins => v_hold) end
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;
    if not (v_item ? 'variant_id') then raise exception 'INVALID_ITEM'; end if;

    delete from cart_items
     where user_id = auth.uid() and variant_id = (v_item->>'variant_id')::uuid;

    update product_variants
       set stock = stock - v_qty
     where id = (v_item->>'variant_id')::uuid
       and is_active
       and stock >= v_qty
    returning * into v_variant;

    if not found then
      raise exception 'OUT_OF_STOCK:%', v_item->>'variant_id';
    end if;

    select * into v_product from products where id = v_variant.product_id and is_active;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_variant.product_id;
    end if;

    insert into order_items (order_id, variant_id, name, quantity, unit_price)
    values (
      v_order_id, v_variant.id,
      trim(v_product.name || ' ' || coalesce(v_variant.color, '') || ' ' || coalesce(v_variant.size, '')),
      v_qty, v_product.price
    );
    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_max_unit := greatest(v_max_unit, v_product.price);
  end loop;

  if p_coupon_id is not null then
    select * into v_coupon from coupons where id = p_coupon_id and user_id = auth.uid() for update;
    if not found then
      raise exception 'COUPON_INVALID';
    end if;
    if v_coupon.used_at is not null then
      raise exception 'COUPON_USED';
    end if;
    if v_coupon.expires_at < now() then
      raise exception 'COUPON_EXPIRED';
    end if;
    if v_subtotal < v_coupon.min_order then
      raise exception 'COUPON_MIN_ORDER';
    end if;

    -- Every case ends in "least(..., max_discount)": no coupon can cost more than its cap.
    -- A free-delivery coupon now covers the real (distance-based) fee, up to that cap.
    v_discount := case v_coupon.kind
      when 'free_delivery'    then least(v_fee, v_coupon.max_discount)
      when 'fixed_off'        then least(v_coupon.value, v_coupon.max_discount, v_subtotal)
      when 'percent_checkout' then least(round(v_subtotal * v_coupon.value / 100), v_coupon.max_discount)
      when 'percent_item'     then least(round(v_max_unit * v_coupon.value / 100), v_coupon.max_discount)
      else 0
    end;

    update coupons
       set used_at = now(), used_order_id = v_order_id, discount_applied = v_discount
     where id = v_coupon.id;
  end if;

  -- Setting the total is the LAST step: the "new order" alert is triggered by it.
  update orders
     set subtotal = v_subtotal,
         discount = v_discount,
         coupon_id = p_coupon_id,
         total = greatest(0, v_subtotal + v_fee - v_discount)
   where id = v_order_id;

  return v_order_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."place_order"(jsonb, text, uuid, text, uuid, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.push_cart_candidates (
  p_stage integer
)
  RETURNS TABLE (
    user_id      uuid,
    last_change  timestamp with time zone,
    item_count   integer,
    first_item   text,
    has_last_one boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
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

REVOKE ALL ON FUNCTION "public"."push_cart_candidates"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.push_inactive_candidates()
  RETURNS TABLE (
    user_id     uuid,
    last_active timestamp with time zone,
    new_items   integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
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

REVOKE ALL ON FUNCTION "public"."push_inactive_candidates"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.push_promo_audience()
  RETURNS TABLE (
    user_id  uuid,
    over_cap boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  with s as (select * from public.push_settings where id = 1)
  select u.user_id,
         (select count(*) from public.push_log l
           where l.user_id = u.user_id and l.kind = 'promo' and l.sent_at > now() - interval '7 days') >= s.promo_weekly_cap
    from (select distinct sub.user_id from public.customer_push_subscriptions sub) u, s
   where not exists (select 1 from public.push_preferences pp where pp.user_id = u.user_id and not pp.marketing);
$function$;

REVOKE ALL ON FUNCTION "public"."push_promo_audience"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.queue_customer_notification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_url    text;
  v_secret text;
begin
  select replace(value, 'notify-order', 'notify-customer') into v_url
    from private_settings where key = 'notify_url';
  select value into v_secret from private_settings where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'orders',
      'record', jsonb_build_object(
        'id', new.id,
        'user_id', new.user_id,
        'order_number', new.order_number,
        'status', new.status,
        'payment_method', new.payment_method,
        'payment_status', new.payment_status
      ),
      'old_record', jsonb_build_object('status', old.status, 'payment_status', old.payment_status)
    )
  );
  return new;

exception when others then
  -- Never let a notification problem block an order update.
  raise warning 'customer notification failed: %', sqlerrm;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_order_notification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_url text;
v_secret text;
begin
select value into v_url
from private_settings
where key = 'notify_url';
select value into v_secret
from private_settings
where key = 'notify_secret';
if v_url is null
or v_secret is null then return new;
end if;
perform net.http_post(
  url := v_url,
  headers := jsonb_build_object(
    'Content-Type',
    'application/json',
    'x-webhook-secret',
    v_secret
  ),
  body := jsonb_build_object('order_id', new.id)
);
return new;
exception
when others then -- Never let a notification problem block an order.
raise warning 'order notification failed: %',
sqlerrm;
return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_rider (
  p_assignment_id uuid,
  p_name          text,
  p_phone         text,
  p_company       text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_a delivery_assignments%rowtype;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or trim(coalesce(p_phone, '')) !~ '^[0-9+() -]{7,20}$' then
    raise exception 'INVALID_RIDER_DETAILS';
  end if;
  v_a := _lock_assignment(p_assignment_id);
  if v_a.status not in ('assigned', 'out_for_delivery', 'qr_verified') then
    raise exception 'ASSIGNMENT_CLOSED';
  end if;
  perform _close_assignment(v_a.id, 'reassigned', 'Reassigned by admin', 'admin', auth.uid());
  return _create_assignment(v_a.order_id, p_name, p_phone, p_company);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."reassign_rider"(uuid, text, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.record_order_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if tg_op = 'INSERT' then
    insert into order_events (order_id, status) values (new.id, new.status);
  elsif new.status is distinct from old.status then
    -- set_order_status() passes the owner's note through this transaction-only setting.
    insert into order_events (order_id, status, note)
    values (new.id, new.status, nullif(current_setting('app.order_note', true), ''));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_product_search (
  p_id uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."refresh_product_search"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.register_push_subscription (
  p_subscription jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_endpoint text := p_subscription ->> 'endpoint';
begin
  if auth.uid() is null then
    raise exception 'NOT_LOGGED_IN';
  end if;
  if v_endpoint is null or v_endpoint not like 'https://%' or p_subscription -> 'keys' is null then
    raise exception 'INVALID_SUBSCRIPTION';
  end if;

  insert into public.customer_push_subscriptions (user_id, endpoint, subscription)
  values (auth.uid(), v_endpoint, p_subscription)
  on conflict (endpoint)
  do update set user_id = excluded.user_id, subscription = excluded.subscription;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."register_push_subscription"(jsonb) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.release_expired_orders()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_order record;
  v_item  record;
  v_count int := 0;
begin
  for v_order in
    select id from orders
    where status = 'pending_payment' and expires_at < now()
    for update skip locked
  loop
    for v_item in select variant_id, quantity from order_items where order_id = v_order.id loop
      update product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
    end loop;

    update orders
       set status = 'cancelled', payment_status = 'failed', expires_at = null
     where id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."release_expired_orders"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.release_order_coupon()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update coupons
     set used_at = null, used_order_id = null, discount_applied = null
   where used_order_id = new.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_delivery_link (
  p_assignment_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_a delivery_assignments%rowtype;
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_a := _lock_assignment(p_assignment_id);
  if v_a.status not in ('assigned', 'out_for_delivery', 'qr_verified') then
    raise exception 'ASSIGNMENT_CLOSED';
  end if;
  perform _delivery_event(v_a.order_id, v_a.id, 'link_revoked', 'success', 'admin', auth.uid(), null);
  return jsonb_build_object('assignment_id', v_a.id) || _issue_link(v_a.id);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."replace_delivery_link"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.review_media_limits()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.kind = 'image' and (select count(*) from public.review_media where review_id = new.review_id and kind = 'image') >= 4 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;
  if new.kind = 'video' and (select count(*) from public.review_media where review_id = new.review_id and kind = 'video') >= 1 then
    raise exception 'TOO_MANY_VIDEOS';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rider_complete_delivery (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  d  jsonb;
  o  record;
begin
  -- Same link check the rider page uses; dead links fall through to the original function's answer.
  d := public.rider_get_delivery(p_token)::jsonb;
  if coalesce((d ->> 'ok')::boolean, false) then
    select payment_method, payment_status into o
      from public.orders
     where order_number = (d -> 'order' ->> 'order_number')::bigint;
    if found and o.payment_method = 'on_delivery' and o.payment_status is distinct from 'paid' then
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED');
    end if;
  end if;
  return public.rider_complete_delivery_core(p_token)::jsonb;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rider_complete_delivery_core (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code    text;
  v_id      uuid;
  v_a       delivery_assignments%rowtype;
  v_qr      delivery_qr_tokens%rowtype;
  v_o       orders%rowtype;
  v_confirm int := coalesce((select value::int from app_settings where key = 'delivery_confirm_minutes'), 10);
begin
  perform _lock_order_for_token(p_token);          -- order first, then assignment
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;
  select * into v_a from delivery_assignments where id = v_id;

  if v_a.status <> 'qr_verified' then
    return jsonb_build_object('ok', false, 'code', 'NOT_VERIFIED');
  end if;

  -- The scan went stale: send the rider back to scan again.
  if v_a.qr_verified_at < now() - make_interval(mins => v_confirm) then
    -- Go back to where it really was: "out_for_delivery" only if the rider had already started.
    update delivery_assignments
       set status = case when (select status from orders where id = v_a.order_id) = 'out_for_delivery'
                         then 'out_for_delivery' else 'assigned' end,
           qr_verified_at = null
     where id = v_a.id;
    update delivery_qr_tokens set verified_at = null where assignment_id = v_a.id and consumed_at is null;
    perform _delivery_event(v_a.order_id, v_a.id, 'verification_expired', 'failure', 'rider', null, null);
    return jsonb_build_object('ok', false, 'code', 'VERIFICATION_EXPIRED');
  end if;

  select * into v_qr from delivery_qr_tokens
   where assignment_id = v_a.id and verified_at is not null and consumed_at is null
   order by verified_at desc limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_VERIFIED');
  end if;

  select * into v_o from orders where id = v_a.order_id;   -- already locked above
  if v_o.status not in ('placed', 'confirmed', 'out_for_delivery') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_CLOSED');
  end if;

  -- Close the assignment FIRST, so the order trigger sees nothing live to override.
  update delivery_assignments set status = 'delivered', completed_at = now() where id = v_a.id;
  update delivery_qr_tokens  set consumed_at = now() where id = v_qr.id;
  update delivery_link_tokens set consumed_at = now() where assignment_id = v_a.id and consumed_at is null;

  perform set_config('app.order_note', 'Delivered. Confirmed with the customer''s QR code.', true);
  update orders
     set status = 'delivered',
         expires_at = null,
         payment_status = case when payment_method = 'on_delivery' then 'paid' else payment_status end
   where id = v_o.id;
  perform set_config('app.order_note', '', true);

  perform _delivery_event(v_a.order_id, v_a.id, 'delivery_completed', 'success', 'rider', null,
                          jsonb_build_object('rider_name', v_a.rider_name, 'rider_phone', v_a.rider_phone));

  return jsonb_build_object('ok', true, 'code', 'DELIVERED', 'delivered_at', now());
end;
$function$;

REVOKE ALL ON FUNCTION "public"."rider_complete_delivery_core"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rider_get_delivery (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code text;
  v_id   uuid;
  v_a    delivery_assignments%rowtype;
  v_o    orders%rowtype;
  v_name text;
begin
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  select * into v_a from delivery_assignments where id = v_id;
  select * into v_o from orders where id = v_a.order_id;
  select split_part(coalesce(nullif(trim(full_name), ''), 'Customer'), ' ', 1)
    into v_name from profiles where id = v_o.user_id;

  -- Log the first open, then at most once per 10 minutes (not every refresh).
  if not exists (select 1 from delivery_events
                  where assignment_id = v_a.id and event_type = 'rider_opened'
                    and created_at > now() - interval '10 minutes') then
    perform _delivery_event(v_a.order_id, v_a.id, 'rider_opened', 'info', 'rider', null, null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'assignment', jsonb_build_object(
      'status', v_a.status, 'rider_name', v_a.rider_name, 'rider_phone', v_a.rider_phone,
      'dispatch_company', v_a.dispatch_company, 'link_expires_at', v_a.expires_at),
    'order', jsonb_build_object(
      'order_number',    v_o.order_number,
      'customer_name',   v_name,          -- first name only
      'customer_phone',  v_o.phone,
      'delivery_zone',   v_o.delivery_zone,
      'delivery_address', v_o.delivery_address,
      'delivery_note',   v_o.delivery_note,
      'delivery_lat',    v_o.delivery_lat,
      'delivery_lon',    v_o.delivery_lon,
      'amount_to_collect',
        case when v_o.payment_method = 'on_delivery' and v_o.payment_status <> 'paid' then v_o.total else 0 end),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity))
                         from order_items i where i.order_id = v_o.id), '[]'::jsonb));
end;
$function$;

REVOKE ALL ON FUNCTION "public"."rider_get_delivery"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rider_report_failed (
  p_token  text,
  p_reason text,
  p_note   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code text;
  v_id   uuid;
begin
  if p_reason not in ('customer_unavailable', 'customer_unreachable', 'wrong_address', 'customer_refused', 'other') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON');
  end if;

  perform _lock_order_for_token(p_token);
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  perform _close_assignment(
    v_id, 'failed',
    p_reason || coalesce(': ' || left(nullif(trim(p_note), ''), 200), ''),
    'rider', null);
  return jsonb_build_object('ok', true, 'code', 'FAILED_RECORDED');
end;
$function$;

CREATE OR REPLACE FUNCTION public.rider_request_otp (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code    text;
  v_id      uuid;
  v_a       delivery_assignments%rowtype;
  v_o       orders%rowtype;
  v_otp_id  uuid := gen_random_uuid();
  v_otp     text := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_minutes int  := coalesce((select value::int from app_settings where key = 'delivery_otp_minutes'), 10);
  v_cool    int  := coalesce((select value::int from app_settings where key = 'delivery_otp_cooldown_seconds'), 60);
  v_max     int  := coalesce((select value::int from app_settings where key = 'delivery_otp_max_sms'), 3);
  v_last    timestamptz;
  v_wait    int;
begin
  perform _lock_order_for_token(p_token);               -- order first, then assignment
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  select * into v_a from delivery_assignments where id = v_id;
  if v_a.status = 'qr_verified' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_VERIFIED');
  end if;

  select * into v_o from orders where id = v_a.order_id;
  if char_length(regexp_replace(coalesce(v_o.phone, ''), '\D', '', 'g')) < 7 then
    return jsonb_build_object('ok', false, 'code', 'NO_PHONE');
  end if;

  -- Cool-down between texts.
  select max(created_at) into v_last from delivery_qr_tokens where assignment_id = v_a.id and kind = 'otp';
  if v_last is not null and v_last > now() - make_interval(secs => v_cool) then
    v_wait := ceil(extract(epoch from (v_last + make_interval(secs => v_cool) - now())))::int;
    return jsonb_build_object('ok', false, 'code', 'OTP_COOLDOWN', 'retry_after_seconds', v_wait);
  end if;

  -- Cap per delivery, so nobody can run up the SMS bill.
  if (select count(*) from delivery_qr_tokens
       where assignment_id = v_a.id and kind = 'otp' and created_at > now() - interval '1 hour') >= v_max then
    return jsonb_build_object('ok', false, 'code', 'OTP_LIMIT');
  end if;

  -- A new code replaces the previous code (a customer's live QR is left alone).
  update delivery_qr_tokens
     set expires_at = least(expires_at, now())
   where assignment_id = v_a.id and kind = 'otp' and consumed_at is null;

  insert into delivery_qr_tokens (id, order_id, assignment_id, customer_id, token_hash, expires_at, kind)
  values (v_otp_id, v_o.id, v_a.id, v_o.user_id,
          encode(digest(v_otp_id::text || ':' || v_otp, 'sha256'), 'hex'),
          now() + make_interval(mins => v_minutes), 'otp');

  perform _delivery_event(v_o.id, v_a.id, 'otp_requested', 'info', 'rider', null, null);

  return jsonb_build_object(
    'ok', true, 'code', 'OTP_ISSUED',
    'otp_id', v_otp_id, 'otp', v_otp, 'phone', v_o.phone,
    'order_number', v_o.order_number,
    'expires_in_seconds', v_minutes * 60,
    'cooldown_seconds', v_cool);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."rider_request_otp"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rider_start_delivery (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code text;
  v_id   uuid;
  v_a    delivery_assignments%rowtype;
  v_o    orders%rowtype;
begin
  perform _lock_order_for_token(p_token);
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  select * into v_a from delivery_assignments where id = v_id;
  if v_a.status <> 'assigned' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_STARTED');   -- harmless repeat
  end if;

  update delivery_assignments set status = 'out_for_delivery' where id = v_a.id;

  select * into v_o from orders where id = v_a.order_id;
  if v_o.status in ('placed', 'confirmed') then
    perform set_config('app.order_note',
      'Your order is on the way with ' || v_a.rider_name || ' (' || v_a.rider_phone || ').', true);
    update orders set status = 'out_for_delivery' where id = v_o.id;
    perform set_config('app.order_note', '', true);
  end if;

  perform _delivery_event(v_a.order_id, v_a.id, 'delivery_started', 'success', 'rider', null, null);
  return jsonb_build_object('ok', true, 'code', 'STARTED');
end;
$function$;

CREATE OR REPLACE FUNCTION public.rider_unpaid_pod (
  p_token text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare d jsonb; o record;
begin
  d := public.rider_get_delivery(p_token)::jsonb;
  if not coalesce((d ->> 'ok')::boolean, false) then return false; end if;
  select payment_method, payment_status into o from public.orders
   where order_number = (d -> 'order' ->> 'order_number')::bigint;
  return found and o.payment_method = 'on_delivery' and o.payment_status is distinct from 'paid';
end $function$;

REVOKE ALL ON FUNCTION "public"."rider_unpaid_pod"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rider_verify_otp (
  p_token text,
  p_code  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if public.rider_unpaid_pod(p_token) then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED');
  end if;
  return public.rider_verify_otp_core(p_token, p_code)::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.rider_verify_otp_core (
  p_token text,
  p_code  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code   text;
  v_id     uuid;
  v_a      delivery_assignments%rowtype;
  v_t      delivery_qr_tokens%rowtype;
  v_digits text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');   -- allow "123 456"
  v_max    int  := coalesce((select value::int from app_settings where key = 'delivery_max_failed_scans'), 5);
  v_tries  int  := coalesce((select value::int from app_settings where key = 'delivery_otp_max_attempts'), 3);
  v_fails  int;
  v_fail   text;
  v_left   int;
begin
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;
  select * into v_a from delivery_assignments where id = v_id;

  -- A typo in the format isn't a guess: don't count it.
  if char_length(v_digits) <> 6 then
    return jsonb_build_object('ok', false, 'code', 'OTP_FORMAT');
  end if;

  -- Assignment-wide limit, shared with QR failures.
  select count(*) into v_fails from delivery_events
   where assignment_id = v_a.id and event_type = 'qr_verification_failed'
     and created_at > now() - interval '10 minutes';
  if v_fails >= v_max then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY_ATTEMPTS');
  end if;

  -- Only the newest code can ever be used.
  select * into v_t from delivery_qr_tokens
   where assignment_id = v_a.id and kind = 'otp' and consumed_at is null
   order by created_at desc limit 1
   for update;

  -- Already accepted: harmless repeat.
  if found and v_t.verified_at is not null and v_a.status = 'qr_verified' then
    return jsonb_build_object('ok', true, 'code', 'QR_VERIFIED',
      'confirm_within_seconds',
        coalesce((select value::int from app_settings where key = 'delivery_confirm_minutes'), 10) * 60);
  end if;

  if not found then
    v_fail := 'OTP_INVALID';                       -- no live code: looks the same as a wrong one
  elsif v_t.expires_at < now() then
    v_fail := 'OTP_EXPIRED';
  elsif v_t.attempts >= v_tries then
    v_fail := 'OTP_LOCKED';
  elsif encode(digest(v_t.id::text || ':' || v_digits, 'sha256'), 'hex') <> v_t.token_hash then
    update delivery_qr_tokens set attempts = attempts + 1 where id = v_t.id;
    v_left := v_tries - (v_t.attempts + 1);
    v_fail := case when v_left <= 0 then 'OTP_LOCKED' else 'OTP_INVALID' end;
  end if;

  if v_fail is not null then
    perform _delivery_event(v_a.order_id, v_a.id, 'qr_verification_failed', 'failure', 'rider', null,
                            jsonb_build_object('code', v_fail, 'method', 'otp'));
    return jsonb_build_object('ok', false, 'code', v_fail, 'attempts_left', greatest(coalesce(v_left, 0), 0));
  end if;

  update delivery_qr_tokens set verified_at = coalesce(verified_at, now()) where id = v_t.id;

  if v_a.status <> 'qr_verified' then
    update delivery_assignments set status = 'qr_verified', qr_verified_at = now() where id = v_a.id;
    perform _delivery_event(v_a.order_id, v_a.id, 'qr_verified', 'success', 'rider', null,
                            jsonb_build_object('method', 'otp'));
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'QR_VERIFIED',
    'confirm_within_seconds',
      coalesce((select value::int from app_settings where key = 'delivery_confirm_minutes'), 10) * 60);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."rider_verify_otp_core"(text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rider_verify_qr (
  p_token text,
  p_qr    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if public.rider_unpaid_pod(p_token) then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED');
  end if;
  return public.rider_verify_qr_core(p_token, p_qr)::jsonb;
end $function$;

CREATE OR REPLACE FUNCTION public.rider_verify_qr_core (
  p_token text,
  p_qr    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  v_code  text;
  v_id    uuid;
  v_a     delivery_assignments%rowtype;
  v_qr    delivery_qr_tokens%rowtype;
  v_max   int := coalesce((select value::int from app_settings where key = 'delivery_max_failed_scans'), 5);
  v_fails int;
  v_fail  text;
begin
  select * into v_code, v_id from _resolve_link(p_token);
  if v_code <> 'OK' then
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;
  select * into v_a from delivery_assignments where id = v_id;

  select count(*) into v_fails from delivery_events
   where assignment_id = v_a.id and event_type = 'qr_verification_failed'
     and created_at > now() - interval '10 minutes';
  if v_fails >= v_max then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY_ATTEMPTS');
  end if;

  select * into v_qr from delivery_qr_tokens
   where token_hash = encode(digest(coalesce(p_qr, ''), 'sha256'), 'hex') and kind = 'qr';

  if not found or v_qr.assignment_id <> v_a.id then
    v_fail := 'QR_INVALID';
  elsif v_qr.consumed_at is not null then
    v_fail := 'QR_USED';
  elsif v_qr.expires_at < now() then
    v_fail := 'QR_EXPIRED';
  end if;

  if v_fail is not null then
    perform _delivery_event(v_a.order_id, v_a.id, 'qr_verification_failed', 'failure', 'rider', null,
                            jsonb_build_object('code', v_fail, 'method', 'qr'));
    return jsonb_build_object('ok', false, 'code', v_fail);
  end if;

  update delivery_qr_tokens set verified_at = coalesce(verified_at, now()) where id = v_qr.id;

  if v_a.status <> 'qr_verified' then
    update delivery_assignments set status = 'qr_verified', qr_verified_at = now() where id = v_a.id;
    perform _delivery_event(v_a.order_id, v_a.id, 'qr_verified', 'success', 'rider', null,
                            jsonb_build_object('method', 'qr'));
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'QR_VERIFIED',
    'confirm_within_seconds',
      coalesce((select value::int from app_settings where key = 'delivery_confirm_minutes'), 10) * 60);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."rider_verify_qr_core"(text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.run_payment_reconciliation()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_url    text;
  v_secret text;
begin
  select replace(value, '/notify-order', '/reconcile-payments') into v_url    from private_settings where key = 'notify_url';
  select value                                                 into v_secret from private_settings where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('hours', 24),
    timeout_milliseconds := 55000
  );
end;
$function$;

REVOKE ALL ON FUNCTION "public"."run_payment_reconciliation"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.search_products (
  p_terms    jsonb,
  p_phrase   text    DEFAULT ''::text,
  p_category uuid    DEFAULT NULL::uuid,
  p_min      numeric DEFAULT NULL::numeric,
  p_max      numeric DEFAULT NULL::numeric,
  p_limit    integer DEFAULT 120
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.search_word_near (
  a text,
  b text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
  select case
    when length(a) = length(b)                then levenshtein_less_equal(a, b, 2) <= 2
    when abs(length(a) - length(b)) = 1       then levenshtein_less_equal(a, b, 1) <= 1
    else false end
$function$;

REVOKE ALL ON FUNCTION "public"."search_word_near"(text, text) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_order_status (
  p_order_id uuid,
  p_status   text,
  p_note     text DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_order orders%rowtype;
begin
  if not is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_status = 'cancelled' then
    raise exception 'USE_CANCEL_ORDER';
  end if;
  if p_status not in ('confirmed', 'out_for_delivery', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'ORDER_CLOSED';
  end if;

  if p_status = 'confirmed' and v_order.status <> 'placed' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'out_for_delivery' and v_order.status not in ('placed', 'confirmed') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_status = 'delivered' and v_order.status not in ('placed', 'confirmed', 'out_for_delivery') then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform set_config('app.order_note', coalesce(trim(p_note), ''), true);

  update orders
     set status = p_status,
         expires_at = null,
         payment_status = case
           when p_status = 'delivered' and payment_method = 'on_delivery' then 'paid'
           else payment_status
         end
   where id = v_order.id;

  perform set_config('app.order_note', '', true);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_order_status"(uuid, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.stem_word (
  w text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'extensions'
  AS $function$
  select case
    when length(w) <= 3                                   then w
    when w like '%ies' and length(w) > 4                  then left(w, -3) || 'y'
    when w like '%sses'                                   then left(w, -2)
    when w like '%s' and w not like '%ss'                 then left(w, -1)
    else w end
$function$;

REVOKE ALL ON FUNCTION "public"."stem_word"(text) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.store_review_stats()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select jsonb_build_object(
    'count',   count(*),
    'average', coalesce(round(avg(rating)::numeric, 1), 0),
    'stars', jsonb_build_object(
      '1', count(*) filter (where rating = 1),
      '2', count(*) filter (where rating = 2),
      '3', count(*) filter (where rating = 3),
      '4', count(*) filter (where rating = 4),
      '5', count(*) filter (where rating = 5)
    ),
    'size_fit', jsonb_build_object(
      'bad',       count(*) filter (where size_fit = 'bad'),
      'good',      count(*) filter (where size_fit = 'good'),
      'very_good', count(*) filter (where size_fit = 'very_good')
    ),
    'comfort', jsonb_build_object(
      'bad',       count(*) filter (where comfort = 'bad'),
      'good',      count(*) filter (where comfort = 'good'),
      'very_good', count(*) filter (where comfort = 'very_good')
    ),
    'delivery', jsonb_build_object(
      'bad',       count(*) filter (where delivery = 'bad'),
      'good',      count(*) filter (where delivery = 'good'),
      'very_good', count(*) filter (where delivery = 'very_good')
    ),
    'item_condition', jsonb_build_object(
      'worse',        count(*) filter (where item_condition = 'worse'),
      'as_described', count(*) filter (where item_condition = 'as_described'),
      'better',       count(*) filter (where item_condition = 'better')
    )
  )
  from store_reviews
  where is_visible;
$function$;

CREATE OR REPLACE FUNCTION public.touch_cart_item()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
$function$;

REVOKE ALL ON FUNCTION "public"."touch_last_seen"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.trg_product_search_from_category()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r record;
begin
  for r in select id from public.products where category_id = new.id loop
    perform public.refresh_product_search(r.id);
  end loop;
  return null;
end $function$;

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_category"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.trg_product_search_from_product()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.refresh_product_search(new.id);
  return null;
end $function$;

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_product"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.trg_product_search_from_variant()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_product_search(old.product_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) then
    perform public.refresh_product_search(new.product_id);
  end if;
  return null;
end $function$;

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_variant"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.trg_product_search_vocab()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.product_search_vocab (word)
  select distinct public.stem_word(w)
    from new_rows n, regexp_split_to_table(n.search_text, ' ') w
   where length(w) >= 5
  on conflict do nothing;
  return null;
end $function$;

REVOKE ALL ON FUNCTION "public"."trg_product_search_vocab"() FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."coupons"
  ADD CONSTRAINT "coupons_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.coupon_templates(id) ON DELETE SET NULL;

ALTER TABLE "public"."customer_push_subscriptions"
  ADD CONSTRAINT "customer_push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."delivery_events"
  ADD CONSTRAINT "delivery_events_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.delivery_assignments(id);

ALTER TABLE "public"."delivery_link_tokens"
  ADD CONSTRAINT "delivery_link_tokens_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.delivery_assignments(id);

ALTER TABLE "public"."delivery_qr_tokens"
  ADD CONSTRAINT "delivery_qr_tokens_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.delivery_assignments(id);

ALTER TABLE "public"."addresses"
  ADD CONSTRAINT "addresses_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES public.delivery_zones(id);

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);

ALTER TABLE "public"."coupons"
  ADD CONSTRAINT "coupons_used_order_fk" FOREIGN KEY (used_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE "public"."delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE "public"."delivery_events"
  ADD CONSTRAINT "delivery_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE "public"."delivery_qr_tokens"
  ADD CONSTRAINT "delivery_qr_tokens_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE "public"."order_events"
  ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."order_items"
  ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."payment_issues"
  ADD CONSTRAINT "payment_issues_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."payment_issues"
  ADD CONSTRAINT "payment_issues_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE "public"."cart_items"
  ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

ALTER TABLE "public"."order_items"
  ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id);

ALTER TABLE "public"."product_search"
  ADD CONSTRAINT "product_search_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."product_variants"
  ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."addresses"
  ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."cart_items"
  ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."coupons"
  ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."delivery_qr_tokens"
  ADD CONSTRAINT "delivery_qr_tokens_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."delivery_quotes"
  ADD CONSTRAINT "delivery_quotes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."device_tokens"
  ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY (referred_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."promo_messages"
  ADD CONSTRAINT "promo_messages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."push_log"
  ADD CONSTRAINT "push_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."push_preferences"
  ADD CONSTRAINT "push_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."review_media"
  ADD CONSTRAINT "review_media_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."rider_transfer_accounts"
  ADD CONSTRAINT "rider_transfer_accounts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."store_review_products"
  ADD CONSTRAINT "store_review_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."store_reviews"
  ADD CONSTRAINT "store_reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE "public"."review_media"
  ADD CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY (review_id) REFERENCES public.store_reviews(id) ON DELETE CASCADE;

ALTER TABLE "public"."store_review_products"
  ADD CONSTRAINT "store_review_products_review_id_fkey" FOREIGN KEY (review_id) REFERENCES public.store_reviews(id) ON DELETE CASCADE;

ALTER TABLE "public"."store_reviews"
  ADD CONSTRAINT "store_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."support_conversations"
  ADD CONSTRAINT "support_conversations_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE "public"."support_conversations"
  ADD CONSTRAINT "support_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."support_messages"
  ADD CONSTRAINT "support_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE CASCADE;

ALTER TABLE "public"."wishlist_items"
  ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."wishlist_items"
  ADD CONSTRAINT "wishlist_items_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

CREATE VIEW "public"."public_review_media" AS  SELECT m.id,
    m.review_id,
    m.kind,
    m.url,
    m.created_at
   FROM (public.review_media m
     JOIN public.store_reviews r ON ((r.id = m.review_id)))
  WHERE r.is_visible;

CREATE VIEW "public"."public_review_products" AS  SELECT l.review_id,
    p.id AS product_id,
    p.name AS product_name
   FROM (public.store_review_products l
     JOIN public.products p ON ((p.id = l.product_id)))
  WHERE p.is_active;

CREATE VIEW "public"."public_store_reviews" AS  SELECT r.id,
    r.rating,
    r.size_fit,
    r.comfort,
    r.delivery,
    r.item_condition,
    r.message,
    r.created_at,
    COALESCE(NULLIF((split_part(TRIM(BOTH FROM p.full_name), ' '::text, 1) ||
        CASE
            WHEN (POSITION((' '::text) IN (TRIM(BOTH FROM p.full_name))) > 0) THEN ((' '::text || upper("left"(split_part(TRIM(BOTH FROM p.full_name), ' '::text, 2), 1))) || '.'::text)
            ELSE ''::text
        END), ''::text), 'Customer'::text) AS reviewer_name
   FROM (public.store_reviews r
     JOIN public.profiles p ON ((p.id = r.user_id)))
  WHERE r.is_visible;

CREATE VIEW "public"."public_product_reviews" AS  SELECT l.product_id,
    r.id,
    r.rating,
    r.size_fit,
    r.comfort,
    r.delivery,
    r.item_condition,
    r.message,
    r.created_at,
    r.reviewer_name
   FROM (public.store_review_products l
     JOIN public.public_store_reviews r ON ((r.id = l.review_id)));

CREATE VIEW "public"."product_review_stats" AS  SELECT product_id,
    (count(*))::integer AS count,
    round(avg(rating), 2) AS average
   FROM public.public_product_reviews
  GROUP BY product_id;

CREATE UNIQUE INDEX addresses_one_default_idx ON public.addresses USING btree (user_id)
  WHERE is_default;

CREATE INDEX addresses_user_idx ON public.addresses USING btree (user_id);

CREATE INDEX coupons_user_idx ON public.coupons USING btree (user_id);

CREATE INDEX customer_push_subscriptions_user_idx ON public.customer_push_subscriptions USING btree (user_id);

CREATE INDEX delivery_assignments_order_idx ON public.delivery_assignments USING btree (order_id, created_at DESC);

CREATE INDEX delivery_events_assignment_idx ON public.delivery_events USING btree (assignment_id, event_type, created_at);

CREATE INDEX delivery_events_order_idx ON public.delivery_events USING btree (order_id, created_at);

CREATE INDEX delivery_link_tokens_assignment_idx ON public.delivery_link_tokens USING btree (assignment_id);

CREATE UNIQUE INDEX delivery_one_active_per_order ON public.delivery_assignments USING btree (order_id)
  WHERE (status = ANY (ARRAY['assigned'::text, 'out_for_delivery'::text, 'qr_verified'::text]));

CREATE INDEX delivery_qr_tokens_assignment_idx ON public.delivery_qr_tokens USING btree (assignment_id, created_at DESC);

CREATE INDEX delivery_quotes_user_idx ON public.delivery_quotes USING btree (user_id, created_at DESC);

CREATE INDEX order_events_order_idx ON public.order_events USING btree (order_id, created_at);

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);

CREATE INDEX order_items_variant_idx ON public.order_items USING btree (variant_id)
  WHERE (variant_id IS NOT NULL);

CREATE INDEX orders_coupon_idx ON public.orders USING btree (coupon_id)
  WHERE (coupon_id IS NOT NULL);

CREATE INDEX orders_created_idx ON public.orders USING btree (created_at DESC);

CREATE UNIQUE INDEX orders_order_number_unique ON public.orders USING btree (order_number);

CREATE INDEX orders_pending_expiry_idx ON public.orders USING btree (expires_at)
  WHERE (status = 'pending_payment'::text);

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE INDEX orders_user_created_idx ON public.orders USING btree (user_id, created_at DESC);

CREATE INDEX orders_user_idx ON public.orders USING btree (user_id);

CREATE INDEX payment_issues_open_idx ON public.payment_issues USING btree (created_at)
  WHERE (resolved_at IS NULL);

CREATE INDEX payments_order_idx ON public.payments USING btree (order_id);

CREATE INDEX product_search_trgm_idx ON public.product_search USING gin (search_text extensions.gin_trgm_ops);

CREATE INDEX products_active_created_idx ON public.products USING btree (created_at DESC, id)
  WHERE is_active;

CREATE INDEX products_category_created_idx ON public.products USING btree (category_id, created_at DESC, id)
  WHERE is_active;

CREATE INDEX products_category_idx ON public.products USING btree (category_id)
  WHERE is_active;

CREATE INDEX products_name_trgm_idx ON public.products USING gin (name extensions.gin_trgm_ops)
  WHERE is_active;

CREATE INDEX products_price_idx ON public.products USING btree (price);

CREATE INDEX products_sizes_idx ON public.products USING gin (sizes);

CREATE INDEX profiles_referred_by_idx ON public.profiles USING btree (referred_by);

CREATE INDEX promo_messages_due_idx ON public.promo_messages USING btree (status, scheduled_for);

CREATE UNIQUE INDEX push_log_once_idx ON public.push_log USING btree (user_id, kind, ref);

CREATE INDEX push_log_user_kind_idx ON public.push_log USING btree (user_id, kind, sent_at DESC);

CREATE INDEX review_media_review_idx ON public.review_media USING btree (review_id);

CREATE UNIQUE INDEX rider_transfer_accounts_one_pending ON public.rider_transfer_accounts USING btree (order_id)
  WHERE (status = 'pending'::text);

CREATE INDEX rider_transfer_accounts_order_idx ON public.rider_transfer_accounts USING btree (order_id, created_at DESC);

CREATE INDEX store_review_products_product_idx ON public.store_review_products USING btree (product_id);

CREATE INDEX store_reviews_user_idx ON public.store_reviews USING btree (user_id);

CREATE INDEX store_reviews_visible_idx ON public.store_reviews USING btree (is_visible, created_at DESC);

CREATE INDEX support_conversations_inbox ON public.support_conversations USING btree (status, last_message_at DESC);

CREATE INDEX support_messages_by_chat ON public.support_messages USING btree (conversation_id, created_at);

CREATE UNIQUE INDEX support_one_open_chat_per_user ON public.support_conversations USING btree (user_id)
  WHERE (status <> 'resolved'::text);

CREATE INDEX variants_product_active_idx ON public.product_variants USING btree (product_id)
  WHERE (is_active AND (stock > 0));

CREATE INDEX variants_product_idx ON public.product_variants USING btree (product_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER addresses_default
  BEFORE INSERT OR UPDATE OF is_default ON public.addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_default_address();

CREATE TRIGGER addresses_home_only
  BEFORE INSERT OR UPDATE OF zone_id ON public.addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_address_zone();

CREATE TRIGGER cart_items_touch
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_cart_item();

CREATE TRIGGER product_search_on_category
  AFTER UPDATE OF name ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_product_search_from_category();

CREATE TRIGGER order_customer_notify
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (((old.status IS DISTINCT FROM new.status) OR (old.payment_status IS DISTINCT FROM new.payment_status)))
  EXECUTE FUNCTION public.queue_customer_notification();

CREATE TRIGGER order_paid_notify
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (((old.status = 'pending_payment'::text) AND (new.status = 'placed'::text)))
  EXECUTE FUNCTION public.queue_order_notification();

CREATE TRIGGER order_ready_notify
  AFTER UPDATE OF total ON public.orders
  FOR EACH ROW
  WHEN (((old.total = (0)::numeric) AND (new.total > (0)::numeric) AND (new.status = 'placed'::text)))
  EXECUTE FUNCTION public.queue_order_notification();

CREATE TRIGGER orders_assign_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_number();

CREATE TRIGGER orders_close_assignment
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.close_assignment_on_order_change();

CREATE TRIGGER orders_fill_campus_coords
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_campus_delivery_coords();

CREATE TRIGGER orders_record_event
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_order_event();

CREATE TRIGGER orders_referral_reward
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_referral_reward();

CREATE TRIGGER orders_release_coupon
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (((new.status = 'cancelled'::text) AND (old.status IS DISTINCT FROM 'cancelled'::text)))
  EXECUTE FUNCTION public.release_order_coupon();

CREATE TRIGGER payment_issue_resolved
  AFTER UPDATE OF resolved_at ON public.payment_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_refund_details_flag();

CREATE TRIGGER product_search_vocab_ins
  AFTER INSERT ON public.product_search REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_product_search_vocab();

CREATE TRIGGER product_search_vocab_upd
  AFTER UPDATE ON public.product_search REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_product_search_vocab();

CREATE TRIGGER product_search_on_variant
  AFTER INSERT OR DELETE OR UPDATE OF color, size, is_active, product_id ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_product_search_from_variant();

CREATE TRIGGER variants_sold_out
  AFTER UPDATE OF stock, is_active ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.move_sold_out_cart_items();

CREATE TRIGGER product_search_on_product
  AFTER INSERT OR UPDATE OF name, description, details, category_id ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_product_search_from_product();

CREATE TRIGGER review_media_limits_trg
  BEFORE INSERT ON public.review_media
  FOR EACH ROW
  EXECUTE FUNCTION public.review_media_limits();

CREATE TRIGGER store_reviews_link_products
  AFTER INSERT ON public.store_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.link_review_to_products();

CREATE POLICY "own addresses" ON "public"."addresses"
  FOR ALL
  TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin write" ON "public"."app_settings"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "settings read" ON "public"."app_settings"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "own cart" ON "public"."cart_items"
  FOR ALL
  TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin manages categories" ON "public"."categories"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND profiles.is_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND profiles.is_admin))));

CREATE POLICY "admin write" ON "public"."categories"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "catalog read" ON "public"."categories"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "templates admin" ON "public"."coupon_templates"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "own coupons read" ON "public"."coupons"
  FOR SELECT
  TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "own push devices: delete" ON "public"."customer_push_subscriptions"
  FOR DELETE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "own push devices: select" ON "public"."customer_push_subscriptions"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin reads assignments" ON "public"."delivery_assignments"
  FOR SELECT
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "admin reads delivery events" ON "public"."delivery_events"
  FOR SELECT
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "own quotes read" ON "public"."delivery_quotes"
  FOR SELECT
  TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "zones admin" ON "public"."delivery_zones"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "zones read" ON "public"."delivery_zones"
  FOR SELECT
  TO PUBLIC
  USING ((is_active OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "admin devices" ON "public"."device_tokens"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT public.is_admin() AS is_admin) AND (user_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((( SELECT public.is_admin() AS is_admin) AND (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "banners admin" ON "public"."hero_banners"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "banners read" ON "public"."hero_banners"
  FOR SELECT
  TO PUBLIC
  USING ((is_active OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "own order events read" ON "public"."order_events"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT public.is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_events.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "own order items read" ON "public"."order_items"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT public.is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "own orders read" ON "public"."orders"
  FOR SELECT
  TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "admin issues read" ON "public"."payment_issues"
  FOR SELECT
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "admin issues resolve" ON "public"."payment_issues"
  FOR UPDATE
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "admin payments read" ON "public"."payments"
  FOR SELECT
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "public read active product search" ON "public"."product_search"
  FOR SELECT
  TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_search.product_id) AND p.is_active))) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "public read search vocab" ON "public"."product_search_vocab"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admin write" ON "public"."product_variants"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "catalog read" ON "public"."product_variants"
  FOR SELECT
  TO PUBLIC
  USING ((is_active OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "admin write" ON "public"."products"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "catalog read" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((is_active OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "own profile read" ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "own profile update" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin manages promos" ON "public"."promo_messages"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "admin reads push log" ON "public"."push_log"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "customer adds own push preference" ON "public"."push_preferences"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "customer changes own push preference" ON "public"."push_preferences"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "customer reads own push preference" ON "public"."push_preferences"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin manages push settings" ON "public"."push_settings"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "review_media: admin can remove" ON "public"."review_media"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "review_media: customers add to their own review" ON "public"."review_media"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((user_id = ( SELECT auth.uid() AS uid)) AND (url ~~ (('%/storage/v1/object/public/review-media/'::text || (( SELECT auth.uid() AS uid))::text) || '/%'::text)) AND (EXISTS (
    SELECT 1
   FROM public.store_reviews r
  WHERE ((r.id = review_media.review_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "review_media: owner and admin can read" ON "public"."review_media"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "pages admin" ON "public"."site_pages"
  FOR ALL
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "pages read" ON "public"."site_pages"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "reviews admin delete" ON "public"."store_reviews"
  FOR DELETE
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "reviews admin update" ON "public"."store_reviews"
  FOR UPDATE
  TO PUBLIC
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "reviews insert own" ON "public"."store_reviews"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (is_visible = true) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = store_reviews.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)) AND (o.status = 'delivered'::text))))));

CREATE POLICY "reviews read own" ON "public"."store_reviews"
  FOR SELECT
  TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));

CREATE POLICY "own chats" ON "public"."support_conversations"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "owner reads chats" ON "public"."support_conversations"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "owner resolves chats" ON "public"."support_conversations"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "own chat messages" ON "public"."support_messages"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.support_conversations c
  WHERE ((c.id = support_messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "owner reads chat messages" ON "public"."support_messages"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin))));

CREATE POLICY "own wishlist" ON "public"."wishlist_items"
  FOR ALL
  TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "admin deletes product images" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'product-images'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_admin)))));

CREATE POLICY "product images: admin delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'product-images'::text) AND public.is_admin()));

CREATE POLICY "product images: admin update" ON "storage"."objects"
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id = 'product-images'::text) AND public.is_admin()));

CREATE POLICY "product images: admin upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'product-images'::text) AND public.is_admin()));

CREATE POLICY "product images: public read" ON "storage"."objects"
  FOR SELECT
  TO PUBLIC
  USING ((bucket_id = 'product-images'::text));

CREATE POLICY "review media: customers remove their own files" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'review-media'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_admin())));

CREATE POLICY "review media: customers upload to their own folder" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'review-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."orders";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."product_variants";

COMMENT ON EXTENSION "fuzzystrmatch" IS 'determine similarities and distance between strings';

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';

COMMENT ON EXTENSION "pg_trgm" IS 'text similarity measurement and index searching based on trigrams';

COMMENT ON EXTENSION "unaccent" IS 'text search dictionary that removes accents';

REVOKE ALL ON FUNCTION "public"."_close_assignment"(uuid, text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_close_assignment"(uuid, text, text, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_close_assignment"(uuid, text, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_create_assignment"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_create_assignment"(uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_create_assignment"(uuid, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_delivery_event"(uuid, uuid, text, text, text, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_delivery_event"(uuid, uuid, text, text, text, uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_delivery_event"(uuid, uuid, text, text, text, uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_issue_link"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_issue_link"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_issue_link"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_lock_assignment"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_lock_assignment"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_lock_assignment"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_lock_order_for_token"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_lock_order_for_token"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_lock_order_for_token"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."_resolve_link"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."_resolve_link"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_resolve_link"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_customers"(text, integer, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_customers"(text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_customers"(text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_customers"(text, integer, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_dashboard"(integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_dashboard"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_dashboard"(integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_dashboard"(integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."admin_delete_product"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_delete_product"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_delete_product"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_delete_product"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."assign_order_number"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."assign_order_number"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_order_number"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_order_number"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."assign_rider"(uuid, text, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."assign_rider"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_rider"(uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_rider"(uuid, text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."browse_products"(bigint, uuid, numeric, numeric, integer, integer) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."browse_products"(bigint, uuid, numeric, numeric, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."browse_products"(bigint, uuid, numeric, numeric, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."browse_products"(bigint, uuid, numeric, numeric, integer, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."cancel_assignment"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cancel_assignment"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_assignment"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_assignment"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cancel_order"(uuid, uuid, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_order"(uuid, uuid, boolean, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_order"(uuid, uuid, boolean, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."check_address_zone"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."check_address_zone"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_address_zone"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_address_zone"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."clear_refund_details_flag"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."clear_refund_details_flag"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_refund_details_flag"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_refund_details_flag"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."close_assignment_on_order_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."close_assignment_on_order_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."close_assignment_on_order_change"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."create_delivery_qr"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_delivery_qr"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_delivery_qr"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_delivery_qr"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."deactivate_my_account"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."deactivate_my_account"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deactivate_my_account"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."deactivate_my_account"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."delivery_otp_sms_result"(uuid, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delivery_otp_sms_result"(uuid, boolean, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delivery_otp_sms_result"(uuid, boolean, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."fill_campus_delivery_coords"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."fill_campus_delivery_coords"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fill_campus_delivery_coords"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."fill_campus_delivery_coords"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."grant_referral_reward"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."grant_referral_reward"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_referral_reward"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."grant_referral_reward"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."issue_coupon"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_coupon"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_coupon"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."link_review_to_products"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."link_review_to_products"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."link_review_to_products"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."link_review_to_products"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."manage_default_address"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."manage_default_address"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."manage_default_address"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."manage_default_address"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_order_paid"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_order_paid"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_order_paid"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."move_sold_out_cart_items"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."move_sold_out_cart_items"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."move_sold_out_cart_items"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."move_sold_out_cart_items"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."my_delivery"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."my_delivery"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_delivery"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_delivery"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."my_referral_progress"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."my_referral_progress"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_referral_progress"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_referral_progress"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."normalize_search_text"(text) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."normalize_search_text"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_search_text"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_search_text"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."place_order"(jsonb, text, uuid, text, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."place_order"(jsonb, text, uuid, text, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."place_order"(jsonb, text, uuid, text, uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."place_order"(jsonb, text, uuid, text, uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."push_cart_candidates"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_cart_candidates"(integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_cart_candidates"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."push_inactive_candidates"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_inactive_candidates"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_inactive_candidates"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."push_promo_audience"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_promo_audience"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."push_promo_audience"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."queue_customer_notification"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."queue_customer_notification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_customer_notification"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_customer_notification"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."queue_order_notification"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."queue_order_notification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_order_notification"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_order_notification"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."reassign_rider"(uuid, text, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."reassign_rider"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reassign_rider"(uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."reassign_rider"(uuid, text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."record_order_event"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."record_order_event"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_order_event"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_order_event"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_product_search"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_product_search"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_product_search"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."register_push_subscription"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."register_push_subscription"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_push_subscription"(jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_push_subscription"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."release_expired_orders"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_expired_orders"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_expired_orders"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."release_order_coupon"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."release_order_coupon"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_order_coupon"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_order_coupon"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."replace_delivery_link"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."replace_delivery_link"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_delivery_link"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_delivery_link"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."review_media_limits"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."review_media_limits"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_media_limits"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_media_limits"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_complete_delivery"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rider_complete_delivery"(text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rider_complete_delivery"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_complete_delivery"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_complete_delivery"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_complete_delivery_core"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_complete_delivery_core"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_complete_delivery_core"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_get_delivery"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_get_delivery"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_get_delivery"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_report_failed"(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rider_report_failed"(text, text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rider_report_failed"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_report_failed"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_report_failed"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_request_otp"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_request_otp"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_request_otp"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_start_delivery"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rider_start_delivery"(text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rider_start_delivery"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_start_delivery"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_start_delivery"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_unpaid_pod"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_unpaid_pod"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_unpaid_pod"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_verify_otp"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rider_verify_otp"(text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rider_verify_otp"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_otp"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_otp"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_verify_otp_core"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_otp_core"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_otp_core"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_verify_qr"(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rider_verify_qr"(text, text) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rider_verify_qr"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_qr"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_qr"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rider_verify_qr_core"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_qr_core"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rider_verify_qr_core"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."run_payment_reconciliation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."run_payment_reconciliation"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."run_payment_reconciliation"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."search_products"(jsonb, text, uuid, numeric, numeric, integer) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."search_products"(jsonb, text, uuid, numeric, numeric, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_products"(jsonb, text, uuid, numeric, numeric, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_products"(jsonb, text, uuid, numeric, numeric, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."search_word_near"(text, text) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."search_word_near"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_word_near"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_word_near"(text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_order_status"(uuid, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_order_status"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_order_status"(uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_order_status"(uuid, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."stem_word"(text) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."stem_word"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stem_word"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."stem_word"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."store_review_stats"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."store_review_stats"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."store_review_stats"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."store_review_stats"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."touch_cart_item"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."touch_cart_item"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_cart_item"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_cart_item"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."touch_last_seen"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."touch_last_seen"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_last_seen"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_last_seen"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_category"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_category"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_category"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_product"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_product"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_product"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_product_search_from_variant"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_variant"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_from_variant"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_product_search_vocab"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_vocab"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_product_search_vocab"() TO "service_role";

REVOKE ALL ON SEQUENCE "public"."push_log_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_log_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."push_log_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_log_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."push_log_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_log_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."push_log_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."push_log_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."addresses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."addresses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."addresses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."addresses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."app_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_settings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cart_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."cart_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cart_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cart_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."categories" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupon_templates" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."coupon_templates" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupon_templates" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupon_templates" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupons" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."coupons" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupons" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupons" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_push_subscriptions" TO "authenticated";

REVOKE ALL ON TABLE "public"."customer_push_subscriptions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_push_subscriptions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_push_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."delivery_assignments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."delivery_assignments" TO "authenticated";

REVOKE ALL ON TABLE "public"."delivery_assignments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_assignments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_assignments" TO "service_role";

REVOKE ALL ON TABLE "public"."delivery_events" FROM "authenticated";

GRANT SELECT ON TABLE "public"."delivery_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."delivery_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_events" TO "service_role";

REVOKE ALL ON TABLE "public"."delivery_link_tokens" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_link_tokens" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_link_tokens" TO "service_role";

REVOKE ALL ON TABLE "public"."delivery_qr_tokens" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_qr_tokens" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_qr_tokens" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_quotes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."delivery_quotes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_quotes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_quotes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_zones" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."delivery_zones" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_zones" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."delivery_zones" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."device_tokens" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."device_tokens" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."device_tokens" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."device_tokens" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hero_banners" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."hero_banners" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hero_banners" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hero_banners" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_events" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."order_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."order_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."orders" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_issues" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."payment_issues" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_issues" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_issues" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."payments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."private_settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."private_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."private_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."private_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."product_search" FROM "anon";

GRANT SELECT ON TABLE "public"."product_search" TO "anon";

REVOKE ALL ON TABLE "public"."product_search" FROM "authenticated";

GRANT SELECT ON TABLE "public"."product_search" TO "authenticated";

REVOKE ALL ON TABLE "public"."product_search" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_search" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_search" TO "service_role";

REVOKE ALL ON TABLE "public"."product_search_vocab" FROM "anon";

GRANT SELECT ON TABLE "public"."product_search_vocab" TO "anon";

REVOKE ALL ON TABLE "public"."product_search_vocab" FROM "authenticated";

GRANT SELECT ON TABLE "public"."product_search_vocab" TO "authenticated";

REVOKE ALL ON TABLE "public"."product_search_vocab" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_search_vocab" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_search_vocab" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_variants" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."product_variants" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_variants" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_variants" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("full_name") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("phone") ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."promo_messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."promo_messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."promo_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."promo_messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_log" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."push_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_log" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_log" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_preferences" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."push_preferences" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_preferences" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_preferences" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."push_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_settings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_media" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."review_media" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_media" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_media" TO "service_role";

REVOKE ALL ON TABLE "public"."rider_transfer_accounts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rider_transfer_accounts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rider_transfer_accounts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_pages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."site_pages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_pages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_pages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_review_products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."store_review_products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_review_products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_review_products" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_reviews" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."store_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."store_reviews" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_conversations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."support_conversations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_conversations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_conversations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."support_messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."support_messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."wishlist_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."wishlist_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."wishlist_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."wishlist_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_review_stats" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."product_review_stats" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_review_stats" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_review_stats" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_product_reviews" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."public_product_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_product_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_product_reviews" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_media" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."public_review_media" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_media" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_media" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."public_review_products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_review_products" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_store_reviews" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."public_store_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_store_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_store_reviews" TO "service_role";

SELECT cron.schedule_in_database('looma-push-scheduler', '*/5 * * * *', '
  select net.http_post(
    url     := ''https://fhjxbzcdtjtahijkdxio.supabase.co/functions/v1/push-scheduler'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''x-webhook-secret'', ''LOOMA_8f2d9c71a6e4b0357c1f92d8e5a40b63c9d7e1f6a2b8054c''
    ),
    body    := ''{}''::jsonb,
    timeout_milliseconds := 55000
  );
  ', 'postgres', NULL, true);

SELECT cron.schedule_in_database('reconcile-payments', '*/15 * * * *', ' select run_payment_reconciliation(); ', 'postgres', NULL, true);

SELECT cron.schedule_in_database('release-expired-orders', '* * * * *', 'select release_expired_orders()', 'postgres', NULL, true);

