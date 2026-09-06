-- REVIEW ONLY: baseline adoption checkpoint, NOT historical execution.
-- Source: direct read-only Production capture. NO data/backfill or history writes.
-- Fresh disposable/platform-prepared database only; never execute for adoption.
BEGIN;
SET LOCAL check_function_bodies = off;
SET LOCAL search_path = public, extensions;
CREATE TABLE "public"."activity_timeline" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "event_type" text NOT NULL,
  "summary" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "performed_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."activity_timeline" OWNER TO "postgres";
CREATE TABLE "public"."assignment_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "partner_id" uuid,
  "score" numeric(5,2),
  "decision_reason" text,
  "assigned_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."assignment_logs" OWNER TO "postgres";
CREATE TABLE "public"."assignment_rules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service_type" text NOT NULL,
  "priority_weight" integer DEFAULT 0 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."assignment_rules" OWNER TO "postgres";
CREATE TABLE "public"."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "old_values" jsonb DEFAULT '{}'::jsonb,
  "new_values" jsonb DEFAULT '{}'::jsonb,
  "performed_by" text,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text
);
ALTER TABLE "public"."audit_logs" OWNER TO "postgres";
CREATE TABLE "public"."booking_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "service_id" uuid,
  "destination_id" uuid,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
  "total_price" numeric(10,2) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."booking_items" OWNER TO "postgres";
CREATE TABLE "public"."bookings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid,
  "booking_reference" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "currency" text DEFAULT 'EGP'::text NOT NULL,
  "total_amount" numeric(10,2) DEFAULT 0 NOT NULL,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid,
  "product_id" uuid,
  "product_name" text,
  "product_price" numeric(12,2),
  "total_price" numeric(12,2),
  "payment_status" text DEFAULT 'pending'::text,
  "guest_name" text,
  "guest_phone" text,
  "guest_email" text,
  "arrival_date" date,
  "departure_date" date,
  "guests" integer,
  "city" text,
  "special_requests" text,
  "client_passport" text,
  "client_nationality" text,
  "request_key" uuid,
  "discount_amount" numeric(12,2),
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text,
  "scenario_code" text,
  "source_channel" text,
  "failure_reason" text,
  "duplicate_of_booking_id" uuid,
  "rescheduled_from_booking_id" uuid,
  "escalated_to_staff" boolean DEFAULT false NOT NULL,
  "escalation_reason" text
);
ALTER TABLE "public"."bookings" OWNER TO "postgres";
CREATE TABLE "public"."customer_activity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "activity_type" text NOT NULL,
  "details" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."customer_activity" OWNER TO "postgres";
CREATE TABLE "public"."customers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "nationality" text,
  "country" text,
  "city" text,
  "preferred_language" text DEFAULT 'ar'::text,
  "preferred_currency" text DEFAULT 'SAR'::text,
  "date_of_birth" date,
  "passport" text,
  "national_id" text,
  "emergency_contact" text,
  "shield_level" text DEFAULT 'DIR3 Shield'::text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."customers" OWNER TO "postgres";
CREATE TABLE "public"."dabra_provider_attempts" (
  "attempt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "intent_class" text NOT NULL,
  "language" text NOT NULL,
  "route" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "latency_ms" integer NOT NULL,
  "success" boolean NOT NULL,
  "error_category" text,
  "fallback_from" text,
  "fallback_reason" text,
  "fallback_hop" integer DEFAULT 0 NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost_usd" numeric(20,12),
  "pricing_version" text,
  "grounding_status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."dabra_provider_attempts" OWNER TO "postgres";
CREATE TABLE "public"."destinations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid,
  "name_ar" text NOT NULL,
  "name_en" text NOT NULL,
  "slug" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "country" text,
  "region" text,
  "featured" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."destinations" OWNER TO "postgres";
CREATE TABLE "public"."marketplace_request_audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "actor_identity" text NOT NULL,
  "actor_role" text NOT NULL,
  "actor_source" text NOT NULL,
  "previous_status" text NOT NULL,
  "new_status" text NOT NULL,
  "event_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marketplace_request_audit_logs" OWNER TO "postgres";
CREATE TABLE "public"."marketplace_request_evidence" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "supplier_context" text NOT NULL,
  "evidence_type" text NOT NULL,
  "source_type" text NOT NULL,
  "evidence_reference" text NOT NULL,
  "status" text NOT NULL,
  "amount" numeric(12,2),
  "currency" text,
  "accepted_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."marketplace_request_evidence" OWNER TO "postgres";
CREATE TABLE "public"."marketplace_request_handoff_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "initiated_by_partner_user_id" uuid NOT NULL,
  "handoff_type" text NOT NULL,
  "handoff_reference" text NOT NULL,
  "request_status_at_handoff" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "whatsapp_destination" text,
  "message_snapshot" text
);
ALTER TABLE "public"."marketplace_request_handoff_events" OWNER TO "postgres";
CREATE TABLE "public"."marketplace_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_reference" text NOT NULL,
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "request_type" text NOT NULL,
  "status" text DEFAULT 'request_submitted'::text NOT NULL,
  "requested_for" timestamp with time zone,
  "traveller_count" integer DEFAULT 1 NOT NULL,
  "customer_brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quote_amount" numeric(12,2),
  "quote_currency" text,
  "quote_expires_at" timestamp with time zone,
  "payment_status" text DEFAULT 'awaiting_payment'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "marketplace_family" text,
  "supplier_name" text,
  "service_name" text,
  "fulfilment_method" text DEFAULT 'request_to_confirm'::text NOT NULL,
  "transaction_method" text DEFAULT 'request_to_confirm'::text NOT NULL,
  "handoff_type" text DEFAULT 'none'::text NOT NULL,
  "handoff_reference" text,
  "handoff_started_at" timestamp with time zone,
  "next_action" text,
  "confirmation_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE "public"."marketplace_requests" OWNER TO "postgres";
CREATE TABLE "public"."media" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "url" text NOT NULL,
  "mime_type" text,
  "alt_text_ar" text,
  "alt_text_en" text,
  "kind" text DEFAULT 'image'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."media" OWNER TO "postgres";
CREATE TABLE "public"."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid,
  "title" text NOT NULL,
  "body" text,
  "kind" text DEFAULT 'info'::text NOT NULL,
  "read_at" timestamp with time zone,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."notifications" OWNER TO "postgres";
CREATE TABLE "public"."partner_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "partner_id" uuid NOT NULL,
  "assignment_status" text DEFAULT 'assigned'::text NOT NULL,
  "assigned_by" text,
  "notes" text,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_assignments" OWNER TO "postgres";
CREATE TABLE "public"."partner_coverage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "country" text NOT NULL,
  "city" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."partner_coverage" OWNER TO "postgres";
CREATE TABLE "public"."partner_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "file_url" text,
  "verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_documents" OWNER TO "postgres";
CREATE TABLE "public"."partner_image_cleanup_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "product_image_id" uuid NOT NULL,
  "bucket" text NOT NULL,
  "storage_path" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_image_cleanup_queue" OWNER TO "postgres";
CREATE TABLE "public"."partner_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "channel" text,
  "title" text,
  "body" text,
  "payload" jsonb,
  "status" text,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_notifications" OWNER TO "postgres";
