# BOOTSTRAP MIGRATION MANIFEST

Ordered local migration sequence for a full empty DIR3COM database bootstrap.

1. `20260730120000_create_core_schema.sql`
   - Core auth, profiles, services, destinations, bookings, booking items, reviews, promotions, media, baseline triggers, indexes, and base RLS.
   - Core no longer owns `partners` or `notifications`.

2. `20260730150000_create_partner_management.sql`
   - Canonical owner for `public.partners` and partner domain tables.
   - Partner contract: `company_name`, `contact_person`, `email`, `phone`, `country`, `city`, `slug`, `website_url`, `logo_url`, `description_ar`, `description_en`, `commercial_registration`, `tax_number`, `iban`, `shield_level`, `status`, `deleted_at`, `created_at`, `updated_at`.
   - Dependent tables: partner documents, services, coverage, performance.
   - Duplicate core partner creation was removed so this migration is the sole table owner.

3. `20260730170000_create_booking_engine.sql`
   - Booking status history, partner assignments, and booking reviews.
   - This migration no longer creates `partner_settlements`.

4. `20260730180000_create_assignment_engine.sql`
   - Assignment rules, assignment logs, and partner availability.

5. `20260730190000_create_product_management.sql`
   - Product categories, products, images, prices, features, availability, and product relationships.
   - Canonical owner of `products.is_active`, created before domain RLS policies depend on it.

6. `20260730195000_create_customer_management.sql`
   - Customer profiles, documents, preferences, addresses, companions, notes, activity, and wallet records.

7. `20260730200000_create_finance_engine.sql`
   - Canonical owner for `public.partner_settlements`.
   - Settlement contract: `booking_id`, `partner_id`, `amount`, `partner_earnings`, `commission_amount`, `taxes`, `net_settlement`, `currency`, `status`, `settlement_status`, `release_date`, `notes`, `created_at`, `updated_at`.
   - Finance also owns wallets, wallet transactions, escrow, payment transactions, refunds, commission rules, invoices, and payment methods.
   - Duplicate booking settlement creation was removed so finance owns the settlement table once.

8. `20260730210000_create_operations_engine.sql`
   - Canonical owner for `public.notifications`.
   - Notification contract: `profile_id`, `template_id`, `recipient_type`, `recipient_id`, `channel`, `kind`, `title`, `subject`, `body`, `status`, `provider`, `read_at`, `sent_at`, `failed_at`, `error_message`, `metadata`, `deleted_at`, `created_at`, `updated_at`.
   - Operations also owns notification templates, notification logs, audit logs, activity timeline, and system events.
   - Duplicate core notification creation was removed so operations owns the delivery-capable table once.

9. `20260730220000_create_verification_engine.sql`
   - Verification requests, documents, reviews, status history, identity profiles, company profiles, document templates, and expiry tracking.

10. `20260801103000_add_rls_for_engine_domains.sql`
   - Domain-wide RLS and shared admin/service-role policies.
   - Safely depends on `products.is_active`, which already exists from product management.
   - Child-table product visibility policies now follow the final `products.status = 'active'` and `products.is_active = true` rule.
   - Customer notification read policy is defined here against the canonical notifications table.

11. `20260802120000_p0_booking_auth_rls.sql`
   - Booking/profile auth hardening, product-aware booking ownership, and p0 booking RLS repairs.
   - Preserves compatibility with `ADD COLUMN IF NOT EXISTS` and safely backfills `is_active` from product status.

12. `20260802123000_p0_admin_role_and_product_state.sql`
   - Admin helper function and repeatable product active-state trigger.

## Validation Companions

- Preflight: `supabase/preflight/20260802120000_p0_booking_auth_rls_preflight.sql`
- Preflight: `supabase/preflight/20260802123000_p0_admin_role_and_product_state_preflight.sql`
- Postcheck: `supabase/postcheck/20260802123000_p0_admin_role_and_product_state_postcheck.sql`

## Ownership Decisions

- `public.partners` is owned by `20260730150000_create_partner_management.sql`.
- `public.partner_settlements` is owned by `20260730200000_create_finance_engine.sql`.
- `public.notifications` is owned by `20260730210000_create_operations_engine.sql`.

## Why duplicate creation was removed

- The core schema no longer defines `partners` or `notifications` so there is only one canonical owner for each table.
- Booking no longer defines `partner_settlements`, which prevents a second incompatible settlement contract from competing with finance.
- The downstream RLS and indexes now reference the canonical owner tables only.

## Bootstrap Notes

- Unsupported `CREATE POLICY IF NOT EXISTS` syntax has been removed from migrations.
- Historical core triggers are now repeatable with `DROP TRIGGER IF EXISTS` guards.
- Product child-table visibility checks now mirror the final parent product rule.
- This manifest is intended for a full local reset proof on an empty database.