CREATE TABLE "public"."partner_performance" (
  "partner_id" uuid NOT NULL,
  "total_bookings" integer DEFAULT 0 NOT NULL,
  "completed_bookings" integer DEFAULT 0 NOT NULL,
  "cancelled_bookings" integer DEFAULT 0 NOT NULL,
  "average_rating" numeric(3,2) DEFAULT 0 NOT NULL,
  "on_time_rate" numeric(5,2) DEFAULT 0 NOT NULL,
  "complaints" integer DEFAULT 0 NOT NULL,
  "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
  "last_activity" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_performance" OWNER TO "postgres";
CREATE TABLE "public"."partner_portal_asset_media" (
  "id" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "asset_id" text NOT NULL,
  "owner_kind" text NOT NULL,
  "storage_path" text NOT NULL,
  "record" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_portal_asset_media" OWNER TO "postgres";
CREATE TABLE "public"."partner_portal_assets" (
  "id" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "owner_kind" text NOT NULL,
  "record" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_portal_assets" OWNER TO "postgres";
CREATE TABLE "public"."partner_portal_contracts" (
  "id" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "owner_kind" text NOT NULL,
  "record" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_portal_contracts" OWNER TO "postgres";
CREATE TABLE "public"."partner_portal_review_queue" (
  "id" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "asset_id" text NOT NULL,
  "media_id" text,
  "owner_kind" text NOT NULL,
  "record" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_portal_review_queue" OWNER TO "postgres";
CREATE TABLE "public"."partner_services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "service_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."partner_services" OWNER TO "postgres";
CREATE TABLE "public"."partner_storage_cleanup_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "bucket" text NOT NULL,
  "storage_path" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_storage_cleanup_queue" OWNER TO "postgres";
CREATE TABLE "public"."partner_users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "partner_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."partner_users" OWNER TO "postgres";
CREATE TABLE "public"."partners" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "slug" text NOT NULL,
  "website_url" text,
  "logo_url" text,
  "description_ar" text,
  "description_en" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "company_name" text NOT NULL,
  "email" text NOT NULL,
  "contact_person" text,
  "phone" text,
  "country" text,
  "city" text,
  "commercial_registration" text,
  "tax_number" text,
  "iban" text,
  "shield_level" text,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."partners" OWNER TO "postgres";
CREATE TABLE "public"."product_audit_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "actor_role" text NOT NULL,
  "country" text,
  "before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reason" text,
  "correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."product_audit_events" OWNER TO "postgres";
CREATE TABLE "public"."product_availability" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "city" text NOT NULL,
  "partner_id" uuid,
  "available" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "date" date DEFAULT CURRENT_DATE,
  "availability_status" text DEFAULT 'available'::text,
  "capacity" integer DEFAULT 1 NOT NULL,
  "booked_count" integer DEFAULT 0 NOT NULL,
  "price" numeric(12,2),
  "currency" text DEFAULT 'EGP'::text,
  "weekend_price" numeric(12,2),
  "seasonal_price" numeric(12,2),
  "discount_percent" numeric(5,2) DEFAULT 0 NOT NULL,
  "taxes_percent" numeric(5,2) DEFAULT 0 NOT NULL,
  "insurance_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "addons_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "notes" text,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."product_availability" OWNER TO "postgres";
CREATE TABLE "public"."product_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name_ar" text NOT NULL,
  "name_en" text NOT NULL,
  "slug" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."product_categories" OWNER TO "postgres";
CREATE TABLE "public"."product_features" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "feature_text_ar" text NOT NULL,
  "feature_text_en" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."product_features" OWNER TO "postgres";
CREATE TABLE "public"."product_images" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text
);
ALTER TABLE "public"."product_images" OWNER TO "postgres";
CREATE TABLE "public"."product_prices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "price" numeric(12,2) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'SAR'::text NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "rule_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text,
  "is_weekend" boolean DEFAULT false NOT NULL,
  "is_seasonal" boolean DEFAULT false NOT NULL,
  "discount_percent" numeric(5,2) DEFAULT 0 NOT NULL,
  "taxes_percent" numeric(5,2) DEFAULT 0 NOT NULL,
  "insurance_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "addons_amount" numeric(12,2) DEFAULT 0 NOT NULL
);
ALTER TABLE "public"."product_prices" OWNER TO "postgres";
CREATE TABLE "public"."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid,
  "name_ar" text NOT NULL,
  "name_en" text NOT NULL,
  "slug" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "city" text,
  "base_price" numeric(12,2) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'SAR'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "shield_certified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL,
  "environment" text,
  "reference_code" text,
  "country" text,
  "taxes_percent" numeric(5,2) DEFAULT 0 NOT NULL,
  "insurance_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "addons_amount" numeric(12,2) DEFAULT 0 NOT NULL,
  "max_guests" integer,
  "deleted_at" timestamp with time zone,
  "marketplace_family" text,
  "fulfilment_state" text DEFAULT 'catalog_only'::text NOT NULL,
  "transaction_method" text DEFAULT 'none'::text NOT NULL,
  "marketplace_environment" text DEFAULT 'production'::text NOT NULL,
  "supply_type" text DEFAULT 'unknown'::text NOT NULL,
  "supplier_name" text,
  "supplier_verified" boolean DEFAULT false NOT NULL,
  "cancellation_summary" text,
  "lifecycle_version" integer DEFAULT 1 NOT NULL,
  "published_at" timestamp with time zone,
  "published_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid
);
ALTER TABLE "public"."products" OWNER TO "postgres";
CREATE TABLE "public"."profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "avatar_url" text,
  "role" text DEFAULT 'customer'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."profiles" OWNER TO "postgres";
CREATE TABLE "public"."promotions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "service_id" uuid,
  "code" text NOT NULL,
  "title_ar" text NOT NULL,
  "title_en" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."promotions" OWNER TO "postgres";
CREATE TABLE "public"."reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid,
  "service_id" uuid,
  "booking_id" uuid,
  "rating" integer NOT NULL,
  "title_ar" text,
  "title_en" text,
  "comment_ar" text,
  "comment_en" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."reviews" OWNER TO "postgres";
CREATE TABLE "public"."service_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "parent_id" uuid,
  "name_ar" text NOT NULL,
  "name_en" text NOT NULL,
  "slug" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."service_categories" OWNER TO "postgres";
CREATE TABLE "public"."services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid,
  "name_ar" text NOT NULL,
  "name_en" text NOT NULL,
  "slug" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "base_price" numeric(10,2) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'SAR'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "synthetic" boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."services" OWNER TO "postgres";
CREATE TABLE "public"."system_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_name" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."system_events" OWNER TO "postgres";
CREATE TABLE "public"."team_access_grants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "job_title" text NOT NULL,
  "access_level" text DEFAULT 'scoped_staff'::text NOT NULL,
  "country_scope" text[] DEFAULT '{}'::text[] NOT NULL,
  "permissions" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "invited_user_id" uuid,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."team_access_grants" OWNER TO "postgres";
CREATE TABLE "public"."tiktok_connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "open_id" text NOT NULL,
  "access_token_ciphertext" text NOT NULL,
  "refresh_token_ciphertext" text NOT NULL,
  "scope" text DEFAULT ''::text NOT NULL,
  "access_token_expires_at" timestamp with time zone NOT NULL,
  "refresh_token_expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."tiktok_connections" OWNER TO "postgres";
CREATE TABLE "public"."verification_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "verification_request_id" uuid,
  "document_type" text NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" text NOT NULL,
  "file_url" text,
  "issue_date" date,
  "expiry_date" date,
  "verification_status" text DEFAULT 'Pending'::text NOT NULL,
  "verified_by" text,
  "review_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."verification_documents" OWNER TO "postgres";
CREATE TABLE "public"."verification_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_type" text NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" text NOT NULL,
  "status" text DEFAULT 'Pending'::text NOT NULL,
  "score" integer DEFAULT 0,
  "verification_level" text DEFAULT 'basic'::text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."verification_requests" OWNER TO "postgres";
CREATE TABLE "public"."verification_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "verification_request_id" uuid,
  "reviewer_id" text,
  "decision" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."verification_reviews" OWNER TO "postgres";
CREATE TABLE "public"."verification_status_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "verification_request_id" uuid,
  "status" text NOT NULL,
  "changed_by" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "public"."verification_status_history" OWNER TO "postgres";
CREATE TABLE "public"."webhook_idempotency_events" (
  "event_key" text NOT NULL,
  "source" text DEFAULT 'whatsapp'::text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'completed'::text NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "retry_after" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "outbound_message_id" text,
  "last_error_code" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "send_started_at" timestamp with time zone,
  "destination_profile" text,
  "inbound_message_id" text
);
ALTER TABLE "public"."webhook_idempotency_events" OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.acquire_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_ttl_seconds integer DEFAULT 900, p_lease_seconds integer DEFAULT 60, p_max_attempts integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text := pg_catalog.btrim(coalesce(p_event_key, ''));
  v_owner text := pg_catalog.btrim(coalesce(p_lease_owner, ''));
  v_now timestamptz := pg_catalog.now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 1);
  v_lease integer := greatest(coalesce(p_lease_seconds, 60), 1);
  v_started_grace integer := greatest(v_lease * 2, 120);
  v_limit integer := greatest(coalesce(p_max_attempts, 3), 1);
  v_row public.webhook_idempotency_events%rowtype;
begin
  if v_key = '' or v_owner = '' then
    return pg_catalog.jsonb_build_object('decision', 'retry_exhausted', 'state', 'processing', 'lease_owner', '', 'attempt_count', 0);
  end if;

  delete from public.webhook_idempotency_events
  where expires_at <= v_now
    and status not in ('send_started', 'unknown_outcome');

  select * into v_row
  from public.webhook_idempotency_events
  where event_key = v_key
  for update;

  if not found then
    insert into public.webhook_idempotency_events (
      event_key, source, status, lease_owner, lease_expires_at, retry_after,
      attempt_count, outbound_message_id, last_error_code, expires_at, created_at, updated_at
    ) values (
      v_key, 'whatsapp', 'processing', v_owner,
      v_now + pg_catalog.make_interval(secs => v_lease), null, 1, null, null,
      v_now + pg_catalog.make_interval(secs => v_ttl), v_now, v_now
    )
    on conflict (event_key) do nothing
    returning * into v_row;

    if found then
      return pg_catalog.jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', 1);
    end if;

    select * into v_row
    from public.webhook_idempotency_events
    where event_key = v_key
    for update;
  end if;

  if v_row.status = 'completed' then
    return pg_catalog.jsonb_build_object('decision', 'duplicate_completed', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'permanent_failed' then
    return pg_catalog.jsonb_build_object('decision', 'permanent_failed', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'unknown_outcome' then
    return pg_catalog.jsonb_build_object('decision', 'unknown_wait', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'send_started' then
    if v_row.send_started_at is not null
       and v_row.send_started_at + pg_catalog.make_interval(secs => v_started_grace) <= v_now then
      update public.webhook_idempotency_events
      set status = 'unknown_outcome', lease_owner = null, lease_expires_at = null,
          retry_after = null, last_error_code = 'WORKER_LOST_AFTER_SEND_STARTED', updated_at = v_now
      where event_key = v_key
        and status = 'send_started'
        and lease_owner = v_row.lease_owner
        and attempt_count = v_row.attempt_count;

      return pg_catalog.jsonb_build_object('decision', 'unknown_wait', 'state', 'unknown_outcome', 'lease_owner', '', 'attempt_count', v_row.attempt_count);
    end if;

    return pg_catalog.jsonb_build_object('decision', 'send_in_progress', 'state', 'send_started', 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'processing' and v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
    return pg_catalog.jsonb_build_object('decision', 'duplicate_processing', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'retryable_failed' and v_row.retry_after is not null and v_row.retry_after > v_now then
    return pg_catalog.jsonb_build_object('decision', 'retry_wait', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.attempt_count >= v_limit then
    return pg_catalog.jsonb_build_object('decision', 'retry_exhausted', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  update public.webhook_idempotency_events
  set status = 'processing', lease_owner = v_owner,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => v_lease),
      retry_after = null, attempt_count = v_row.attempt_count + 1,
      send_started_at = null, destination_profile = null, inbound_message_id = null,
      last_error_code = null, updated_at = v_now,
      expires_at = greatest(v_row.expires_at, v_now + pg_catalog.make_interval(secs => v_ttl))
  where event_key = v_key
    and status in ('processing', 'retryable_failed')
    and attempt_count = v_row.attempt_count;

  return pg_catalog.jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', v_row.attempt_count + 1);
end;
$function$
;
ALTER FUNCTION "public"."acquire_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_ttl_seconds integer, p_lease_seconds integer, p_max_attempts integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.archive_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text DEFAULT 'Admin archive'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_deleted timestamptz;
  v_request_count bigint;
  v_booking_count bigint;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p),p.lifecycle_version,p.country,p.deleted_at
    INTO v_before,v_version,v_country,v_deleted
  FROM public.products p
  WHERE p.id=p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;

  SELECT count(*) INTO v_request_count FROM public.marketplace_requests WHERE product_id=p_product_id;
  SELECT count(*) INTO v_booking_count FROM public.bookings WHERE product_id=p_product_id;

  UPDATE public.products SET
    status='draft', deleted_at=now(), archived_at=now(), archived_by=v_actor,
    lifecycle_version=lifecycle_version+1, updated_at=now()
  WHERE id=p_product_id RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'archive',v_actor,v_role,v_country,v_before,v_after,
    coalesce(nullif(btrim(coalesce(p_reason,'')),''),'Admin archive') ||
    format(' [historical_requests=%s historical_bookings=%s]',v_request_count,v_booking_count));
  RETURN v_version;
END;
$function$
;
ALTER FUNCTION "public"."archive_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.assert_marketplace_request_confirmation_integrity()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  confirmed_request record;
BEGIN
  FOR confirmed_request IN
    SELECT id, confirmation_evidence
    FROM public.marketplace_requests
    WHERE status = 'confirmed'
  LOOP
    PERFORM public.resolve_marketplace_request_confirmation_evidence(
      confirmed_request.id,
      confirmed_request.confirmation_evidence
    );
  END LOOP;
END;
$function$
;
ALTER FUNCTION "public"."assert_marketplace_request_confirmation_integrity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.begin_whatsapp_event_send(p_event_key text, p_lease_owner text, p_attempt_number integer, p_destination_profile text, p_inbound_message_id text, p_ttl_seconds integer DEFAULT 900)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_updated integer := 0;
begin
  update public.webhook_idempotency_events
  set status = 'send_started',
      send_started_at = v_now,
      destination_profile = nullif(pg_catalog.btrim(coalesce(p_destination_profile, '')), ''),
      inbound_message_id = nullif(pg_catalog.btrim(coalesce(p_inbound_message_id, '')), ''),
      updated_at = v_now,
      expires_at = greatest(expires_at, v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1)))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'processing'
    and lease_expires_at > v_now;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$
;
ALTER FUNCTION "public"."begin_whatsapp_event_send"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_destination_profile text, p_inbound_message_id text, p_ttl_seconds integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.can_read_product_audit(p_country text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_status text;
  v_deleted timestamptz;
  v_grant public.team_access_grants%ROWTYPE;
  v_country text := public.normalize_admin_country_key(p_country);
BEGIN
  IF v_actor IS NULL THEN RETURN false; END IF;

  SELECT p.role, p.status, p.deleted_at INTO v_role, v_status, v_deleted
  FROM public.profiles p WHERE p.id = v_actor;

  IF v_role IS NULL OR v_status <> 'active' OR v_deleted IS NOT NULL THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_role <> 'staff' THEN RETURN false; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor AND g.status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    v_grant.access_level = 'global_admin'
    OR 'admin:full' = ANY(v_grant.permissions)
    OR 'products:read' = ANY(v_grant.permissions)
    OR 'products:write' = ANY(v_grant.permissions)
  ) THEN RETURN false; END IF;

  IF v_grant.access_level = 'global_admin' OR 'admin:full' = ANY(v_grant.permissions) THEN
    RETURN true;
  END IF;

  IF v_country = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(v_grant.country_scope) AS c(country_value)
    WHERE public.normalize_admin_country_key(c.country_value) = v_country
  );
END;
$function$
;
ALTER FUNCTION "public"."can_read_product_audit"(p_country text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.complete_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_outbound_message_id text, p_ttl_seconds integer DEFAULT 900)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_updated integer := 0;
begin
  update public.webhook_idempotency_events
  set status = 'completed', lease_owner = null, lease_expires_at = null, retry_after = null,
      outbound_message_id = pg_catalog.btrim(coalesce(p_outbound_message_id, '')),
      last_error_code = null, updated_at = v_now,
      expires_at = v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'send_started';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$
;
ALTER FUNCTION "public"."complete_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_outbound_message_id text, p_ttl_seconds integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.create_product_draft_lifecycle(p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text DEFAULT 'Admin draft created'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_after jsonb;
BEGIN
  v_role := public.product_lifecycle_actor_role(p_country, 'products:write');
  IF nullif(btrim(coalesce(p_name_ar,'')), '') IS NULL
     AND nullif(btrim(coalesce(p_name_en,'')), '') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NAME_REQUIRED';
  END IF;
  IF nullif(btrim(coalesce(p_country,'')), '') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_COUNTRY_REQUIRED';
  END IF;

  PERFORM pg_catalog.set_config(
    'dir3com.lifecycle_create_path',
    'create_product_draft_lifecycle:v1',
    true
  );

  INSERT INTO public.products (
    name_ar, name_en, slug, base_price, country, city,
    marketplace_family, fulfilment_state, transaction_method, supply_type,
    supplier_verified, marketplace_environment, synthetic,
    status, featured, verified, shield_certified, lifecycle_version
  ) VALUES (
    coalesce(p_name_ar,''), coalesce(p_name_en,''), p_slug, greatest(coalesce(p_base_price,0),0),
    p_country, nullif(btrim(coalesce(p_city,'')), ''),
    p_marketplace_family, p_fulfilment_state, p_transaction_method, p_supply_type,
    coalesce(p_supplier_verified,false), 'production', false,
    'draft', coalesce(p_featured,false), false, coalesce(p_shield_certified,false), 1
  ) RETURNING id INTO v_id;

  PERFORM pg_catalog.set_config('dir3com.lifecycle_create_path', '', true);

  SELECT to_jsonb(p) INTO v_after
  FROM public.products p
  WHERE p.id = v_id;

  IF (v_after->>'status') IS DISTINCT FROM 'draft'
     OR (v_after->>'synthetic')::boolean IS DISTINCT FROM false
     OR (v_after->>'marketplace_environment') IS DISTINCT FROM 'production'
     OR (v_after->>'verified')::boolean IS DISTINCT FROM false
     OR (v_after->>'shield_certified')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_CREATE_TRUTH_FAILED';
  END IF;

  INSERT INTO public.product_audit_events(
    product_id, action, actor_user_id, actor_role, country,
    before_state, after_state, reason
  ) VALUES (
    v_id, 'create_draft', v_actor, v_role, p_country,
    '{}'::jsonb, v_after, nullif(btrim(coalesce(p_reason,'')), '')
  );
  RETURN v_id;
END;
$function$
;
ALTER FUNCTION "public"."create_product_draft_lifecycle"(p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.fail_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_failure_state text, p_error_code text DEFAULT NULL::text, p_ttl_seconds integer DEFAULT 900, p_retry_after_seconds integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_state text := pg_catalog.btrim(coalesce(p_failure_state, ''));
  v_updated integer := 0;
begin
  if v_state not in ('retryable_failed', 'unknown_outcome', 'permanent_failed') then
    return false;
  end if;

  update public.webhook_idempotency_events
  set status = v_state, lease_owner = null, lease_expires_at = null,
      retry_after = case
        when v_state = 'retryable_failed' and coalesce(p_retry_after_seconds, 0) > 0
          then v_now + pg_catalog.make_interval(secs => greatest(p_retry_after_seconds, 0))
        else null
      end,
      last_error_code = nullif(pg_catalog.btrim(coalesce(p_error_code, '')), ''),
      updated_at = v_now,
      expires_at = greatest(expires_at, v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1)))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'send_started';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$
;
ALTER FUNCTION "public"."fail_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_failure_state text, p_error_code text, p_ttl_seconds integer, p_retry_after_seconds integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.get_dabra_provider_metrics(p_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval))
 RETURNS TABLE(provider text, model text, attempt_count bigint, success_count bigint, failure_count bigint, success_rate numeric, fallback_count bigint, average_latency_ms numeric, p50_latency_ms numeric, p95_latency_ms numeric, p99_latency_ms numeric, timeout_count bigint, last_used timestamp with time zone, last_success timestamp with time zone, input_tokens_known_sum bigint, output_tokens_known_sum bigint, input_tokens_unknown_count bigint, output_tokens_unknown_count bigint, token_coverage_complete boolean, total_input_tokens bigint, total_output_tokens bigint, estimated_cost_known_sum numeric, estimated_cost_unknown_count bigint, cost_coverage_complete boolean, estimated_cost_usd numeric, error_categories jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH filtered AS (
    SELECT *
    FROM public.dabra_provider_attempts
    WHERE created_at >= p_since
  ), grouped AS (
    SELECT
      f.provider,
      f.model,
      count(*)::bigint AS attempt_count,
      count(*) FILTER (WHERE f.success)::bigint AS success_count,
      count(*) FILTER (WHERE NOT f.success)::bigint AS failure_count,
      round(count(*) FILTER (WHERE f.success)::numeric / NULLIF(count(*), 0), 6) AS success_rate,
      count(*) FILTER (WHERE f.fallback_hop > 0)::bigint AS fallback_count,
      round(avg(f.latency_ms), 2) AS average_latency_ms,
      round(percentile_cont(0.50) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p50_latency_ms,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p95_latency_ms,
      round(percentile_cont(0.99) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p99_latency_ms,
      count(*) FILTER (WHERE f.error_category IN ('timeout', 'deadline_exceeded'))::bigint AS timeout_count,
      max(f.completed_at) AS last_used,
      max(f.completed_at) FILTER (WHERE f.success) AS last_success,
      sum(f.input_tokens)::bigint AS input_tokens_known_sum,
      sum(f.output_tokens)::bigint AS output_tokens_known_sum,
      count(*) FILTER (WHERE f.input_tokens IS NULL)::bigint AS input_tokens_unknown_count,
      count(*) FILTER (WHERE f.output_tokens IS NULL)::bigint AS output_tokens_unknown_count,
      bool_and(f.input_tokens IS NOT NULL AND f.output_tokens IS NOT NULL) AS token_coverage_complete,
      CASE WHEN bool_and(f.input_tokens IS NOT NULL) THEN sum(f.input_tokens)::bigint END AS total_input_tokens,
      CASE WHEN bool_and(f.output_tokens IS NOT NULL) THEN sum(f.output_tokens)::bigint END AS total_output_tokens,
      round(sum(f.estimated_cost_usd), 12) AS estimated_cost_known_sum,
      count(*) FILTER (WHERE f.estimated_cost_usd IS NULL)::bigint AS estimated_cost_unknown_count,
      bool_and(f.estimated_cost_usd IS NOT NULL) AS cost_coverage_complete,
      CASE
        WHEN bool_and(f.estimated_cost_usd IS NOT NULL) THEN round(sum(f.estimated_cost_usd), 12)
      END AS estimated_cost_usd
    FROM filtered f
    GROUP BY f.provider, f.model
  ), errors AS (
    SELECT f.provider, f.model, jsonb_object_agg(f.error_category, f.error_count ORDER BY f.error_category) AS error_categories
    FROM (
      SELECT provider, model, error_category, count(*)::bigint AS error_count
      FROM filtered
      WHERE error_category IS NOT NULL
      GROUP BY provider, model, error_category
    ) f
    GROUP BY f.provider, f.model
  )
  SELECT
    g.provider,
    g.model,
    g.attempt_count,
    g.success_count,
    g.failure_count,
    g.success_rate,
    g.fallback_count,
    g.average_latency_ms,
    g.p50_latency_ms,
    g.p95_latency_ms,
    g.p99_latency_ms,
    g.timeout_count,
    g.last_used,
    g.last_success,
    g.input_tokens_known_sum,
    g.output_tokens_known_sum,
    g.input_tokens_unknown_count,
    g.output_tokens_unknown_count,
    g.token_coverage_complete,
    g.total_input_tokens,
    g.total_output_tokens,
    g.estimated_cost_known_sum,
    g.estimated_cost_unknown_count,
    g.cost_coverage_complete,
    g.estimated_cost_usd,
    coalesce(e.error_categories, '{}'::jsonb)
  FROM grouped g
  LEFT JOIN errors e ON e.provider = g.provider AND e.model IS NOT DISTINCT FROM g.model
  ORDER BY g.provider, g.model;
$function$
;
ALTER FUNCTION "public"."get_dabra_provider_metrics"(p_since timestamp with time zone) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.get_partner_marketplace_requests(p_actor_user_id uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_deleted timestamptz;
  v_partner_status text;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id',r.id,
    'request_reference',r.request_reference,
    'product_id',r.product_id,
    'request_type',r.request_type,
    'status',r.status,
    'requested_for',r.requested_for,
    'traveller_count',r.traveller_count,
    'marketplace_family',r.marketplace_family,
    'supplier_name',r.supplier_name,
    'service_name',r.service_name,
    'fulfilment_method',r.fulfilment_method,
    'transaction_method',r.transaction_method,
    'handoff_type',r.handoff_type,
    'handoff_reference',r.handoff_reference,
    'handoff_started_at',r.handoff_started_at,
    'next_action',r.next_action,
    'created_at',r.created_at,
    'updated_at',r.updated_at,
    'products',jsonb_build_object(
      'name_ar',p.name_ar,'name_en',p.name_en,'slug',p.slug,
      'city',p.city,'country',p.country
    ),
    'timeline',jsonb_build_array(jsonb_build_object(
      'type','request_submitted','at',r.created_at
    )) || coalesce((
      SELECT jsonb_agg(event ORDER BY event->>'at')
      FROM (
        SELECT jsonb_build_object(
          'type','status_updated','at',a.created_at,
          'previousStatus',a.previous_status,'status',a.new_status
        ) AS event
        FROM public.marketplace_request_audit_logs a
        WHERE a.request_id=r.id
        UNION ALL
        SELECT jsonb_build_object(
          'type',coalesce(e.handoff_type,'handoff') || '_handoff_started',
          'at',e.created_at,'status',e.request_status_at_handoff
        ) AS event
        FROM public.marketplace_request_handoff_events e
        WHERE e.request_id=r.id
      ) timeline_events
    ),'[]'::jsonb)
  )
  FROM public.marketplace_requests r
  LEFT JOIN public.products p ON p.id=r.product_id
  WHERE (p_request_id IS NULL OR r.id=p_request_id)
    AND EXISTS (
      SELECT 1 FROM public.product_availability pa
      WHERE pa.product_id=r.product_id
        AND pa.partner_id=p_actor_user_id
    )
  ORDER BY r.created_at DESC;
END;
$function$
;
ALTER FUNCTION "public"."get_partner_marketplace_requests"(p_actor_user_id uuid, p_request_id uuid) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.is_admin_actor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND lower(p.role) = 'admin'
          AND p.status = 'active'
          AND p.deleted_at IS NULL
      );
    $function$
;
ALTER FUNCTION "public"."is_admin_actor"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.is_ceo_actor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid()
      AND auth.uid()='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
      AND p.role='admin'
      AND p.status='active'
      AND p.deleted_at IS NULL
  )
$function$
;
ALTER FUNCTION "public"."is_ceo_actor"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.normalize_admin_country_key(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE lower(btrim(coalesce(value, '')))
    WHEN 'eg' THEN 'EG'
    WHEN 'egypt' THEN 'EG'
    WHEN 'مصر' THEN 'EG'
    WHEN 'qa' THEN 'QA'
    WHEN 'qatar' THEN 'QA'
    WHEN 'قطر' THEN 'QA'
    WHEN 'sa' THEN 'SA'
    WHEN 'ksa' THEN 'SA'
    WHEN 'saudi arabia' THEN 'SA'
    WHEN 'السعودية' THEN 'SA'
    WHEN 'sy' THEN 'SY'
    WHEN 'syria' THEN 'SY'
    WHEN 'سوريا' THEN 'SY'
    WHEN 'lb' THEN 'LB'
    WHEN 'lebanon' THEN 'LB'
    WHEN 'لبنان' THEN 'LB'
    ELSE upper(btrim(coalesce(value, '')))
  END
$function$
;
ALTER FUNCTION "public"."normalize_admin_country_key"(value text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.normalize_team_email(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT lower(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'));
$function$
;
ALTER FUNCTION "public"."normalize_team_email"(value text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.persist_partner_portal_state(p_assets jsonb DEFAULT '[]'::jsonb, p_media jsonb DEFAULT '[]'::jsonb, p_reviews jsonb DEFAULT '[]'::jsonb, p_contracts jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into partner_portal_assets(id, owner_id, owner_kind, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'owner_kind', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_assets) item
  on conflict (id) do update set owner_id=excluded.owner_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_asset_media(id, owner_id, asset_id, owner_kind, storage_path, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'asset_id', item->>'owner_kind', item->>'storage_path', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_media) item
  on conflict (id) do update set owner_id=excluded.owner_id, asset_id=excluded.asset_id, owner_kind=excluded.owner_kind, storage_path=excluded.storage_path, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_review_queue(id, owner_id, asset_id, media_id, owner_kind, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'asset_id', nullif(item->>'media_id',''), item->>'owner_kind', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_reviews) item
  on conflict (id) do update set owner_id=excluded.owner_id, asset_id=excluded.asset_id, media_id=excluded.media_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_contracts(id, owner_id, owner_kind, record)
  select item->>'id', (item->>'owner_id')::uuid, item->>'owner_kind', item->'record' from jsonb_array_elements(p_contracts) item
  on conflict (id) do update set owner_id=excluded.owner_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=now();
end;
$function$
;
ALTER FUNCTION "public"."persist_partner_portal_state"(p_assets jsonb, p_media jsonb, p_reviews jsonb, p_contracts jsonb) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_block_product_image_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  uat_path_parts text[];
begin
  if new.image_url ~ '^https://images\.pexels\.com/'
     and coalesce(new.caption, '') like 'phase0_seed|SYSTEM_IMPORT|%'
     and exists (
       select 1
       from public.products p
       where p.id = new.product_id
         and p.synthetic = true
         and p.environment = 'staging'
     ) then
    new.synthetic := true;
    new.environment := 'staging';
    return new;
  end if;

  uat_path_parts := regexp_match(
    new.image_url,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/[0-9a-f-]{36}\.(jpg|png|webp)$',
    'i'
  );

  if uat_path_parts is not null
     and uat_path_parts[2]::uuid = new.product_id
     and exists (
       select 1
       from public.product_availability pa
       join public.products p on p.id = pa.product_id
       where pa.product_id = new.product_id
         and pa.partner_id = uat_path_parts[1]::uuid
         and p.environment = 'staging'
     ) then
    new.environment := 'staging';
    return new;
  end if;

  raise exception 'PHASE_ZERO_MEDIA_UPLOAD_LOCKED' using errcode = 'P0001';
end;
$function$
;
ALTER FUNCTION "public"."phase0_block_product_image_insert"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_enforce_alhana_product_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1
    from public.product_availability pa
    join public.partners p on p.id = pa.partner_id
    where pa.product_id = new.id
      and p.slug = 'abu-al-anaq-drive'
      and p.status <> 'approved'
  ) then
    new.status := 'draft';
    new.verified := false;
    new.shield_certified := false;
  end if;
  return new;
end;
$function$
;
ALTER FUNCTION "public"."phase0_enforce_alhana_product_state"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_force_alhana_product_state_on_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1 from public.partners p
    where p.id = new.partner_id
      and p.slug = 'abu-al-anaq-drive'
      and p.status <> 'approved'
  ) then
    update public.products
       set status = 'draft',
           verified = false,
           shield_certified = false,
           featured = false,
           synthetic = true,
           environment = 'staging',
           updated_at = now()
     where id = new.product_id;
  end if;
  return new;
end;
$function$
;
ALTER FUNCTION "public"."phase0_force_alhana_product_state_on_link"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_force_new_product_draft_staging()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_lifecycle_owner oid;
  v_trusted_lifecycle_create boolean := false;
BEGIN
  SELECT p.proowner
    INTO v_lifecycle_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text)'
  );

  v_trusted_lifecycle_create :=
    pg_catalog.current_setting('dir3com.lifecycle_create_path', true)
      = 'create_product_draft_lifecycle:v1'
    AND v_lifecycle_owner IS NOT NULL
    AND current_user = pg_catalog.pg_get_userbyid(v_lifecycle_owner);

  NEW.status := 'draft';
  NEW.verified := false;
  NEW.shield_certified := false;
  NEW.featured := false;
  NEW.environment := 'staging';

  IF v_trusted_lifecycle_create THEN
    NEW.synthetic := false;
    NEW.marketplace_environment := 'production';
  ELSE
    NEW.synthetic := true;
  END IF;

  RETURN NEW;
END;
$function$
;
ALTER FUNCTION "public"."phase0_force_new_product_draft_staging"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_lock_staging_synthetic_products()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.synthetic,false) = true and new.environment = 'staging' then
    new.status := 'draft';
    new.featured := false;
    new.verified := false;
    new.shield_certified := false;
  end if;
  return new;
end;
$function$
;
ALTER FUNCTION "public"."phase0_lock_staging_synthetic_products"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.phase0_normalize_alhana_linked_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1 from public.partners p
    where p.id = new.partner_id
      and p.slug = 'abu-al-anaq-drive'
      and p.status <> 'approved'
  ) then
    update public.products
    set status='draft', verified=false, shield_certified=false
    where id = new.product_id;
  end if;
  return new;
end;
$function$
;
ALTER FUNCTION "public"."phase0_normalize_alhana_linked_product"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.product_lifecycle_actor_role(p_country text, p_permission text DEFAULT 'products:write'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_grant public.team_access_grants%ROWTYPE;
  v_country text := public.normalize_admin_country_key(p_country);
BEGIN
  v_role := public.product_lifecycle_session_role(p_permission);
  IF v_role = 'admin' THEN RETURN v_role; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor
    AND g.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_grant.access_level <> 'global_admin'
     AND NOT ('admin:full' = ANY(v_grant.permissions)) THEN
    IF v_country = '' OR NOT EXISTS (
      SELECT 1
      FROM unnest(v_grant.country_scope) AS c(country_value)
      WHERE public.normalize_admin_country_key(c.country_value) = v_country
    ) THEN
      RAISE EXCEPTION 'COUNTRY_SCOPE_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN v_role;
END;
$function$
;
ALTER FUNCTION "public"."product_lifecycle_actor_role"(p_country text, p_permission text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.product_lifecycle_session_role(p_permission text DEFAULT 'products:write'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_grant public.team_access_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = v_actor
    AND p.status = 'active'
    AND p.deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_DENIED' USING ERRCODE='42501';
  END IF;
  IF v_role = 'admin' THEN RETURN v_role; END IF;

  SELECT * INTO v_grant
  FROM public.team_access_grants g
  WHERE g.invited_user_id = v_actor
    AND g.status = 'active'
  FOR SHARE;

  IF NOT FOUND OR NOT (
    v_grant.access_level = 'global_admin'
    OR 'admin:full' = ANY(v_grant.permissions)
    OR p_permission = ANY(v_grant.permissions)
  ) THEN
    RAISE EXCEPTION 'PRODUCT_LIFECYCLE_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN v_role;
END;
$function$
;
ALTER FUNCTION "public"."product_lifecycle_session_role"(p_permission text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.provision_profile_for_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_email text;
  v_full_name text;
  v_inserted_count integer := 0;
BEGIN
  v_email := nullif(trim(NEW.email), '');
  IF v_email IS NULL THEN
    v_email := format('user-%s@placeholder.local', NEW.id);
  END IF;

  v_full_name := nullif(
    trim(
      coalesce(
        NEW.raw_user_meta_data ->> 'full_name_ar',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name'
      )
    ),
    ''
  );

  IF v_full_name IS NULL THEN
    v_full_name := split_part(v_email, '@', 1);
    IF v_full_name = '' THEN
      v_full_name := 'user';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, v_email, v_full_name)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count = 0 THEN
    -- Keep email/full_name synchronized for pre-existing backfilled rows.
    UPDATE public.profiles
    SET email = v_email,
        full_name = v_full_name,
        updated_at = now()
    WHERE id = NEW.id
      AND (email IS DISTINCT FROM v_email OR full_name IS DISTINCT FROM v_full_name);
  END IF;

  RETURN NEW;
END;
$function$
;
ALTER FUNCTION "public"."provision_profile_for_auth_user"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.publish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text DEFAULT 'Admin publish'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
  v_synthetic boolean;
  v_environment text;
  v_family text;
  v_fulfilment text;
  v_transaction text;
  v_supply text;
  v_supplier_verified boolean;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p), p.lifecycle_version, p.country, p.status, p.deleted_at,
         p.synthetic, p.marketplace_environment, p.marketplace_family,
         p.fulfilment_state, p.transaction_method, p.supply_type, p.supplier_verified
    INTO v_before, v_version, v_country, v_status, v_deleted,
         v_synthetic, v_environment, v_family, v_fulfilment, v_transaction,
         v_supply, v_supplier_verified
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;
  IF v_synthetic IS DISTINCT FROM false THEN RAISE EXCEPTION 'PRODUCT_SYNTHETIC_BLOCKED'; END IF;
  IF v_environment IS DISTINCT FROM 'production' THEN RAISE EXCEPTION 'PRODUCT_ENVIRONMENT_BLOCKED'; END IF;
  IF v_family IS NULL OR v_family NOT IN ('drive','stay','fly','concierge','vip') THEN RAISE EXCEPTION 'PRODUCT_FAMILY_REQUIRED'; END IF;
  IF v_supply IS NULL OR v_supply NOT IN ('verified_local_partner','global_travel_partner','dir3com_managed') THEN
    RAISE EXCEPTION 'PRODUCT_SUPPLY_NOT_AUTHORITATIVE';
  END IF;
  IF v_supplier_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'PRODUCT_SUPPLIER_NOT_VERIFIED'; END IF;

  IF v_fulfilment IS NULL OR v_transaction IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED';
  ELSIF v_fulfilment = 'live_bookable' AND v_transaction = 'instant_booking' THEN
    -- No canonical executable-supply binding exists in the current product
    -- schema. Publication must fail closed instead of treating metadata as proof.
    RAISE EXCEPTION 'PRODUCT_INSTANT_SUPPLY_UNPROVEN';
  ELSIF NOT (
    (v_fulfilment = 'verified_requestable' AND v_transaction = 'request_to_confirm')
    OR (v_fulfilment = 'verified_quote' AND v_transaction = 'request_quote')
    OR (v_fulfilment IN ('unavailable','availability_unknown') AND v_transaction = 'none')
  ) THEN
    RAISE EXCEPTION 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED';
  END IF;

  UPDATE public.products SET
    status='published', lifecycle_version=lifecycle_version+1,
    published_at=now(), published_by=v_actor, updated_at=now()
  WHERE id=p_product_id
  RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'publish',v_actor,v_role,v_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$function$
;
ALTER FUNCTION "public"."publish_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.reject_marketplace_request_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'DIR120_REQUEST_AUDIT_APPEND_ONLY';
END;
$function$
;
ALTER FUNCTION "public"."reject_marketplace_request_audit_mutation"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.reject_marketplace_request_handoff_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception using errcode = '55000', message = 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY';
end;
$function$
;
ALTER FUNCTION "public"."reject_marketplace_request_handoff_event_mutation"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.reject_operations_record_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN RAISE EXCEPTION 'OPERATIONS_RECORD_APPEND_ONLY'; END $function$
;
ALTER FUNCTION "public"."reject_operations_record_mutation"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.reject_product_audit_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRODUCT_AUDIT_APPEND_ONLY';
END;
$function$
;
ALTER FUNCTION "public"."reject_product_audit_event_mutation"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.reserve_whatsapp_event(p_event_key text, p_ttl_seconds integer DEFAULT 900)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inserted integer := 0;
  v_ttl_seconds integer := greatest(coalesce(p_ttl_seconds, 900), 1);
begin
  if coalesce(trim(p_event_key), '') = '' then
    return false;
  end if;

  delete from public.webhook_idempotency_events
  where event_key in (
    select event_key
    from public.webhook_idempotency_events
    where expires_at <= now()
    order by expires_at asc
    limit 500
  );

  insert into public.webhook_idempotency_events (event_key, source, expires_at)
  values (trim(p_event_key), 'whatsapp', now() + make_interval(secs => v_ttl_seconds))
  on conflict (event_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$function$
;
ALTER FUNCTION "public"."reserve_whatsapp_event"(p_event_key text, p_ttl_seconds integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.resolve_marketplace_request_confirmation_evidence(p_request_id uuid, p_confirmation_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  current_request public.marketplace_requests%ROWTYPE;
  supplied_evidence jsonb := COALESCE(p_confirmation_evidence, '{}'::jsonb);
  supplier_evidence public.marketplace_request_evidence%ROWTYPE;
  payment_evidence public.marketplace_request_evidence%ROWTYPE;
  quote_evidence public.marketplace_request_evidence%ROWTYPE;
  confirmation_source text := NULLIF(BTRIM(supplied_evidence->>'confirmation_source'), '');
  confirmation_reference text := NULLIF(BTRIM(supplied_evidence->>'confirmation_reference'), '');
  payment_reference text := NULLIF(BTRIM(supplied_evidence->>'payment_reference'), '');
  quote_reference text := NULLIF(BTRIM(supplied_evidence->>'quote_reference'), '');
  transaction_mode text;
BEGIN
  SELECT * INTO current_request
  FROM public.marketplace_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DIR120_REQUEST_NOT_FOUND';
  END IF;

  transaction_mode := COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type);

  IF transaction_mode NOT IN ('request_to_confirm', 'request_quote') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_CANONICAL_EVIDENCE_UNAVAILABLE';
  END IF;

  IF current_request.user_id IS NULL
    OR current_request.product_id IS NULL
    OR NULLIF(BTRIM(current_request.supplier_name), '') IS NULL
    OR confirmation_source NOT IN ('supplier', 'provider')
    OR confirmation_reference IS NULL
    OR payment_reference IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_CONFIRMATION_EVIDENCE_REQUIRED';
  END IF;

  SELECT * INTO supplier_evidence
  FROM public.marketplace_request_evidence
  WHERE request_id = current_request.id
    AND user_id = current_request.user_id
    AND product_id = current_request.product_id
    AND supplier_context = current_request.supplier_name
    AND evidence_type = 'supplier_confirmation'
    AND source_type = confirmation_source
    AND evidence_reference = confirmation_reference
    AND status = 'confirmed'
    AND accepted_at IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE';
  END IF;

  SELECT * INTO payment_evidence
  FROM public.marketplace_request_evidence
  WHERE request_id = current_request.id
    AND user_id = current_request.user_id
    AND product_id = current_request.product_id
    AND supplier_context = current_request.supplier_name
    AND evidence_type = 'payment'
    AND source_type = 'payment_processor'
    AND evidence_reference = payment_reference
    AND status IN ('verified', 'captured', 'settled')
    AND accepted_at IS NOT NULL
    AND amount IS NOT NULL
    AND amount > 0
    AND NULLIF(BTRIM(currency), '') IS NOT NULL
    AND amount = current_request.quote_amount
    AND currency = current_request.quote_currency
  FOR SHARE;

  IF current_request.payment_status <> 'payment_verified'
    OR current_request.quote_amount IS NULL
    OR current_request.quote_amount <= 0
    OR NULLIF(BTRIM(current_request.quote_currency), '') IS NULL
    OR NOT FOUND
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE';
  END IF;

  IF transaction_mode = 'request_quote' THEN
    IF quote_reference IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_REQUIRED';
    END IF;

    SELECT * INTO quote_evidence
    FROM public.marketplace_request_evidence
    WHERE request_id = current_request.id
      AND user_id = current_request.user_id
      AND product_id = current_request.product_id
      AND supplier_context = current_request.supplier_name
      AND evidence_type = 'quote'
      AND source_type IN ('supplier', 'provider', 'operations')
      AND evidence_reference = quote_reference
      AND status = 'accepted'
      AND accepted_at IS NOT NULL
      AND amount = current_request.quote_amount
      AND currency = current_request.quote_currency
      AND expires_at IS NOT NULL
      AND expires_at > NOW()
      AND current_request.quote_expires_at IS NOT NULL
      AND current_request.quote_expires_at > NOW()
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE';
    END IF;

  ELSIF quote_reference IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_NOT_APPLICABLE';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'confirmation_source', supplier_evidence.source_type,
    'confirmation_reference', supplier_evidence.evidence_reference,
    'supplier_evidence_id', supplier_evidence.id,
    'payment_reference', payment_evidence.evidence_reference,
    'payment_evidence_id', payment_evidence.id,
    'quote_reference', CASE WHEN transaction_mode = 'request_quote' THEN quote_evidence.evidence_reference END,
    'quote_evidence_id', CASE WHEN transaction_mode = 'request_quote' THEN quote_evidence.id END,
    'validation', 'authoritative_request_bound_v1'
  ));
END;
$function$
;
ALTER FUNCTION "public"."resolve_marketplace_request_confirmation_evidence"(p_request_id uuid, p_confirmation_evidence jsonb) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.save_team_access_grant(p_user_id uuid, p_email text, p_job_title text, p_access_level text, p_country_scope text[], p_permissions text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_email text:=public.normalize_team_email(p_email);
  v_auth_email text;
  v_auth_ids uuid[];
  v_name text;
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_target_deleted timestamptz;
  v_result uuid;
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR v_email IS NULL OR v_email='' OR position('@' in v_email)=0
    OR p_job_title IS NULL OR btrim(p_job_title)='' OR length(p_job_title)>120
    OR p_access_level IS NULL OR p_access_level NOT IN ('global_admin','scoped_staff')
    OR p_country_scope IS NULL OR cardinality(p_country_scope)>20
    OR array_position(p_country_scope,NULL) IS NOT NULL OR p_permissions IS NULL
    OR array_position(p_permissions,NULL) IS NOT NULL
    OR NOT p_permissions <@ ARRAY['admin:full','operations:read','operations:write','customers:read','customers:write','partners:read','partners:write','products:read','products:write','finance:read','finance:write','verification:read','verification:write']::text[]
  THEN RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023'; END IF;
  IF p_user_id=v_actor AND p_access_level<>'global_admin' THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;

  SELECT public.normalize_team_email(email),
         coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',split_part(v_email,'@',1))
    INTO v_auth_email,v_name
  FROM auth.users WHERE id=p_user_id FOR SHARE;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id) INTO v_auth_ids FROM auth.users
  WHERE public.normalize_team_email(email)=v_email;
  IF coalesce(cardinality(v_auth_ids),0)<>1 OR v_auth_ids[1]<>p_user_id THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;

  SELECT deleted_at INTO v_target_deleted FROM public.profiles WHERE id=p_user_id FOR SHARE;
  IF FOUND AND v_target_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_DELETED' USING ERRCODE='42501';
  END IF;

  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
  WHERE invited_user_id=p_user_id OR public.normalize_team_email(email)=v_email;
  IF cardinality(v_ids)>1 THEN RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023'; END IF;
  IF cardinality(v_ids)=1 THEN
    SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
    IF v_grant.invited_user_id IS NOT NULL AND v_grant.invited_user_id<>p_user_id THEN
      RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
    END IF;
    UPDATE public.team_access_grants SET
      email=v_email,invited_user_id=p_user_id,job_title=p_job_title,
      access_level=p_access_level,country_scope=p_country_scope,
      permissions=CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,
      status='active',updated_at=now()
    WHERE id=v_grant.id RETURNING id INTO v_result;
  ELSE
    INSERT INTO public.team_access_grants(email,invited_user_id,job_title,access_level,country_scope,permissions,status,created_by)
    VALUES(v_email,p_user_id,p_job_title,p_access_level,p_country_scope,
      CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,'active',v_actor)
    RETURNING id INTO v_result;
  END IF;
  IF p_access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  INSERT INTO public.profiles(id,email,full_name,role,status)
  VALUES(p_user_id,v_email,v_name,v_role,'active')
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,status=EXCLUDED.status
    WHERE public.profiles.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_DELETED' USING ERRCODE='42501'; END IF;
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
END;
$function$
;
ALTER FUNCTION "public"."save_team_access_grant"(p_user_id uuid, p_email text, p_job_title text, p_access_level text, p_country_scope text[], p_permissions text[]) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.set_team_access_status(p_email text, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_status public.profiles.status%TYPE;
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
  WHERE public.normalize_team_email(email)=public.normalize_team_email(p_email);
  IF coalesce(cardinality(v_ids),0)=0 THEN RAISE EXCEPTION 'TEAM_ACCESS_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF cardinality(v_ids)<>1 THEN RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
  IF v_grant.invited_user_id=v_actor AND (p_status<>'active' OR v_grant.access_level<>'global_admin') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF v_grant.access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  IF p_status='active' THEN v_status:='active'; ELSE v_status:='inactive'; END IF;
  UPDATE public.team_access_grants SET status=p_status,updated_at=now() WHERE id=v_grant.id;
  IF v_grant.invited_user_id IS NOT NULL THEN
    UPDATE public.profiles SET status=v_status,role=v_role
    WHERE id=v_grant.invited_user_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN v_grant.id;
END;
$function$
;
ALTER FUNCTION "public"."set_team_access_status"(p_email text, p_status text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.start_partner_marketplace_request_handoff(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text)
 RETURNS TABLE(request_id uuid, request_reference text, product_id uuid, initiated_by_partner_user_id uuid, handoff_type text, handoff_reference text, request_status_at_handoff text, whatsapp_destination text, message_snapshot text, created_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_profile_status text;
  v_deleted timestamptz;
  v_partner_status text;
  v_request_status text;
  v_product_id uuid;
  v_request_reference text;
  v_service_name text;
  v_requested_for timestamptz;
  v_traveller_count integer;
  v_reference text;
  v_destination text := nullif(btrim(coalesce(p_whatsapp_destination,'')), '');
  v_message text;
  v_availability_id uuid;
  v_event public.marketplace_request_handoff_events%ROWTYPE;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_profile_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_profile_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT r.status,r.product_id,r.request_reference,r.service_name,r.requested_for,r.traveller_count
    INTO v_request_status,v_product_id,v_request_reference,v_service_name,v_requested_for,v_traveller_count
  FROM public.marketplace_requests r
  WHERE r.id=p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  v_reference := 'WA:' || v_request_reference;

  SELECT pa.id INTO v_availability_id
  FROM public.product_availability pa
  WHERE pa.product_id=v_product_id AND pa.partner_id=p_actor_user_id
  ORDER BY pa.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_PARTNER_SCOPE_DENIED'; END IF;

  SELECT e.* INTO v_event
  FROM public.marketplace_request_handoff_events e
  WHERE e.request_id=p_request_id AND e.handoff_type='whatsapp';

  IF FOUND THEN
    IF v_event.initiated_by_partner_user_id IS DISTINCT FROM p_actor_user_id
       OR v_event.product_id IS DISTINCT FROM v_product_id
       OR v_event.handoff_reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_CONFLICT' USING ERRCODE='23514';
    END IF;
    IF v_event.whatsapp_destination IS NULL OR v_event.message_snapshot IS NULL THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
    RETURN QUERY SELECT
      v_event.request_id,v_request_reference,v_event.product_id,
      v_event.initiated_by_partner_user_id,v_event.handoff_type,
      v_event.handoff_reference,v_event.request_status_at_handoff,
      v_event.whatsapp_destination,v_event.message_snapshot,
      v_event.created_at,true;
    RETURN;
  END IF;

  IF v_destination IS NULL OR v_destination !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'WHATSAPP_DESTINATION_INVALID' USING ERRCODE='22023';
  END IF;

  v_message := format('DIR3COM %s',v_request_reference)
    || CASE WHEN nullif(btrim(coalesce(v_service_name,'')),'') IS NOT NULL
         THEN E'\nService: ' || v_service_name ELSE '' END
    || CASE WHEN v_requested_for IS NOT NULL
         THEN E'\nRequested for: ' || to_char(v_requested_for AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') ELSE '' END
    || E'\nTravellers: ' || coalesce(v_traveller_count,1)::text
    || E'\nCurrent status: ' || v_request_status;

  UPDATE public.marketplace_requests SET
    handoff_type='whatsapp', fulfilment_method='whatsapp_handoff',
    handoff_reference=v_reference, handoff_started_at=coalesce(handoff_started_at,now()),
    next_action='await_partner_response', updated_at=now()
  WHERE id=p_request_id;

  INSERT INTO public.marketplace_request_handoff_events(
    request_id,product_id,initiated_by_partner_user_id,
    handoff_type,handoff_reference,request_status_at_handoff,
    whatsapp_destination,message_snapshot
  ) VALUES (
    p_request_id,v_product_id,p_actor_user_id,
    'whatsapp',v_reference,v_request_status,v_destination,v_message
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT
    v_event.request_id,v_request_reference,v_event.product_id,
    v_event.initiated_by_partner_user_id,v_event.handoff_type,
    v_event.handoff_reference,v_event.request_status_at_handoff,
    v_event.whatsapp_destination,v_event.message_snapshot,
    v_event.created_at,false;
END;
$function$
;
ALTER FUNCTION "public"."start_partner_marketplace_request_handoff"(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.transition_marketplace_request(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS marketplace_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_request public.marketplace_requests%ROWTYPE;
  updated_request public.marketplace_requests%ROWTYPE;
  caller_database_role text := NULLIF(current_setting('role', true), 'none');
  caller_claims jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  trusted_actor_id uuid;
  actor_identity_value text;
  actor_role_value text;
  actor_source_value text;
  next_action_value text;
  authoritative_evidence jsonb := '{}'::jsonb;
BEGIN
  IF p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_INVALID_TRANSITION_INPUT';
  END IF;

  IF caller_database_role = 'authenticated'
    AND caller_claims->>'role' = 'authenticated'
  THEN
    trusted_actor_id := auth.uid();

    SELECT 'admin'
    INTO actor_role_value
    FROM public.profiles
    WHERE id = trusted_actor_id
      AND LOWER(role) IN ('admin', 'super_admin')
      AND status = 'active'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIR120_ACTOR_NOT_AUTHORIZED';
    END IF;

    actor_identity_value := trusted_actor_id::text;
    actor_source_value := 'authenticated_admin';
  ELSIF caller_database_role = 'service_role'
    AND caller_claims->>'role' = 'service_role'
  THEN
    trusted_actor_id := NULL;
    actor_identity_value := 'system:service_role';
    actor_role_value := 'service_role';
    actor_source_value := 'system_service';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIR120_ACTOR_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO current_request
  FROM public.marketplace_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DIR120_REQUEST_NOT_FOUND';
  END IF;

  IF current_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  IF current_request.status = p_new_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_NOOP_TRANSITION';
  END IF;

  IF NOT (
    (current_request.status = 'request_submitted' AND p_new_status IN ('under_review', 'declined', 'cancelled')) OR
    (current_request.status = 'under_review' AND p_new_status IN ('awaiting_supplier', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_supplier' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_availability' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'payment_verification' AND p_new_status IN ('confirmed', 'declined', 'cancelled'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_TRANSITION_NOT_ALLOWED';
  END IF;

  IF p_new_status = 'confirmed' THEN
    IF COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type) = 'request_quote'
      AND current_request.status <> 'payment_verification'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_NOT_ACCEPTED_FOR_CONFIRMATION';
    END IF;

    authoritative_evidence := public.resolve_marketplace_request_confirmation_evidence(
      current_request.id,
      p_confirmation_evidence
    );
  END IF;

  next_action_value := CASE p_new_status
    WHEN 'under_review' THEN 'assign_owner'
    WHEN 'awaiting_supplier' THEN 'contact_supplier'
    WHEN 'confirmed' THEN 'notify_customer'
    WHEN 'declined' THEN 'notify_customer'
    WHEN 'cancelled' THEN 'none'
    ELSE NULL
  END;

  UPDATE public.marketplace_requests
  SET status = p_new_status,
      next_action = next_action_value,
      confirmation_evidence = CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE confirmation_evidence END,
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = p_expected_status
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  INSERT INTO public.marketplace_request_audit_logs (
    request_id,
    actor_user_id,
    actor_identity,
    actor_role,
    actor_source,
    previous_status,
    new_status,
    event_type,
    metadata
  ) VALUES (
    current_request.id,
    trusted_actor_id,
    actor_identity_value,
    actor_role_value,
    actor_source_value,
    current_request.status,
    p_new_status,
    'request_status_updated',
    jsonb_build_object(
      'request_reference', current_request.request_reference,
      'transaction_method', COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type),
      'next_action', next_action_value,
      'confirmation_evidence', CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE '{}'::jsonb END
    )
  );

  RETURN updated_request;
END;
$function$
;
ALTER FUNCTION "public"."transition_marketplace_request"(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.unpublish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text DEFAULT 'Admin unpublish'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p),p.lifecycle_version,p.country,p.status,p.deleted_at
    INTO v_before,v_version,v_country,v_status,v_deleted
  FROM public.products p
  WHERE p.id=p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'PRODUCT_NOT_PUBLISHED'; END IF;

  UPDATE public.products SET status='draft', lifecycle_version=lifecycle_version+1, updated_at=now()
  WHERE id=p_product_id RETURNING lifecycle_version INTO v_version;
  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id=p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'unpublish',v_actor,v_role,v_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$function$
;
ALTER FUNCTION "public"."unpublish_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION public.update_product_draft_lifecycle(p_product_id uuid, p_expected_version integer, p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text DEFAULT 'Admin draft updated'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_status text;
  v_deleted timestamptz;
  v_current_country text;
BEGIN
  v_role := public.product_lifecycle_session_role('products:write');
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'PRODUCT_VERSION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT to_jsonb(p), p.lifecycle_version, p.status, p.deleted_at, p.country
    INTO v_before, v_version, v_status, v_deleted, v_current_country
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_ARCHIVED'; END IF;
  PERFORM public.product_lifecycle_actor_role(v_current_country, 'products:write');
  PERFORM public.product_lifecycle_actor_role(p_country, 'products:write');
  IF v_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PRODUCT_VERSION_STALE'; END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'PRODUCT_NOT_DRAFT'; END IF;

  UPDATE public.products SET
    name_ar = coalesce(p_name_ar,''), name_en = coalesce(p_name_en,''), slug = p_slug,
    base_price = greatest(coalesce(p_base_price,0),0), country = p_country,
    city = nullif(btrim(coalesce(p_city,'')), ''), marketplace_family = p_marketplace_family,
    fulfilment_state = p_fulfilment_state, transaction_method = p_transaction_method,
    supply_type = p_supply_type, supplier_verified = coalesce(p_supplier_verified,false),
    featured = coalesce(p_featured,false), shield_certified = coalesce(p_shield_certified,false),
    lifecycle_version = lifecycle_version + 1, updated_at = now()
  WHERE id = p_product_id
  RETURNING lifecycle_version INTO v_version;

  SELECT to_jsonb(p) INTO v_after FROM public.products p WHERE p.id = p_product_id;
  INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country,before_state,after_state,reason)
  VALUES(p_product_id,'update_draft',v_actor,v_role,p_country,v_before,v_after,nullif(btrim(coalesce(p_reason,'')),''));
  RETURN v_version;
END;
$function$
;
ALTER FUNCTION "public"."update_product_draft_lifecycle"(p_product_id uuid, p_expected_version integer, p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) OWNER TO "postgres";
ALTER TABLE "public"."activity_timeline" ADD CONSTRAINT "activity_timeline_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."assignment_logs" ADD CONSTRAINT "assignment_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."assignment_rules" ADD CONSTRAINT "assignment_rules_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_quantity_check" CHECK (quantity > 0);
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text]));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_booking_reference_key" UNIQUE (booking_reference);
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_payment_status_check" CHECK (payment_status IS NULL OR (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'voided'::text])));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_positive_guests" CHECK (guests IS NULL OR guests >= 1 AND guests <= 20);
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_positive_prices" CHECK ((product_price IS NULL OR product_price >= 0::numeric) AND (total_price IS NULL OR total_price >= 0::numeric) AND total_amount >= 0::numeric AND (discount_amount IS NULL OR discount_amount >= 0::numeric));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'failed'::text]));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_valid_dates" CHECK (arrival_date IS NULL OR departure_date IS NULL OR departure_date > arrival_date);
ALTER TABLE "public"."customer_activity" ADD CONSTRAINT "customer_activity_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_cost_truth" CHECK (estimated_cost_usd IS NULL AND pricing_version IS NULL OR estimated_cost_usd IS NOT NULL AND pricing_version IS NOT NULL);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_error_category_check" CHECK (error_category = ANY (ARRAY['timeout'::text, 'upstream_503'::text, 'rate_limit'::text, 'authentication'::text, 'configuration'::text, 'model_access'::text, 'provider_error'::text, 'deadline_exceeded'::text, 'unknown'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_error_truth" CHECK (success AND error_category IS NULL OR NOT success AND error_category IS NOT NULL);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_estimated_cost_usd_check" CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0::numeric);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_fallback_from_check" CHECK (fallback_from IS NULL OR (fallback_from = ANY (ARRAY['openai'::text, 'gemini'::text, 'anthropic'::text, 'xai'::text, 'deepseek'::text, 'qwen'::text, 'mistral'::text])));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_fallback_hop_check" CHECK (fallback_hop >= 0);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_fallback_reason_check" CHECK (fallback_reason IS NULL OR (fallback_reason = ANY (ARRAY['timeout'::text, 'upstream_503'::text, 'rate_limit'::text, 'authentication'::text, 'configuration'::text, 'model_access'::text, 'provider_error'::text, 'deadline_exceeded'::text, 'unknown'::text])));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_grounding_status_check" CHECK (grounding_status = ANY (ARRAY['grounded-global-web'::text, 'answered-general'::text, 'fallback-provider-unavailable'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_input_tokens_check" CHECK (input_tokens IS NULL OR input_tokens >= 0);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_intent_class_check" CHECK (intent_class = ANY (ARRAY['internal'::text, 'general'::text, 'fresh-web'::text, 'travel-plan'::text, 'other'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_language_check" CHECK (language = ANY (ARRAY['ar'::text, 'en'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_latency_ms_check" CHECK (latency_ms >= 0);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_output_tokens_check" CHECK (output_tokens IS NULL OR output_tokens >= 0);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_pkey" PRIMARY KEY (attempt_id);
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_provider_check" CHECK (provider = ANY (ARRAY['openai'::text, 'gemini'::text, 'anthropic'::text, 'xai'::text, 'deepseek'::text, 'qwen'::text, 'mistral'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_route_check" CHECK (route = ANY (ARRAY['fast-chat'::text, 'web'::text]));
ALTER TABLE "public"."dabra_provider_attempts" ADD CONSTRAINT "dabra_provider_attempts_time_order" CHECK (completed_at >= started_at);
ALTER TABLE "public"."destinations" ADD CONSTRAINT "destinations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."destinations" ADD CONSTRAINT "destinations_slug_key" UNIQUE (slug);
ALTER TABLE "public"."destinations" ADD CONSTRAINT "destinations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text]));
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_actor_identity_check" CHECK (NULLIF(btrim(actor_identity), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_actor_role_check" CHECK (actor_role = ANY (ARRAY['admin'::text, 'staff'::text, 'service_role'::text]));
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_actor_source_check" CHECK (actor_source = ANY (ARRAY['authenticated_admin'::text, 'system_service'::text]));
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_event_type_check" CHECK (event_type = 'request_status_updated'::text);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_metadata_check" CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_new_status_check" CHECK (NULLIF(btrim(new_status), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_previous_status_check" CHECK (NULLIF(btrim(previous_status), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_status_changed" CHECK (previous_status <> new_status);
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_truthful_actor" CHECK (actor_source = 'authenticated_admin'::text AND actor_user_id IS NOT NULL AND actor_role = 'admin'::text AND actor_identity = actor_user_id::text OR actor_source = 'system_service'::text AND actor_user_id IS NULL AND actor_role = 'service_role'::text AND actor_identity = 'system:service_role'::text);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_check" CHECK (evidence_type = 'supplier_confirmation'::text AND (status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'rejected'::text])) OR evidence_type = 'payment'::text AND (status = ANY (ARRAY['verified'::text, 'captured'::text, 'settled'::text, 'failed'::text, 'rejected'::text])) OR evidence_type = 'quote'::text AND (status = ANY (ARRAY['accepted'::text, 'cancelled'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_check1" CHECK (evidence_type <> 'quote'::text OR amount IS NOT NULL AND amount > 0::numeric AND NULLIF(btrim(currency), ''::text) IS NOT NULL AND accepted_at IS NOT NULL AND expires_at IS NOT NULL);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_check2" CHECK (evidence_type <> 'payment'::text OR amount IS NOT NULL AND amount > 0::numeric AND NULLIF(btrim(currency), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_check3" CHECK ((evidence_type <> ALL (ARRAY['supplier_confirmation'::text, 'payment'::text])) OR accepted_at IS NOT NULL);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_evidence_reference_check" CHECK (NULLIF(btrim(evidence_reference), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_evidence_type_check" CHECK (evidence_type = ANY (ARRAY['supplier_confirmation'::text, 'payment'::text, 'quote'::text]));
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_evidence_type_evidence_referen_key" UNIQUE (evidence_type, evidence_reference);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_source_type_check" CHECK (source_type = ANY (ARRAY['supplier'::text, 'provider'::text, 'payment_processor'::text, 'operations'::text]));
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_status_check" CHECK (status = ANY (ARRAY['confirmed'::text, 'verified'::text, 'captured'::text, 'settled'::text, 'accepted'::text, 'cancelled'::text, 'failed'::text, 'rejected'::text, 'expired'::text]));
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_supplier_context_check" CHECK (NULLIF(btrim(supplier_context), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_delivery_snapshot_valid" CHECK (whatsapp_destination IS NULL AND message_snapshot IS NULL OR whatsapp_destination ~ '^[0-9]{8,15}$'::text AND NULLIF(btrim(message_snapshot), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_eve_request_status_at_handoff_check" CHECK (NULLIF(btrim(request_status_at_handoff), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_events_handoff_reference_check" CHECK (NULLIF(btrim(handoff_reference), ''::text) IS NOT NULL);
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_events_handoff_type_check" CHECK (handoff_type = 'whatsapp'::text);
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_family_check" CHECK (marketplace_family IS NULL OR (marketplace_family = ANY (ARRAY['drive'::text, 'stay'::text, 'fly'::text, 'concierge'::text, 'vip'::text])));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_fulfilment_method_check" CHECK (fulfilment_method = ANY (ARRAY['instant_booking'::text, 'request_to_confirm'::text, 'request_quote'::text, 'provider_checkout'::text, 'whatsapp_handoff'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_handoff_type_check" CHECK (handoff_type = ANY (ARRAY['none'::text, 'provider_checkout'::text, 'whatsapp'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_payment_status_check" CHECK (payment_status = ANY (ARRAY['awaiting_payment'::text, 'bank_transfer_instructed'::text, 'transfer_submitted'::text, 'verification_in_progress'::text, 'payment_verified'::text, 'payment_failed'::text, 'payment_rejected'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_request_reference_key" UNIQUE (request_reference);
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_request_type_check" CHECK (request_type = ANY (ARRAY['request_to_confirm'::text, 'request_quote'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_status_check" CHECK (status = ANY (ARRAY['request_submitted'::text, 'under_review'::text, 'awaiting_supplier'::text, 'awaiting_availability'::text, 'available_action_required'::text, 'awaiting_customer_acceptance'::text, 'awaiting_payment'::text, 'payment_verification'::text, 'confirmed'::text, 'declined'::text, 'changed'::text, 'cancellation_requested'::text, 'cancelled'::text, 'refund_pending'::text, 'refunded'::text, 'completed'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_transaction_method_check" CHECK (transaction_method = ANY (ARRAY['instant_booking'::text, 'request_to_confirm'::text, 'request_quote'::text, 'provider_checkout'::text, 'whatsapp_handoff'::text]));
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_traveller_count_check" CHECK (traveller_count >= 1 AND traveller_count <= 99);
ALTER TABLE "public"."media" ADD CONSTRAINT "media_kind_check" CHECK (kind = ANY (ARRAY['image'::text, 'video'::text, 'document'::text]));
ALTER TABLE "public"."media" ADD CONSTRAINT "media_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."media" ADD CONSTRAINT "media_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_kind_check" CHECK (kind = ANY (ARRAY['info'::text, 'booking'::text, 'promotion'::text, 'system'::text]));
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_status_check" CHECK (status = ANY (ARRAY['active'::text, 'read'::text, 'archived'::text]));
ALTER TABLE "public"."partner_assignments" ADD CONSTRAINT "partner_assignments_assignment_status_check" CHECK (assignment_status = ANY (ARRAY['assigned'::text, 'accepted'::text, 'declined'::text]));
ALTER TABLE "public"."partner_assignments" ADD CONSTRAINT "partner_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_coverage" ADD CONSTRAINT "partner_coverage_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."partner_coverage" ADD CONSTRAINT "partner_coverage_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_documents" ADD CONSTRAINT "partner_documents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_image_cleanup_queue" ADD CONSTRAINT "partner_image_cleanup_queue_bucket_storage_path_key" UNIQUE (bucket, storage_path);
ALTER TABLE "public"."partner_image_cleanup_queue" ADD CONSTRAINT "partner_image_cleanup_queue_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_notifications" ADD CONSTRAINT "partner_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_performance" ADD CONSTRAINT "partner_performance_pkey" PRIMARY KEY (partner_id);
ALTER TABLE "public"."partner_portal_asset_media" ADD CONSTRAINT "partner_portal_asset_media_owner_kind_check" CHECK (owner_kind = ANY (ARRAY['drive_partner'::text, 'stay_supplier'::text]));
ALTER TABLE "public"."partner_portal_asset_media" ADD CONSTRAINT "partner_portal_asset_media_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_portal_assets" ADD CONSTRAINT "partner_portal_assets_owner_kind_check" CHECK (owner_kind = ANY (ARRAY['drive_partner'::text, 'stay_supplier'::text]));
ALTER TABLE "public"."partner_portal_assets" ADD CONSTRAINT "partner_portal_assets_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_portal_contracts" ADD CONSTRAINT "partner_portal_contracts_owner_kind_check" CHECK (owner_kind = ANY (ARRAY['drive_partner'::text, 'stay_supplier'::text]));
ALTER TABLE "public"."partner_portal_contracts" ADD CONSTRAINT "partner_portal_contracts_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_portal_review_queue" ADD CONSTRAINT "partner_portal_review_queue_owner_kind_check" CHECK (owner_kind = ANY (ARRAY['drive_partner'::text, 'stay_supplier'::text]));
ALTER TABLE "public"."partner_portal_review_queue" ADD CONSTRAINT "partner_portal_review_queue_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_services" ADD CONSTRAINT "partner_services_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."partner_services" ADD CONSTRAINT "partner_services_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_services" ADD CONSTRAINT "partner_services_service_type_check" CHECK (service_type = ANY (ARRAY['DIR3 Stay'::text, 'DIR3 Drive'::text, 'DIR3 Airport'::text, 'DIR3 Concierge'::text, 'DIR3 Experiences'::text, 'DIR3 VIP'::text]));
ALTER TABLE "public"."partner_storage_cleanup_queue" ADD CONSTRAINT "partner_storage_cleanup_queue_bucket_storage_path_key" UNIQUE (bucket, storage_path);
ALTER TABLE "public"."partner_storage_cleanup_queue" ADD CONSTRAINT "partner_storage_cleanup_queue_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partner_users" ADD CONSTRAINT "partner_users_partner_user_unique" UNIQUE (partner_id, user_id);
ALTER TABLE "public"."partner_users" ADD CONSTRAINT "partner_users_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_slug_key" UNIQUE (slug);
ALTER TABLE "public"."partners" ADD CONSTRAINT "partners_status_check_dgr023" CHECK (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'active'::text, 'suspended'::text, 'rejected'::text, 'archived'::text]));
ALTER TABLE "public"."product_audit_events" ADD CONSTRAINT "product_audit_events_action_check" CHECK (action = ANY (ARRAY['create_draft'::text, 'update_draft'::text, 'publish'::text, 'unpublish'::text, 'archive'::text]));
ALTER TABLE "public"."product_audit_events" ADD CONSTRAINT "product_audit_events_actor_role_check" CHECK (actor_role = ANY (ARRAY['admin'::text, 'staff'::text]));
ALTER TABLE "public"."product_audit_events" ADD CONSTRAINT "product_audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_availability" ADD CONSTRAINT "product_availability_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."product_availability" ADD CONSTRAINT "product_availability_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_availability" ADD CONSTRAINT "product_availability_status_check" CHECK (availability_status IS NULL OR (availability_status = ANY (ARRAY['available'::text, 'partially_booked'::text, 'full'::text, 'maintenance'::text, 'blackout'::text])));
ALTER TABLE "public"."product_categories" ADD CONSTRAINT "product_categories_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."product_categories" ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_categories" ADD CONSTRAINT "product_categories_slug_key" UNIQUE (slug);
ALTER TABLE "public"."product_features" ADD CONSTRAINT "product_features_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."product_features" ADD CONSTRAINT "product_features_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_images" ADD CONSTRAINT "product_images_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."product_images" ADD CONSTRAINT "product_images_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_prices" ADD CONSTRAINT "product_prices_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."product_prices" ADD CONSTRAINT "product_prices_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_environment_check" CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'staging'::text])));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_fulfilment_state_check" CHECK (fulfilment_state = ANY (ARRAY['catalog_only'::text, 'verified_requestable'::text, 'verified_quote'::text, 'live_bookable'::text, 'unavailable'::text, 'availability_unknown'::text, 'test_sandbox'::text]));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_marketplace_environment_check" CHECK (marketplace_environment = ANY (ARRAY['production'::text, 'sandbox'::text, 'test'::text, 'synthetic'::text, 'fallback'::text]));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_marketplace_family_check" CHECK (marketplace_family IS NULL OR (marketplace_family = ANY (ARRAY['drive'::text, 'stay'::text, 'fly'::text, 'concierge'::text, 'vip'::text])));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_slug_key" UNIQUE (slug);
ALTER TABLE "public"."products" ADD CONSTRAINT "products_supply_type_check" CHECK (supply_type = ANY (ARRAY['verified_local_partner'::text, 'global_travel_partner'::text, 'dir3com_managed'::text, 'unknown'::text]));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_transaction_method_check" CHECK (transaction_method = ANY (ARRAY['none'::text, 'instant_booking'::text, 'request_to_confirm'::text, 'request_quote'::text]));
ALTER TABLE "public"."products" ADD CONSTRAINT "products_truth_consistency_check" CHECK (fulfilment_state = 'live_bookable'::text AND transaction_method = 'instant_booking'::text AND marketplace_environment = 'production'::text OR fulfilment_state = 'verified_requestable'::text AND transaction_method = 'request_to_confirm'::text AND marketplace_environment = 'production'::text OR fulfilment_state = 'verified_quote'::text AND transaction_method = 'request_quote'::text AND marketplace_environment = 'production'::text OR (fulfilment_state <> ALL (ARRAY['live_bookable'::text, 'verified_requestable'::text, 'verified_quote'::text])) AND transaction_method = 'none'::text);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_email_key" UNIQUE (email);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text, 'partner'::text, 'staff'::text]));
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text, 'banned'::text]));
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_code_key" UNIQUE (code);
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text]));
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_rating_check" CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_status_check" CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'hidden'::text]));
ALTER TABLE "public"."service_categories" ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."service_categories" ADD CONSTRAINT "service_categories_slug_key" UNIQUE (slug);
ALTER TABLE "public"."service_categories" ADD CONSTRAINT "service_categories_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text]));
ALTER TABLE "public"."services" ADD CONSTRAINT "services_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."services" ADD CONSTRAINT "services_slug_key" UNIQUE (slug);
ALTER TABLE "public"."services" ADD CONSTRAINT "services_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text, 'featured'::text]));
ALTER TABLE "public"."system_events" ADD CONSTRAINT "system_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."team_access_grants" ADD CONSTRAINT "team_access_grants_access_level_check" CHECK (access_level = ANY (ARRAY['scoped_staff'::text, 'global_admin'::text]));
ALTER TABLE "public"."team_access_grants" ADD CONSTRAINT "team_access_grants_email_key" UNIQUE (email);
ALTER TABLE "public"."team_access_grants" ADD CONSTRAINT "team_access_grants_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."team_access_grants" ADD CONSTRAINT "team_access_grants_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text]));
ALTER TABLE "public"."tiktok_connections" ADD CONSTRAINT "tiktok_connections_open_id_key" UNIQUE (open_id);
ALTER TABLE "public"."tiktok_connections" ADD CONSTRAINT "tiktok_connections_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tiktok_connections" ADD CONSTRAINT "tiktok_connections_user_id_key" UNIQUE (user_id);
ALTER TABLE "public"."verification_documents" ADD CONSTRAINT "verification_documents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."verification_documents" ADD CONSTRAINT "verification_documents_verification_status_check" CHECK (verification_status = ANY (ARRAY['Pending'::text, 'Under Review'::text, 'Approved'::text, 'Rejected'::text, 'Expired'::text, 'Suspended'::text]));
ALTER TABLE "public"."verification_requests" ADD CONSTRAINT "verification_requests_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."verification_requests" ADD CONSTRAINT "verification_requests_status_check" CHECK (status = ANY (ARRAY['Pending'::text, 'Under Review'::text, 'Approved'::text, 'Rejected'::text, 'Expired'::text, 'Suspended'::text]));
ALTER TABLE "public"."verification_reviews" ADD CONSTRAINT "verification_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."verification_status_history" ADD CONSTRAINT "verification_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."webhook_idempotency_events" ADD CONSTRAINT "webhook_idempotency_events_attempt_count_check" CHECK (attempt_count >= 1);
ALTER TABLE "public"."webhook_idempotency_events" ADD CONSTRAINT "webhook_idempotency_events_pkey" PRIMARY KEY (event_key);
ALTER TABLE "public"."webhook_idempotency_events" ADD CONSTRAINT "webhook_idempotency_events_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'send_started'::text, 'completed'::text, 'retryable_failed'::text, 'unknown_outcome'::text, 'permanent_failed'::text]));
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE SET NULL;
ALTER TABLE "public"."booking_items" ADD CONSTRAINT "booking_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."customer_activity" ADD CONSTRAINT "customer_activity_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE "public"."destinations" ADD CONSTRAINT "destinations_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE "public"."marketplace_request_audit_logs" ADD CONSTRAINT "marketplace_request_audit_logs_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketplace_requests(id) ON DELETE RESTRICT;
ALTER TABLE "public"."marketplace_request_evidence" ADD CONSTRAINT "marketplace_request_evidence_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketplace_requests(id) ON DELETE CASCADE;
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_e_initiated_by_partner_user_id_fkey" FOREIGN KEY (initiated_by_partner_user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE "public"."marketplace_request_handoff_events" ADD CONSTRAINT "marketplace_request_handoff_events_request_id_fkey" FOREIGN KEY (request_id) REFERENCES marketplace_requests(id) ON DELETE RESTRICT;
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE "public"."marketplace_requests" ADD CONSTRAINT "marketplace_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_assignments" ADD CONSTRAINT "partner_assignments_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT;
ALTER TABLE "public"."partner_assignments" ADD CONSTRAINT "partner_assignments_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE RESTRICT;
ALTER TABLE "public"."partner_coverage" ADD CONSTRAINT "partner_coverage_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_documents" ADD CONSTRAINT "partner_documents_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_image_cleanup_queue" ADD CONSTRAINT "partner_image_cleanup_queue_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_notifications" ADD CONSTRAINT "partner_notifications_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_performance" ADD CONSTRAINT "partner_performance_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_asset_media" ADD CONSTRAINT "partner_portal_asset_media_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES partner_portal_assets(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_asset_media" ADD CONSTRAINT "partner_portal_asset_media_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_assets" ADD CONSTRAINT "partner_portal_assets_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_contracts" ADD CONSTRAINT "partner_portal_contracts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_review_queue" ADD CONSTRAINT "partner_portal_review_queue_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES partner_portal_assets(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_portal_review_queue" ADD CONSTRAINT "partner_portal_review_queue_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_services" ADD CONSTRAINT "partner_services_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_storage_cleanup_queue" ADD CONSTRAINT "partner_storage_cleanup_queue_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_users" ADD CONSTRAINT "partner_users_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."partner_users" ADD CONSTRAINT "partner_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_audit_events" ADD CONSTRAINT "product_audit_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE "public"."product_availability" ADD CONSTRAINT "product_availability_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_availability" ADD CONSTRAINT "product_availability_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_features" ADD CONSTRAINT "product_features_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE "public"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT;
ALTER TABLE "public"."promotions" ADD CONSTRAINT "promotions_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE "public"."service_categories" ADD CONSTRAINT "service_categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES service_categories(id) ON DELETE SET NULL;
ALTER TABLE "public"."services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL;
ALTER TABLE "public"."tiktok_connections" ADD CONSTRAINT "tiktok_connections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."verification_documents" ADD CONSTRAINT "verification_documents_verification_request_id_fkey" FOREIGN KEY (verification_request_id) REFERENCES verification_requests(id) ON DELETE CASCADE;
ALTER TABLE "public"."verification_reviews" ADD CONSTRAINT "verification_reviews_verification_request_id_fkey" FOREIGN KEY (verification_request_id) REFERENCES verification_requests(id) ON DELETE CASCADE;
ALTER TABLE "public"."verification_status_history" ADD CONSTRAINT "verification_status_history_verification_request_id_fkey" FOREIGN KEY (verification_request_id) REFERENCES verification_requests(id) ON DELETE CASCADE;
CREATE INDEX idx_activity_timeline_created_at ON public.activity_timeline USING btree (created_at DESC);
CREATE INDEX idx_activity_timeline_entity ON public.activity_timeline USING btree (entity_type, entity_id);
CREATE INDEX idx_assignment_logs_booking_id ON public.assignment_logs USING btree (booking_id);
CREATE INDEX idx_assignment_rules_enabled ON public.assignment_rules USING btree (enabled);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC);
CREATE INDEX idx_booking_items_booking_id ON public.booking_items USING btree (booking_id);
CREATE UNIQUE INDEX bookings_user_request_key_unique ON public.bookings USING btree (user_id, request_key) WHERE ((user_id IS NOT NULL) AND (request_key IS NOT NULL));
CREATE INDEX idx_bookings_arrival_date ON public.bookings USING btree (arrival_date);
CREATE INDEX idx_bookings_departure_date ON public.bookings USING btree (departure_date);
CREATE INDEX idx_bookings_duplicate_chain ON public.bookings USING btree (duplicate_of_booking_id, rescheduled_from_booking_id);
CREATE INDEX idx_bookings_payment_status ON public.bookings USING btree (payment_status);
CREATE INDEX idx_bookings_product_dates ON public.bookings USING btree (product_id, arrival_date, departure_date);
CREATE INDEX idx_bookings_product_id ON public.bookings USING btree (product_id);
CREATE INDEX idx_bookings_profile_id ON public.bookings USING btree (profile_id);
CREATE INDEX idx_bookings_sandbox_flags ON public.bookings USING btree (synthetic, environment, reference_code);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);
CREATE INDEX idx_customer_activity_customer_created_at ON public.customer_activity USING btree (customer_id, created_at DESC);
CREATE INDEX idx_customers_created_at ON public.customers USING btree (created_at DESC);
CREATE INDEX dabra_provider_attempts_created_at_idx ON public.dabra_provider_attempts USING btree (created_at DESC);
CREATE INDEX dabra_provider_attempts_model_created_idx ON public.dabra_provider_attempts USING btree (model, created_at DESC) WHERE (model IS NOT NULL);
CREATE INDEX dabra_provider_attempts_provider_created_idx ON public.dabra_provider_attempts USING btree (provider, created_at DESC);
CREATE UNIQUE INDEX dabra_provider_attempts_request_hop_unique_idx ON public.dabra_provider_attempts USING btree (request_id, fallback_hop);
CREATE INDEX dabra_provider_attempts_success_created_idx ON public.dabra_provider_attempts USING btree (success, created_at DESC);
CREATE INDEX idx_destinations_service_id ON public.destinations USING btree (service_id);
CREATE INDEX idx_marketplace_request_audit_logs_created ON public.marketplace_request_audit_logs USING btree (created_at DESC);
CREATE INDEX idx_marketplace_request_audit_logs_request_created ON public.marketplace_request_audit_logs USING btree (request_id, created_at DESC);
CREATE INDEX idx_marketplace_request_evidence_request ON public.marketplace_request_evidence USING btree (request_id, evidence_type, status);
CREATE INDEX idx_marketplace_request_handoff_events_request_created ON public.marketplace_request_handoff_events USING btree (request_id, created_at DESC);
CREATE UNIQUE INDEX marketplace_request_handoff_whatsapp_unique ON public.marketplace_request_handoff_events USING btree (request_id, handoff_type) WHERE (handoff_type = 'whatsapp'::text);
CREATE INDEX idx_marketplace_requests_operations ON public.marketplace_requests USING btree (status, marketplace_family, created_at DESC);
CREATE INDEX idx_marketplace_requests_owner_created ON public.marketplace_requests USING btree (user_id, created_at DESC);
CREATE INDEX idx_media_owner ON public.media USING btree (owner_type, owner_id);
CREATE INDEX idx_notifications_profile_id ON public.notifications USING btree (profile_id);
CREATE INDEX idx_partner_assignments_assigned_at ON public.partner_assignments USING btree (assigned_at DESC);
CREATE INDEX idx_partner_assignments_booking_assigned_at ON public.partner_assignments USING btree (booking_id, assigned_at DESC);
CREATE INDEX idx_partner_assignments_partner_id ON public.partner_assignments USING btree (partner_id);
CREATE INDEX idx_partner_coverage_partner_id ON public.partner_coverage USING btree (partner_id);
CREATE INDEX idx_partner_documents_partner_id ON public.partner_documents USING btree (partner_id);
CREATE INDEX idx_partner_image_cleanup_owner ON public.partner_image_cleanup_queue USING btree (owner_id);
CREATE INDEX idx_partner_notifications_partner_id ON public.partner_notifications USING btree (partner_id);
CREATE INDEX idx_partner_notifications_status ON public.partner_notifications USING btree (status);
CREATE INDEX idx_partner_performance_partner_id ON public.partner_performance USING btree (partner_id);
CREATE INDEX idx_partner_portal_asset_media_owner_asset ON public.partner_portal_asset_media USING btree (owner_id, asset_id);
CREATE INDEX idx_partner_portal_assets_owner ON public.partner_portal_assets USING btree (owner_id);
CREATE INDEX idx_partner_portal_contracts_owner ON public.partner_portal_contracts USING btree (owner_id);
CREATE INDEX idx_partner_portal_review_owner ON public.partner_portal_review_queue USING btree (owner_id);
CREATE INDEX idx_partner_services_partner_id ON public.partner_services USING btree (partner_id);
CREATE INDEX idx_partner_users_partner_id ON public.partner_users USING btree (partner_id);
CREATE INDEX idx_partner_users_user_id ON public.partner_users USING btree (user_id);
CREATE UNIQUE INDEX idx_partners_email_lower_unique ON public.partners USING btree (lower(email));
CREATE UNIQUE INDEX idx_partners_slug_lower_unique ON public.partners USING btree (lower(slug));
CREATE INDEX idx_partners_status ON public.partners USING btree (status);
CREATE INDEX idx_product_audit_events_product_created ON public.product_audit_events USING btree (product_id, created_at DESC);
CREATE INDEX idx_product_availability_lookup ON public.product_availability USING btree (product_id, date, availability_status);
CREATE INDEX idx_product_availability_partner_id ON public.product_availability USING btree (partner_id);
CREATE INDEX idx_product_availability_product_id ON public.product_availability USING btree (product_id);
CREATE UNIQUE INDEX ux_product_availability_daily_sandbox ON public.product_availability USING btree (product_id, date, COALESCE(environment, ''::text), synthetic, COALESCE(reference_code, ''::text));
CREATE INDEX idx_product_features_product_id ON public.product_features USING btree (product_id);
CREATE INDEX idx_product_images_product_id ON public.product_images USING btree (product_id);
CREATE INDEX idx_product_images_product_primary ON public.product_images USING btree (product_id, is_primary DESC, sort_order);
CREATE INDEX idx_product_prices_date_window ON public.product_prices USING btree (product_id, valid_from, valid_to);
CREATE INDEX idx_product_prices_product_id ON public.product_prices USING btree (product_id);
CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);
CREATE INDEX idx_products_marketplace_truth ON public.products USING btree (marketplace_environment, fulfilment_state, marketplace_family) WHERE (synthetic = false);
CREATE INDEX idx_products_reference_code ON public.products USING btree (reference_code);
CREATE INDEX idx_products_sandbox_flags ON public.products USING btree (synthetic, environment);
CREATE INDEX idx_promotions_status ON public.promotions USING btree (status);
CREATE INDEX idx_reviews_service_id ON public.reviews USING btree (service_id);
CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);
CREATE INDEX idx_service_categories_parent_id ON public.service_categories USING btree (parent_id);
CREATE INDEX idx_services_category_id ON public.services USING btree (category_id);
CREATE INDEX idx_services_public_synthetic ON public.services USING btree (synthetic);
CREATE INDEX idx_services_status ON public.services USING btree (status);
CREATE INDEX idx_system_events_created_at ON public.system_events USING btree (created_at DESC);
CREATE INDEX idx_system_events_name ON public.system_events USING btree (event_name);
CREATE UNIQUE INDEX team_access_grants_user_idx ON public.team_access_grants USING btree (invited_user_id);
CREATE INDEX tiktok_connections_access_expiry_idx ON public.tiktok_connections USING btree (access_token_expires_at);
CREATE INDEX tiktok_connections_refresh_expiry_idx ON public.tiktok_connections USING btree (refresh_token_expires_at);
CREATE INDEX idx_verification_documents_owner ON public.verification_documents USING btree (owner_type, owner_id);
CREATE INDEX idx_verification_documents_request ON public.verification_documents USING btree (verification_request_id);
CREATE INDEX idx_verification_requests_owner ON public.verification_requests USING btree (owner_type, owner_id);
CREATE INDEX idx_verification_reviews_request ON public.verification_reviews USING btree (verification_request_id);
CREATE INDEX idx_verification_status_history_request ON public.verification_status_history USING btree (verification_request_id);
CREATE INDEX webhook_idempotency_events_expires_at_idx ON public.webhook_idempotency_events USING btree (expires_at);
CREATE INDEX webhook_idempotency_events_send_started_idx ON public.webhook_idempotency_events USING btree (status, send_started_at) WHERE (status = 'send_started'::text);
CREATE INDEX webhook_idempotency_events_status_retry_idx ON public.webhook_idempotency_events USING btree (status, retry_after, lease_expires_at);
CREATE TRIGGER trg_auth_users_provision_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION provision_profile_for_auth_user();
CREATE TRIGGER operations_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON activity_timeline FOR EACH STATEMENT EXECUTE FUNCTION reject_operations_record_mutation();
CREATE TRIGGER operations_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_operations_record_mutation();
CREATE TRIGGER set_booking_items_updated_at BEFORE UPDATE ON booking_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_destinations_updated_at BEFORE UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER marketplace_request_audit_reject_truncate BEFORE TRUNCATE ON marketplace_request_audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_marketplace_request_audit_mutation();
CREATE TRIGGER marketplace_request_audit_reject_update_delete BEFORE DELETE OR UPDATE ON marketplace_request_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_marketplace_request_audit_mutation();
CREATE TRIGGER marketplace_request_handoff_events_reject_truncate BEFORE TRUNCATE ON marketplace_request_handoff_events FOR EACH STATEMENT EXECUTE FUNCTION reject_marketplace_request_handoff_event_mutation();
CREATE TRIGGER marketplace_request_handoff_events_reject_update_delete BEFORE DELETE OR UPDATE ON marketplace_request_handoff_events FOR EACH ROW EXECUTE FUNCTION reject_marketplace_request_handoff_event_mutation();
CREATE TRIGGER set_media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER product_audit_events_reject_truncate BEFORE TRUNCATE ON product_audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_product_audit_event_mutation();
CREATE TRIGGER product_audit_events_reject_update_delete BEFORE DELETE OR UPDATE ON product_audit_events FOR EACH ROW EXECUTE FUNCTION reject_product_audit_event_mutation();
CREATE TRIGGER trg_phase0_force_alhana_product_state_on_link AFTER INSERT OR UPDATE OF partner_id, product_id ON product_availability FOR EACH ROW EXECUTE FUNCTION phase0_force_alhana_product_state_on_link();
CREATE TRIGGER trg_phase0_normalize_alhana_linked_product AFTER INSERT OR UPDATE OF partner_id, product_id ON product_availability FOR EACH ROW EXECUTE FUNCTION phase0_normalize_alhana_linked_product();
CREATE TRIGGER trg_phase0_block_product_image_insert BEFORE INSERT ON product_images FOR EACH ROW EXECUTE FUNCTION phase0_block_product_image_insert();
CREATE TRIGGER trg_phase0_enforce_alhana_product_state BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION phase0_enforce_alhana_product_state();
CREATE TRIGGER trg_phase0_force_new_product_draft_staging BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION phase0_force_new_product_draft_staging();
CREATE TRIGGER trg_phase0_lock_staging_synthetic_products BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION phase0_lock_staging_synthetic_products();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_promotions_updated_at BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_service_categories_updated_at BEFORE UPDATE ON service_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER operations_append_only BEFORE DELETE OR UPDATE OR TRUNCATE ON system_events FOR EACH STATEMENT EXECUTE FUNCTION reject_operations_record_mutation();
ALTER TABLE "public"."activity_timeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_timeline" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignment_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignment_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dabra_provider_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dabra_provider_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."destinations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_request_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_request_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_request_handoff_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_request_handoff_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."marketplace_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_coverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_image_cleanup_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_performance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_portal_asset_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_portal_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_portal_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_portal_review_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_storage_cleanup_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partner_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_audit_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_features" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tiktok_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."verification_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_idempotency_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operations_admin_insert" ON "public"."activity_timeline" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((performed_by = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL))))));
CREATE POLICY "operations_admin_read" ON "public"."activity_timeline" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL)))));
CREATE POLICY "assignment_logs_admin_full_access" ON "public"."assignment_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "assignment_logs_service_role_full_access" ON "public"."assignment_logs" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "assignment_rules_admin_full_access" ON "public"."assignment_rules" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "assignment_rules_service_role_full_access" ON "public"."assignment_rules" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "operations_admin_insert" ON "public"."audit_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((performed_by = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL))))));
CREATE POLICY "operations_admin_read" ON "public"."audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL)))));
CREATE POLICY "Service role full access" ON "public"."booking_items" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users manage own booking items" ON "public"."booking_items" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.profile_id)::text = (auth.uid())::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_items.booking_id) AND ((b.profile_id)::text = (auth.uid())::text)))));
CREATE POLICY "Users read own bookings" ON "public"."bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "bookings_admin_delete_v1" ON "public"."bookings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_admin_actor());
CREATE POLICY "bookings_admin_insert_v1" ON "public"."bookings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_admin_actor());
CREATE POLICY "bookings_admin_select_v1" ON "public"."bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_admin_actor());
CREATE POLICY "bookings_admin_update_v1" ON "public"."bookings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "bookings_owner_delete_user_id_v1" ON "public"."bookings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "bookings_owner_insert_user_id_v1" ON "public"."bookings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "bookings_owner_select_user_id_v1" ON "public"."bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));
CREATE POLICY "customer_activity_admin_all" ON "public"."customer_activity" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "customer_activity_service_role_all" ON "public"."customer_activity" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "dir74_customers_admin_insert" ON "public"."customers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "dir74_customers_admin_select" ON "public"."customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "dir74_customers_admin_update" ON "public"."customers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "Public read active destinations" ON "public"."destinations" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL)));
CREATE POLICY "Service role full access" ON "public"."destinations" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "marketplace_requests_owner_read" ON "public"."marketplace_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Public read active media" ON "public"."media" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL)));
CREATE POLICY "Service role full access" ON "public"."media" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role full access" ON "public"."notifications" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users manage own notifications" ON "public"."notifications" AS PERMISSIVE FOR ALL TO PUBLIC USING (((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text))) WITH CHECK (((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text)));
CREATE POLICY "dir74_assignments_admin_insert" ON "public"."partner_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "dir74_assignments_admin_select" ON "public"."partner_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "dir74_assignments_admin_update" ON "public"."partner_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "dir74_assignments_customer_select_own_booking" ON "public"."partner_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = partner_assignments.booking_id) AND (b.profile_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "dir74_assignments_partner_select_assigned" ON "public"."partner_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((partner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role full access partner_coverage" ON "public"."partner_coverage" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "partner_documents_admin_all" ON "public"."partner_documents" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "partner_documents_owner_insert" ON "public"."partner_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((partner_id = auth.uid()));
CREATE POLICY "partner_documents_owner_read" ON "public"."partner_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((partner_id = auth.uid()));
CREATE POLICY "partner_documents_service_role_all" ON "public"."partner_documents" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "partner_notifications_admin_all" ON "public"."partner_notifications" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "partner_notifications_member_read" ON "public"."partner_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = partner_notifications.partner_id) AND (pu.user_id = auth.uid())))));
CREATE POLICY "partner_notifications_service_role_all" ON "public"."partner_notifications" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access partner_performance" ON "public"."partner_performance" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "partner_portal_media_owner_delete" ON "public"."partner_portal_asset_media" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_media_owner_insert" ON "public"."partner_portal_asset_media" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_media_owner_select" ON "public"."partner_portal_asset_media" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_media_owner_update" ON "public"."partner_portal_asset_media" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_assets_owner_delete" ON "public"."partner_portal_assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_assets_owner_insert" ON "public"."partner_portal_assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_assets_owner_select" ON "public"."partner_portal_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_assets_owner_update" ON "public"."partner_portal_assets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_contracts_owner_delete" ON "public"."partner_portal_contracts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_contracts_owner_insert" ON "public"."partner_portal_contracts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_contracts_owner_select" ON "public"."partner_portal_contracts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_contracts_owner_update" ON "public"."partner_portal_contracts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_review_owner_insert" ON "public"."partner_portal_review_queue" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "partner_portal_review_owner_select" ON "public"."partner_portal_review_queue" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = owner_id));
CREATE POLICY "Service role full access partner_services" ON "public"."partner_services" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "partner_users_admin_all" ON "public"."partner_users" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "partner_users_self_read" ON "public"."partner_users" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
CREATE POLICY "partner_users_service_role_all" ON "public"."partner_users" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "dir81_admin_partners_select" ON "public"."partners" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(p.role) = 'admin'::text)))));
CREATE POLICY "product_audit_admin_read" ON "public"."product_audit_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_read_product_audit(country));
CREATE POLICY "pm_admin_manage_product_availability" ON "public"."product_availability" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_product_availability" ON "public"."product_availability" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pm_admin_manage_product_categories" ON "public"."product_categories" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_product_categories" ON "public"."product_categories" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pm_admin_manage_product_features" ON "public"."product_features" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_product_features" ON "public"."product_features" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pm_admin_manage_product_images" ON "public"."product_images" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_product_images" ON "public"."product_images" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "pm_admin_manage_product_prices" ON "public"."product_prices" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_product_prices" ON "public"."product_prices" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read bookable products" ON "public"."products" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((synthetic = false) AND (status = ANY (ARRAY['published'::text, 'active'::text, 'featured'::text]))));
CREATE POLICY "pm_admin_manage_products" ON "public"."products" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_actor()) WITH CHECK (is_admin_actor());
CREATE POLICY "pm_service_manage_products" ON "public"."products" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON "public"."profiles" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users manage own profiles" ON "public"."profiles" AS PERMISSIVE FOR ALL TO PUBLIC USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "Public read active promotions" ON "public"."promotions" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL) AND ((ends_at IS NULL) OR (ends_at > now()))));
CREATE POLICY "Service role full access" ON "public"."promotions" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Public read active reviews" ON "public"."reviews" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL)));
CREATE POLICY "Service role full access" ON "public"."reviews" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users manage own reviews" ON "public"."reviews" AS PERMISSIVE FOR ALL TO PUBLIC USING (((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text))) WITH CHECK (((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text)));
CREATE POLICY "Public read active categories" ON "public"."service_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL)));
CREATE POLICY "Service role full access" ON "public"."service_categories" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Public read active services" ON "public"."services" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) AND (deleted_at IS NULL)));
CREATE POLICY "Service role full access" ON "public"."services" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "operations_admin_insert" ON "public"."system_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL)))));
CREATE POLICY "operations_admin_read" ON "public"."system_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM p.role)) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (p.status = 'active'::text) AND (p.deleted_at IS NULL)))));
CREATE POLICY "team_access_ceo_all" ON "public"."team_access_grants" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_ceo_actor()) WITH CHECK (is_ceo_actor());
CREATE POLICY "team_access_self_read" ON "public"."team_access_grants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((invited_user_id = auth.uid()));
CREATE POLICY "team_access_service_role_all" ON "public"."team_access_grants" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
CREATE POLICY "verification_documents_admin_all" ON "public"."verification_documents" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL)))));
CREATE POLICY "verification_documents_customer_select_own" ON "public"."verification_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_type = 'customer'::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "verification_requests_admin_all" ON "public"."verification_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL)))));
CREATE POLICY "verification_requests_customer_select_own" ON "public"."verification_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_type = 'customer'::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "verification_reviews_admin_all" ON "public"."verification_reviews" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL)))));
CREATE POLICY "verification_status_history_admin_all" ON "public"."verification_status_history" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (lower(profile.role) = 'admin'::text) AND (profile.status = 'active'::text) AND (profile.deleted_at IS NULL)))));
REVOKE ALL ON TABLE "public"."activity_timeline" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."assignment_logs" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."assignment_rules" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."audit_logs" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."booking_items" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."bookings" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."customer_activity" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."customers" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."dabra_provider_attempts" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."destinations" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."marketplace_request_audit_logs" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."marketplace_request_evidence" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."marketplace_request_handoff_events" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."marketplace_requests" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."media" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."notifications" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_assignments" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_coverage" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_documents" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_image_cleanup_queue" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_notifications" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_performance" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_portal_asset_media" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_portal_assets" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_portal_contracts" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_portal_review_queue" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_services" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_storage_cleanup_queue" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partner_users" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."partners" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_audit_events" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_availability" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_categories" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_features" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_images" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."product_prices" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."products" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."profiles" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."promotions" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."reviews" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."service_categories" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."services" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."system_events" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."team_access_grants" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."tiktok_connections" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."verification_documents" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."verification_requests" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."verification_reviews" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."verification_status_history" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON TABLE "public"."webhook_idempotency_events" FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."acquire_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_ttl_seconds integer, p_lease_seconds integer, p_max_attempts integer) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."archive_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."assert_marketplace_request_confirmation_integrity"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."begin_whatsapp_event_send"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_destination_profile text, p_inbound_message_id text, p_ttl_seconds integer) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."can_read_product_audit"(p_country text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."complete_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_outbound_message_id text, p_ttl_seconds integer) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."create_product_draft_lifecycle"(p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."fail_whatsapp_event_lease"(p_event_key text, p_lease_owner text, p_attempt_number integer, p_failure_state text, p_error_code text, p_ttl_seconds integer, p_retry_after_seconds integer) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."get_dabra_provider_metrics"(p_since timestamp with time zone) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."get_partner_marketplace_requests"(p_actor_user_id uuid, p_request_id uuid) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."is_admin_actor"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."is_ceo_actor"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."normalize_admin_country_key"(value text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."normalize_team_email"(value text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."persist_partner_portal_state"(p_assets jsonb, p_media jsonb, p_reviews jsonb, p_contracts jsonb) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_block_product_image_insert"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_enforce_alhana_product_state"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_force_alhana_product_state_on_link"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_force_new_product_draft_staging"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_lock_staging_synthetic_products"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."phase0_normalize_alhana_linked_product"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."product_lifecycle_actor_role"(p_country text, p_permission text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."product_lifecycle_session_role"(p_permission text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."provision_profile_for_auth_user"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."publish_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."reject_marketplace_request_audit_mutation"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."reject_marketplace_request_handoff_event_mutation"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."reject_operations_record_mutation"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."reject_product_audit_event_mutation"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."reserve_whatsapp_event"(p_event_key text, p_ttl_seconds integer) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."resolve_marketplace_request_confirmation_evidence"(p_request_id uuid, p_confirmation_evidence jsonb) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."save_team_access_grant"(p_user_id uuid, p_email text, p_job_title text, p_access_level text, p_country_scope text[], p_permissions text[]) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."set_team_access_status"(p_email text, p_status text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."start_partner_marketplace_request_handoff"(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."transition_marketplace_request"(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."unpublish_product_lifecycle"(p_product_id uuid, p_expected_version integer, p_reason text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
REVOKE ALL ON FUNCTION "public"."update_product_draft_lifecycle"(p_product_id uuid, p_expected_version integer, p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
GRANT EXECUTE ON FUNCTION "public".acquire_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_ttl_seconds integer, p_lease_seconds integer, p_max_attempts integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".acquire_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_ttl_seconds integer, p_lease_seconds integer, p_max_attempts integer) TO "service_role";
GRANT INSERT ON TABLE "public"."activity_timeline" TO "authenticated";
GRANT SELECT ON TABLE "public"."activity_timeline" TO "authenticated";
GRANT DELETE ON TABLE "public"."activity_timeline" TO "postgres";
GRANT INSERT ON TABLE "public"."activity_timeline" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."activity_timeline" TO "postgres";
GRANT REFERENCES ON TABLE "public"."activity_timeline" TO "postgres";
GRANT SELECT ON TABLE "public"."activity_timeline" TO "postgres";
GRANT TRIGGER ON TABLE "public"."activity_timeline" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."activity_timeline" TO "postgres";
GRANT UPDATE ON TABLE "public"."activity_timeline" TO "postgres";
GRANT SELECT ON TABLE "public"."activity_timeline" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".archive_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".archive_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".assert_marketplace_request_confirmation_integrity() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".assert_marketplace_request_confirmation_integrity() TO "service_role";
GRANT DELETE ON TABLE "public"."assignment_logs" TO "authenticated";
GRANT INSERT ON TABLE "public"."assignment_logs" TO "authenticated";
GRANT SELECT ON TABLE "public"."assignment_logs" TO "authenticated";
GRANT UPDATE ON TABLE "public"."assignment_logs" TO "authenticated";
GRANT DELETE ON TABLE "public"."assignment_logs" TO "postgres";
GRANT INSERT ON TABLE "public"."assignment_logs" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."assignment_logs" TO "postgres";
GRANT REFERENCES ON TABLE "public"."assignment_logs" TO "postgres";
GRANT SELECT ON TABLE "public"."assignment_logs" TO "postgres";
GRANT TRIGGER ON TABLE "public"."assignment_logs" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."assignment_logs" TO "postgres";
GRANT UPDATE ON TABLE "public"."assignment_logs" TO "postgres";
GRANT DELETE ON TABLE "public"."assignment_logs" TO "service_role";
GRANT INSERT ON TABLE "public"."assignment_logs" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."assignment_logs" TO "service_role";
GRANT REFERENCES ON TABLE "public"."assignment_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."assignment_logs" TO "service_role";
GRANT TRIGGER ON TABLE "public"."assignment_logs" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."assignment_logs" TO "service_role";
GRANT UPDATE ON TABLE "public"."assignment_logs" TO "service_role";
GRANT DELETE ON TABLE "public"."assignment_rules" TO "authenticated";
GRANT INSERT ON TABLE "public"."assignment_rules" TO "authenticated";
GRANT SELECT ON TABLE "public"."assignment_rules" TO "authenticated";
GRANT UPDATE ON TABLE "public"."assignment_rules" TO "authenticated";
GRANT DELETE ON TABLE "public"."assignment_rules" TO "postgres";
GRANT INSERT ON TABLE "public"."assignment_rules" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."assignment_rules" TO "postgres";
GRANT REFERENCES ON TABLE "public"."assignment_rules" TO "postgres";
GRANT SELECT ON TABLE "public"."assignment_rules" TO "postgres";
GRANT TRIGGER ON TABLE "public"."assignment_rules" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."assignment_rules" TO "postgres";
GRANT UPDATE ON TABLE "public"."assignment_rules" TO "postgres";
GRANT DELETE ON TABLE "public"."assignment_rules" TO "service_role";
GRANT INSERT ON TABLE "public"."assignment_rules" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."assignment_rules" TO "service_role";
GRANT REFERENCES ON TABLE "public"."assignment_rules" TO "service_role";
GRANT SELECT ON TABLE "public"."assignment_rules" TO "service_role";
GRANT TRIGGER ON TABLE "public"."assignment_rules" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."assignment_rules" TO "service_role";
GRANT UPDATE ON TABLE "public"."assignment_rules" TO "service_role";
GRANT INSERT ON TABLE "public"."audit_logs" TO "authenticated";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";
GRANT DELETE ON TABLE "public"."audit_logs" TO "postgres";
GRANT INSERT ON TABLE "public"."audit_logs" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."audit_logs" TO "postgres";
GRANT REFERENCES ON TABLE "public"."audit_logs" TO "postgres";
GRANT SELECT ON TABLE "public"."audit_logs" TO "postgres";
GRANT TRIGGER ON TABLE "public"."audit_logs" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."audit_logs" TO "postgres";
GRANT UPDATE ON TABLE "public"."audit_logs" TO "postgres";
GRANT SELECT ON TABLE "public"."audit_logs" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".begin_whatsapp_event_send(p_event_key text, p_lease_owner text, p_attempt_number integer, p_destination_profile text, p_inbound_message_id text, p_ttl_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".begin_whatsapp_event_send(p_event_key text, p_lease_owner text, p_attempt_number integer, p_destination_profile text, p_inbound_message_id text, p_ttl_seconds integer) TO "service_role";
GRANT MAINTAIN ON TABLE "public"."booking_items" TO "anon";
GRANT REFERENCES ON TABLE "public"."booking_items" TO "anon";
GRANT TRIGGER ON TABLE "public"."booking_items" TO "anon";
GRANT TRUNCATE ON TABLE "public"."booking_items" TO "anon";
GRANT MAINTAIN ON TABLE "public"."booking_items" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."booking_items" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."booking_items" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."booking_items" TO "authenticated";
GRANT DELETE ON TABLE "public"."booking_items" TO "postgres";
GRANT INSERT ON TABLE "public"."booking_items" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."booking_items" TO "postgres";
GRANT REFERENCES ON TABLE "public"."booking_items" TO "postgres";
GRANT SELECT ON TABLE "public"."booking_items" TO "postgres";
GRANT TRIGGER ON TABLE "public"."booking_items" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."booking_items" TO "postgres";
GRANT UPDATE ON TABLE "public"."booking_items" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."booking_items" TO "service_role";
GRANT REFERENCES ON TABLE "public"."booking_items" TO "service_role";
GRANT TRIGGER ON TABLE "public"."booking_items" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."booking_items" TO "service_role";
GRANT SELECT ON TABLE "public"."bookings" TO "authenticated";
GRANT DELETE ON TABLE "public"."bookings" TO "postgres";
GRANT INSERT ON TABLE "public"."bookings" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."bookings" TO "postgres";
GRANT REFERENCES ON TABLE "public"."bookings" TO "postgres";
GRANT SELECT ON TABLE "public"."bookings" TO "postgres";
GRANT TRIGGER ON TABLE "public"."bookings" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."bookings" TO "postgres";
GRANT UPDATE ON TABLE "public"."bookings" TO "postgres";
GRANT DELETE ON TABLE "public"."bookings" TO "service_role";
GRANT INSERT ON TABLE "public"."bookings" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."bookings" TO "service_role";
GRANT REFERENCES ON TABLE "public"."bookings" TO "service_role";
GRANT SELECT ON TABLE "public"."bookings" TO "service_role";
GRANT TRIGGER ON TABLE "public"."bookings" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."bookings" TO "service_role";
GRANT UPDATE ON TABLE "public"."bookings" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".can_read_product_audit(p_country text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".can_read_product_audit(p_country text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".complete_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_outbound_message_id text, p_ttl_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".complete_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_outbound_message_id text, p_ttl_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".create_product_draft_lifecycle(p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".create_product_draft_lifecycle(p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) TO "postgres";
GRANT DELETE ON TABLE "public"."customer_activity" TO "authenticated";
GRANT INSERT ON TABLE "public"."customer_activity" TO "authenticated";
GRANT SELECT ON TABLE "public"."customer_activity" TO "authenticated";
GRANT UPDATE ON TABLE "public"."customer_activity" TO "authenticated";
GRANT DELETE ON TABLE "public"."customer_activity" TO "postgres";
GRANT INSERT ON TABLE "public"."customer_activity" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."customer_activity" TO "postgres";
GRANT REFERENCES ON TABLE "public"."customer_activity" TO "postgres";
GRANT SELECT ON TABLE "public"."customer_activity" TO "postgres";
GRANT TRIGGER ON TABLE "public"."customer_activity" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."customer_activity" TO "postgres";
GRANT UPDATE ON TABLE "public"."customer_activity" TO "postgres";
GRANT DELETE ON TABLE "public"."customer_activity" TO "service_role";
GRANT INSERT ON TABLE "public"."customer_activity" TO "service_role";
GRANT SELECT ON TABLE "public"."customer_activity" TO "service_role";
GRANT UPDATE ON TABLE "public"."customer_activity" TO "service_role";
GRANT INSERT ON TABLE "public"."customers" TO "authenticated";
GRANT SELECT ON TABLE "public"."customers" TO "authenticated";
GRANT UPDATE ON TABLE "public"."customers" TO "authenticated";
GRANT DELETE ON TABLE "public"."customers" TO "postgres";
GRANT INSERT ON TABLE "public"."customers" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."customers" TO "postgres";
GRANT REFERENCES ON TABLE "public"."customers" TO "postgres";
GRANT SELECT ON TABLE "public"."customers" TO "postgres";
GRANT TRIGGER ON TABLE "public"."customers" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."customers" TO "postgres";
GRANT UPDATE ON TABLE "public"."customers" TO "postgres";
GRANT INSERT ON TABLE "public"."customers" TO "service_role";
GRANT SELECT ON TABLE "public"."customers" TO "service_role";
GRANT UPDATE ON TABLE "public"."customers" TO "service_role";
GRANT DELETE ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT INSERT ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT REFERENCES ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT SELECT ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT TRIGGER ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT UPDATE ON TABLE "public"."dabra_provider_attempts" TO "postgres";
GRANT INSERT ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT REFERENCES ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT SELECT ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT TRIGGER ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."dabra_provider_attempts" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."destinations" TO "anon";
GRANT REFERENCES ON TABLE "public"."destinations" TO "anon";
GRANT TRIGGER ON TABLE "public"."destinations" TO "anon";
GRANT TRUNCATE ON TABLE "public"."destinations" TO "anon";
GRANT MAINTAIN ON TABLE "public"."destinations" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."destinations" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."destinations" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."destinations" TO "authenticated";
GRANT DELETE ON TABLE "public"."destinations" TO "postgres";
GRANT INSERT ON TABLE "public"."destinations" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."destinations" TO "postgres";
GRANT REFERENCES ON TABLE "public"."destinations" TO "postgres";
GRANT SELECT ON TABLE "public"."destinations" TO "postgres";
GRANT TRIGGER ON TABLE "public"."destinations" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."destinations" TO "postgres";
GRANT UPDATE ON TABLE "public"."destinations" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."destinations" TO "service_role";
GRANT REFERENCES ON TABLE "public"."destinations" TO "service_role";
GRANT TRIGGER ON TABLE "public"."destinations" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."destinations" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".fail_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_failure_state text, p_error_code text, p_ttl_seconds integer, p_retry_after_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".fail_whatsapp_event_lease(p_event_key text, p_lease_owner text, p_attempt_number integer, p_failure_state text, p_error_code text, p_ttl_seconds integer, p_retry_after_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".get_dabra_provider_metrics(p_since timestamp with time zone) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".get_dabra_provider_metrics(p_since timestamp with time zone) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".get_partner_marketplace_requests(p_actor_user_id uuid, p_request_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".get_partner_marketplace_requests(p_actor_user_id uuid, p_request_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".is_admin_actor() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".is_admin_actor() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".is_admin_actor() TO "service_role";
GRANT EXECUTE ON FUNCTION "public".is_ceo_actor() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".is_ceo_actor() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".is_ceo_actor() TO "service_role";
GRANT DELETE ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT INSERT ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT REFERENCES ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT TRIGGER ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT UPDATE ON TABLE "public"."marketplace_request_audit_logs" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_request_audit_logs" TO "service_role";
GRANT DELETE ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT INSERT ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT REFERENCES ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT TRIGGER ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT UPDATE ON TABLE "public"."marketplace_request_evidence" TO "postgres";
GRANT DELETE ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT INSERT ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT REFERENCES ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT TRIGGER ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT UPDATE ON TABLE "public"."marketplace_request_evidence" TO "service_role";
GRANT DELETE ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT INSERT ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT REFERENCES ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT TRIGGER ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT UPDATE ON TABLE "public"."marketplace_request_handoff_events" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_requests" TO "authenticated";
GRANT DELETE ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT INSERT ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT REFERENCES ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT SELECT ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT TRIGGER ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT UPDATE ON TABLE "public"."marketplace_requests" TO "postgres";
GRANT DELETE ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT INSERT ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT REFERENCES ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT TRIGGER ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT UPDATE ON TABLE "public"."marketplace_requests" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."media" TO "anon";
GRANT REFERENCES ON TABLE "public"."media" TO "anon";
GRANT TRIGGER ON TABLE "public"."media" TO "anon";
GRANT TRUNCATE ON TABLE "public"."media" TO "anon";
GRANT MAINTAIN ON TABLE "public"."media" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."media" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."media" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."media" TO "authenticated";
GRANT DELETE ON TABLE "public"."media" TO "postgres";
GRANT INSERT ON TABLE "public"."media" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."media" TO "postgres";
GRANT REFERENCES ON TABLE "public"."media" TO "postgres";
GRANT SELECT ON TABLE "public"."media" TO "postgres";
GRANT TRIGGER ON TABLE "public"."media" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."media" TO "postgres";
GRANT UPDATE ON TABLE "public"."media" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."media" TO "service_role";
GRANT REFERENCES ON TABLE "public"."media" TO "service_role";
GRANT TRIGGER ON TABLE "public"."media" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."media" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".normalize_admin_country_key(value text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".normalize_team_email(value text) TO "postgres";
GRANT DELETE ON TABLE "public"."notifications" TO "postgres";
GRANT INSERT ON TABLE "public"."notifications" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."notifications" TO "postgres";
GRANT REFERENCES ON TABLE "public"."notifications" TO "postgres";
GRANT SELECT ON TABLE "public"."notifications" TO "postgres";
GRANT TRIGGER ON TABLE "public"."notifications" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."notifications" TO "postgres";
GRANT UPDATE ON TABLE "public"."notifications" TO "postgres";
GRANT INSERT ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_assignments" TO "authenticated";
GRANT SELECT ON TABLE "public"."partner_assignments" TO "authenticated";
GRANT UPDATE ON TABLE "public"."partner_assignments" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_assignments" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_assignments" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_assignments" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_assignments" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_assignments" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_assignments" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_assignments" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_assignments" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_assignments" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_assignments" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_coverage" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_coverage" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_coverage" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_coverage" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_coverage" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_coverage" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_coverage" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_coverage" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_coverage" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_coverage" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_coverage" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_coverage" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_coverage" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_coverage" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_coverage" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_coverage" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_documents" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_documents" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_documents" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_documents" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_documents" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_documents" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_documents" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_documents" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_documents" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_documents" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_documents" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_documents" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_documents" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_documents" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_documents" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_documents" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_documents" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_image_cleanup_queue" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_image_cleanup_queue" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_notifications" TO "anon";
GRANT REFERENCES ON TABLE "public"."partner_notifications" TO "anon";
GRANT TRIGGER ON TABLE "public"."partner_notifications" TO "anon";
GRANT TRUNCATE ON TABLE "public"."partner_notifications" TO "anon";
GRANT MAINTAIN ON TABLE "public"."partner_notifications" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."partner_notifications" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."partner_notifications" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."partner_notifications" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_notifications" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_notifications" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_notifications" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_notifications" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_notifications" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_notifications" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_notifications" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_notifications" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_notifications" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_notifications" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_notifications" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_notifications" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_performance" TO "anon";
GRANT REFERENCES ON TABLE "public"."partner_performance" TO "anon";
GRANT TRIGGER ON TABLE "public"."partner_performance" TO "anon";
GRANT TRUNCATE ON TABLE "public"."partner_performance" TO "anon";
GRANT MAINTAIN ON TABLE "public"."partner_performance" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."partner_performance" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."partner_performance" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."partner_performance" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_performance" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_performance" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_performance" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_performance" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_performance" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_performance" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_performance" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_performance" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_performance" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_performance" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_performance" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_performance" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_portal_asset_media" TO "authenticated";
GRANT INSERT ON TABLE "public"."partner_portal_asset_media" TO "authenticated";
GRANT SELECT ON TABLE "public"."partner_portal_asset_media" TO "authenticated";
GRANT UPDATE ON TABLE "public"."partner_portal_asset_media" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_portal_asset_media" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_portal_asset_media" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_portal_assets" TO "authenticated";
GRANT INSERT ON TABLE "public"."partner_portal_assets" TO "authenticated";
GRANT SELECT ON TABLE "public"."partner_portal_assets" TO "authenticated";
GRANT UPDATE ON TABLE "public"."partner_portal_assets" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_portal_assets" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_portal_assets" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_portal_contracts" TO "authenticated";
GRANT INSERT ON TABLE "public"."partner_portal_contracts" TO "authenticated";
GRANT SELECT ON TABLE "public"."partner_portal_contracts" TO "authenticated";
GRANT UPDATE ON TABLE "public"."partner_portal_contracts" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_portal_contracts" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_portal_contracts" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_portal_review_queue" TO "authenticated";
GRANT SELECT ON TABLE "public"."partner_portal_review_queue" TO "authenticated";
GRANT DELETE ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_portal_review_queue" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_portal_review_queue" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_services" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_services" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_services" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_services" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_services" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_services" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_services" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_services" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_services" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_services" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_services" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_services" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_services" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_services" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_services" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_services" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_storage_cleanup_queue" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_storage_cleanup_queue" TO "service_role";
GRANT DELETE ON TABLE "public"."partner_users" TO "postgres";
GRANT INSERT ON TABLE "public"."partner_users" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partner_users" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partner_users" TO "postgres";
GRANT SELECT ON TABLE "public"."partner_users" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partner_users" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partner_users" TO "postgres";
GRANT UPDATE ON TABLE "public"."partner_users" TO "postgres";
GRANT DELETE ON TABLE "public"."partner_users" TO "service_role";
GRANT INSERT ON TABLE "public"."partner_users" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partner_users" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partner_users" TO "service_role";
GRANT SELECT ON TABLE "public"."partner_users" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partner_users" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partner_users" TO "service_role";
GRANT UPDATE ON TABLE "public"."partner_users" TO "service_role";
GRANT DELETE ON TABLE "public"."partners" TO "postgres";
GRANT INSERT ON TABLE "public"."partners" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."partners" TO "postgres";
GRANT REFERENCES ON TABLE "public"."partners" TO "postgres";
GRANT SELECT ON TABLE "public"."partners" TO "postgres";
GRANT TRIGGER ON TABLE "public"."partners" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."partners" TO "postgres";
GRANT UPDATE ON TABLE "public"."partners" TO "postgres";
GRANT DELETE ON TABLE "public"."partners" TO "service_role";
GRANT INSERT ON TABLE "public"."partners" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."partners" TO "service_role";
GRANT REFERENCES ON TABLE "public"."partners" TO "service_role";
GRANT SELECT ON TABLE "public"."partners" TO "service_role";
GRANT TRIGGER ON TABLE "public"."partners" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."partners" TO "service_role";
GRANT UPDATE ON TABLE "public"."partners" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".persist_partner_portal_state(p_assets jsonb, p_media jsonb, p_reviews jsonb, p_contracts jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".persist_partner_portal_state(p_assets jsonb, p_media jsonb, p_reviews jsonb, p_contracts jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".phase0_block_product_image_insert() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".phase0_enforce_alhana_product_state() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".phase0_force_alhana_product_state_on_link() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".phase0_force_new_product_draft_staging() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".phase0_lock_staging_synthetic_products() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public".phase0_lock_staging_synthetic_products() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".phase0_normalize_alhana_linked_product() TO "postgres";
GRANT SELECT ON TABLE "public"."product_audit_events" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_audit_events" TO "postgres";
GRANT INSERT ON TABLE "public"."product_audit_events" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_audit_events" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_audit_events" TO "postgres";
GRANT SELECT ON TABLE "public"."product_audit_events" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_audit_events" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_audit_events" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_audit_events" TO "postgres";
GRANT DELETE ON TABLE "public"."product_availability" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_availability" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_availability" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_availability" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_availability" TO "postgres";
GRANT INSERT ON TABLE "public"."product_availability" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_availability" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_availability" TO "postgres";
GRANT SELECT ON TABLE "public"."product_availability" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_availability" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_availability" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_availability" TO "postgres";
GRANT DELETE ON TABLE "public"."product_availability" TO "service_role";
GRANT INSERT ON TABLE "public"."product_availability" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."product_availability" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_availability" TO "service_role";
GRANT SELECT ON TABLE "public"."product_availability" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_availability" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_availability" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_availability" TO "service_role";
GRANT DELETE ON TABLE "public"."product_categories" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_categories" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_categories" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_categories" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_categories" TO "postgres";
GRANT INSERT ON TABLE "public"."product_categories" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_categories" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_categories" TO "postgres";
GRANT SELECT ON TABLE "public"."product_categories" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_categories" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_categories" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_categories" TO "postgres";
GRANT DELETE ON TABLE "public"."product_categories" TO "service_role";
GRANT INSERT ON TABLE "public"."product_categories" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."product_categories" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_categories" TO "service_role";
GRANT SELECT ON TABLE "public"."product_categories" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_categories" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_categories" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_categories" TO "service_role";
GRANT DELETE ON TABLE "public"."product_features" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_features" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_features" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_features" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_features" TO "postgres";
GRANT INSERT ON TABLE "public"."product_features" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_features" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_features" TO "postgres";
GRANT SELECT ON TABLE "public"."product_features" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_features" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_features" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_features" TO "postgres";
GRANT DELETE ON TABLE "public"."product_features" TO "service_role";
GRANT INSERT ON TABLE "public"."product_features" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."product_features" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_features" TO "service_role";
GRANT SELECT ON TABLE "public"."product_features" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_features" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_features" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_features" TO "service_role";
GRANT DELETE ON TABLE "public"."product_images" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_images" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_images" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_images" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_images" TO "postgres";
GRANT INSERT ON TABLE "public"."product_images" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_images" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_images" TO "postgres";
GRANT SELECT ON TABLE "public"."product_images" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_images" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_images" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_images" TO "postgres";
GRANT DELETE ON TABLE "public"."product_images" TO "service_role";
GRANT INSERT ON TABLE "public"."product_images" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."product_images" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_images" TO "service_role";
GRANT SELECT ON TABLE "public"."product_images" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_images" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_images" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_images" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".product_lifecycle_actor_role(p_country text, p_permission text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".product_lifecycle_actor_role(p_country text, p_permission text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".product_lifecycle_session_role(p_permission text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".product_lifecycle_session_role(p_permission text) TO "postgres";
GRANT DELETE ON TABLE "public"."product_prices" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_prices" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_prices" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_prices" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_prices" TO "postgres";
GRANT INSERT ON TABLE "public"."product_prices" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."product_prices" TO "postgres";
GRANT REFERENCES ON TABLE "public"."product_prices" TO "postgres";
GRANT SELECT ON TABLE "public"."product_prices" TO "postgres";
GRANT TRIGGER ON TABLE "public"."product_prices" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."product_prices" TO "postgres";
GRANT UPDATE ON TABLE "public"."product_prices" TO "postgres";
GRANT DELETE ON TABLE "public"."product_prices" TO "service_role";
GRANT INSERT ON TABLE "public"."product_prices" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."product_prices" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_prices" TO "service_role";
GRANT SELECT ON TABLE "public"."product_prices" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_prices" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_prices" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_prices" TO "service_role";
GRANT DELETE ON TABLE "public"."products" TO "authenticated";
GRANT INSERT ON TABLE "public"."products" TO "authenticated";
GRANT SELECT ON TABLE "public"."products" TO "authenticated";
GRANT UPDATE ON TABLE "public"."products" TO "authenticated";
GRANT DELETE ON TABLE "public"."products" TO "postgres";
GRANT INSERT ON TABLE "public"."products" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."products" TO "postgres";
GRANT REFERENCES ON TABLE "public"."products" TO "postgres";
GRANT SELECT ON TABLE "public"."products" TO "postgres";
GRANT TRIGGER ON TABLE "public"."products" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."products" TO "postgres";
GRANT UPDATE ON TABLE "public"."products" TO "postgres";
GRANT DELETE ON TABLE "public"."products" TO "service_role";
GRANT INSERT ON TABLE "public"."products" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."products" TO "service_role";
GRANT REFERENCES ON TABLE "public"."products" TO "service_role";
GRANT SELECT ON TABLE "public"."products" TO "service_role";
GRANT TRIGGER ON TABLE "public"."products" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."products" TO "service_role";
GRANT UPDATE ON TABLE "public"."products" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES ON TABLE "public"."profiles" TO "anon";
GRANT TRIGGER ON TABLE "public"."profiles" TO "anon";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "anon";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."profiles" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "authenticated";
GRANT DELETE ON TABLE "public"."profiles" TO "postgres";
GRANT INSERT ON TABLE "public"."profiles" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "postgres";
GRANT REFERENCES ON TABLE "public"."profiles" TO "postgres";
GRANT SELECT ON TABLE "public"."profiles" TO "postgres";
GRANT TRIGGER ON TABLE "public"."profiles" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "postgres";
GRANT UPDATE ON TABLE "public"."profiles" TO "postgres";
GRANT DELETE ON TABLE "public"."profiles" TO "service_role";
GRANT INSERT ON TABLE "public"."profiles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "service_role";
GRANT UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."promotions" TO "anon";
GRANT REFERENCES ON TABLE "public"."promotions" TO "anon";
GRANT TRIGGER ON TABLE "public"."promotions" TO "anon";
GRANT TRUNCATE ON TABLE "public"."promotions" TO "anon";
GRANT MAINTAIN ON TABLE "public"."promotions" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."promotions" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."promotions" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."promotions" TO "authenticated";
GRANT DELETE ON TABLE "public"."promotions" TO "postgres";
GRANT INSERT ON TABLE "public"."promotions" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."promotions" TO "postgres";
GRANT REFERENCES ON TABLE "public"."promotions" TO "postgres";
GRANT SELECT ON TABLE "public"."promotions" TO "postgres";
GRANT TRIGGER ON TABLE "public"."promotions" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."promotions" TO "postgres";
GRANT UPDATE ON TABLE "public"."promotions" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."promotions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."promotions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."promotions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."promotions" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".provision_profile_for_auth_user() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".provision_profile_for_auth_user() TO "service_role";
GRANT EXECUTE ON FUNCTION "public".publish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".publish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reject_marketplace_request_audit_mutation() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reject_marketplace_request_handoff_event_mutation() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reject_operations_record_mutation() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reject_product_audit_event_mutation() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reserve_whatsapp_event(p_event_key text, p_ttl_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".reserve_whatsapp_event(p_event_key text, p_ttl_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".resolve_marketplace_request_confirmation_evidence(p_request_id uuid, p_confirmation_evidence jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".resolve_marketplace_request_confirmation_evidence(p_request_id uuid, p_confirmation_evidence jsonb) TO "service_role";
GRANT MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT REFERENCES ON TABLE "public"."reviews" TO "anon";
GRANT TRIGGER ON TABLE "public"."reviews" TO "anon";
GRANT TRUNCATE ON TABLE "public"."reviews" TO "anon";
GRANT MAINTAIN ON TABLE "public"."reviews" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."reviews" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."reviews" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."reviews" TO "authenticated";
GRANT DELETE ON TABLE "public"."reviews" TO "postgres";
GRANT INSERT ON TABLE "public"."reviews" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."reviews" TO "postgres";
GRANT REFERENCES ON TABLE "public"."reviews" TO "postgres";
GRANT SELECT ON TABLE "public"."reviews" TO "postgres";
GRANT TRIGGER ON TABLE "public"."reviews" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."reviews" TO "postgres";
GRANT UPDATE ON TABLE "public"."reviews" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."reviews" TO "service_role";
GRANT REFERENCES ON TABLE "public"."reviews" TO "service_role";
GRANT TRIGGER ON TABLE "public"."reviews" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."reviews" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".save_team_access_grant(p_user_id uuid, p_email text, p_job_title text, p_access_level text, p_country_scope text[], p_permissions text[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".save_team_access_grant(p_user_id uuid, p_email text, p_job_title text, p_access_level text, p_country_scope text[], p_permissions text[]) TO "postgres";
GRANT MAINTAIN ON TABLE "public"."service_categories" TO "anon";
GRANT REFERENCES ON TABLE "public"."service_categories" TO "anon";
GRANT TRIGGER ON TABLE "public"."service_categories" TO "anon";
GRANT TRUNCATE ON TABLE "public"."service_categories" TO "anon";
GRANT MAINTAIN ON TABLE "public"."service_categories" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."service_categories" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."service_categories" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."service_categories" TO "authenticated";
GRANT DELETE ON TABLE "public"."service_categories" TO "postgres";
GRANT INSERT ON TABLE "public"."service_categories" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."service_categories" TO "postgres";
GRANT REFERENCES ON TABLE "public"."service_categories" TO "postgres";
GRANT SELECT ON TABLE "public"."service_categories" TO "postgres";
GRANT TRIGGER ON TABLE "public"."service_categories" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."service_categories" TO "postgres";
GRANT UPDATE ON TABLE "public"."service_categories" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."service_categories" TO "service_role";
GRANT REFERENCES ON TABLE "public"."service_categories" TO "service_role";
GRANT TRIGGER ON TABLE "public"."service_categories" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."service_categories" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."services" TO "anon";
GRANT REFERENCES ON TABLE "public"."services" TO "anon";
GRANT TRIGGER ON TABLE "public"."services" TO "anon";
GRANT TRUNCATE ON TABLE "public"."services" TO "anon";
GRANT MAINTAIN ON TABLE "public"."services" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."services" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."services" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."services" TO "authenticated";
GRANT DELETE ON TABLE "public"."services" TO "postgres";
GRANT INSERT ON TABLE "public"."services" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."services" TO "postgres";
GRANT REFERENCES ON TABLE "public"."services" TO "postgres";
GRANT SELECT ON TABLE "public"."services" TO "postgres";
GRANT TRIGGER ON TABLE "public"."services" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."services" TO "postgres";
GRANT UPDATE ON TABLE "public"."services" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."services" TO "service_role";
GRANT REFERENCES ON TABLE "public"."services" TO "service_role";
GRANT TRIGGER ON TABLE "public"."services" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."services" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".set_team_access_status(p_email text, p_status text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".set_team_access_status(p_email text, p_status text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public".set_updated_at() TO "postgres";
GRANT EXECUTE ON FUNCTION "public".start_partner_marketplace_request_handoff(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".start_partner_marketplace_request_handoff(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text) TO "service_role";
GRANT INSERT ON TABLE "public"."system_events" TO "authenticated";
GRANT SELECT ON TABLE "public"."system_events" TO "authenticated";
GRANT DELETE ON TABLE "public"."system_events" TO "postgres";
GRANT INSERT ON TABLE "public"."system_events" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."system_events" TO "postgres";
GRANT REFERENCES ON TABLE "public"."system_events" TO "postgres";
GRANT SELECT ON TABLE "public"."system_events" TO "postgres";
GRANT TRIGGER ON TABLE "public"."system_events" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."system_events" TO "postgres";
GRANT UPDATE ON TABLE "public"."system_events" TO "postgres";
GRANT SELECT ON TABLE "public"."system_events" TO "service_role";
GRANT DELETE ON TABLE "public"."team_access_grants" TO "authenticated";
GRANT INSERT ON TABLE "public"."team_access_grants" TO "authenticated";
GRANT SELECT ON TABLE "public"."team_access_grants" TO "authenticated";
GRANT UPDATE ON TABLE "public"."team_access_grants" TO "authenticated";
GRANT DELETE ON TABLE "public"."team_access_grants" TO "postgres";
GRANT INSERT ON TABLE "public"."team_access_grants" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."team_access_grants" TO "postgres";
GRANT REFERENCES ON TABLE "public"."team_access_grants" TO "postgres";
GRANT SELECT ON TABLE "public"."team_access_grants" TO "postgres";
GRANT TRIGGER ON TABLE "public"."team_access_grants" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."team_access_grants" TO "postgres";
GRANT UPDATE ON TABLE "public"."team_access_grants" TO "postgres";
GRANT DELETE ON TABLE "public"."team_access_grants" TO "service_role";
GRANT INSERT ON TABLE "public"."team_access_grants" TO "service_role";
GRANT SELECT ON TABLE "public"."team_access_grants" TO "service_role";
GRANT UPDATE ON TABLE "public"."team_access_grants" TO "service_role";
GRANT DELETE ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT INSERT ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT REFERENCES ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT SELECT ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT TRIGGER ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT UPDATE ON TABLE "public"."tiktok_connections" TO "postgres";
GRANT DELETE ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT INSERT ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT REFERENCES ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT TRIGGER ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT UPDATE ON TABLE "public"."tiktok_connections" TO "service_role";
GRANT EXECUTE ON FUNCTION "public".transition_marketplace_request(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".transition_marketplace_request(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".transition_marketplace_request(p_request_id uuid, p_expected_status text, p_new_status text, p_confirmation_evidence jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "public".unpublish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".unpublish_product_lifecycle(p_product_id uuid, p_expected_version integer, p_reason text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public".update_product_draft_lifecycle(p_product_id uuid, p_expected_version integer, p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public".update_product_draft_lifecycle(p_product_id uuid, p_expected_version integer, p_name_ar text, p_name_en text, p_slug text, p_base_price numeric, p_country text, p_city text, p_marketplace_family text, p_fulfilment_state text, p_transaction_method text, p_supply_type text, p_supplier_verified boolean, p_featured boolean, p_shield_certified boolean, p_reason text) TO "postgres";
GRANT DELETE ON TABLE "public"."verification_documents" TO "authenticated";
GRANT INSERT ON TABLE "public"."verification_documents" TO "authenticated";
GRANT SELECT ON TABLE "public"."verification_documents" TO "authenticated";
GRANT UPDATE ON TABLE "public"."verification_documents" TO "authenticated";
GRANT DELETE ON TABLE "public"."verification_documents" TO "postgres";
GRANT INSERT ON TABLE "public"."verification_documents" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."verification_documents" TO "postgres";
GRANT REFERENCES ON TABLE "public"."verification_documents" TO "postgres";
GRANT SELECT ON TABLE "public"."verification_documents" TO "postgres";
GRANT TRIGGER ON TABLE "public"."verification_documents" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."verification_documents" TO "postgres";
GRANT UPDATE ON TABLE "public"."verification_documents" TO "postgres";
GRANT DELETE ON TABLE "public"."verification_documents" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_documents" TO "service_role";
GRANT SELECT ON TABLE "public"."verification_documents" TO "service_role";
GRANT UPDATE ON TABLE "public"."verification_documents" TO "service_role";
GRANT DELETE ON TABLE "public"."verification_requests" TO "authenticated";
GRANT INSERT ON TABLE "public"."verification_requests" TO "authenticated";
GRANT SELECT ON TABLE "public"."verification_requests" TO "authenticated";
GRANT UPDATE ON TABLE "public"."verification_requests" TO "authenticated";
GRANT DELETE ON TABLE "public"."verification_requests" TO "postgres";
GRANT INSERT ON TABLE "public"."verification_requests" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."verification_requests" TO "postgres";
GRANT REFERENCES ON TABLE "public"."verification_requests" TO "postgres";
GRANT SELECT ON TABLE "public"."verification_requests" TO "postgres";
GRANT TRIGGER ON TABLE "public"."verification_requests" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."verification_requests" TO "postgres";
GRANT UPDATE ON TABLE "public"."verification_requests" TO "postgres";
GRANT DELETE ON TABLE "public"."verification_requests" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."verification_requests" TO "service_role";
GRANT UPDATE ON TABLE "public"."verification_requests" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_reviews" TO "authenticated";
GRANT SELECT ON TABLE "public"."verification_reviews" TO "authenticated";
GRANT DELETE ON TABLE "public"."verification_reviews" TO "postgres";
GRANT INSERT ON TABLE "public"."verification_reviews" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."verification_reviews" TO "postgres";
GRANT REFERENCES ON TABLE "public"."verification_reviews" TO "postgres";
GRANT SELECT ON TABLE "public"."verification_reviews" TO "postgres";
GRANT TRIGGER ON TABLE "public"."verification_reviews" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."verification_reviews" TO "postgres";
GRANT UPDATE ON TABLE "public"."verification_reviews" TO "postgres";
GRANT DELETE ON TABLE "public"."verification_reviews" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."verification_reviews" TO "service_role";
GRANT UPDATE ON TABLE "public"."verification_reviews" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_status_history" TO "authenticated";
GRANT SELECT ON TABLE "public"."verification_status_history" TO "authenticated";
GRANT DELETE ON TABLE "public"."verification_status_history" TO "postgres";
GRANT INSERT ON TABLE "public"."verification_status_history" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."verification_status_history" TO "postgres";
GRANT REFERENCES ON TABLE "public"."verification_status_history" TO "postgres";
GRANT SELECT ON TABLE "public"."verification_status_history" TO "postgres";
GRANT TRIGGER ON TABLE "public"."verification_status_history" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."verification_status_history" TO "postgres";
GRANT UPDATE ON TABLE "public"."verification_status_history" TO "postgres";
GRANT DELETE ON TABLE "public"."verification_status_history" TO "service_role";
GRANT INSERT ON TABLE "public"."verification_status_history" TO "service_role";
GRANT SELECT ON TABLE "public"."verification_status_history" TO "service_role";
GRANT UPDATE ON TABLE "public"."verification_status_history" TO "service_role";
GRANT DELETE ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT INSERT ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT MAINTAIN ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT REFERENCES ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT SELECT ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT TRIGGER ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT TRUNCATE ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT UPDATE ON TABLE "public"."webhook_idempotency_events" TO "postgres";
GRANT DELETE ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT INSERT ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT SELECT ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT UPDATE ON TABLE "public"."webhook_idempotency_events" TO "service_role";
GRANT INSERT ("email") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ("email") ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT ("full_name") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ("full_name") ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT ("id") ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ("updated_at") ON TABLE "public"."profiles" TO "authenticated";
REVOKE ALL ON SCHEMA public FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin", pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO "anon";
GRANT USAGE ON SCHEMA public TO "authenticated";
GRANT CREATE ON SCHEMA public TO "pg_database_owner";
GRANT USAGE ON SCHEMA public TO "pg_database_owner";
GRANT USAGE ON SCHEMA public TO "postgres";
GRANT USAGE ON SCHEMA public TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,"anon","authenticated","authenticator","cli_login_postgres","dashboard_user","pgbouncer","postgres","service_role","supabase_admin","supabase_auth_admin","supabase_etl_admin","supabase_functions_admin","supabase_privileged_role","supabase_read_only_user","supabase_realtime_admin","supabase_replication_admin","supabase_storage_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRIGGER ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRIGGER ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRIGGER ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRIGGER ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO "service_role";
COMMIT;
