-- Read-only postcheck for the full empty-database bootstrap and P0 security sequence.
-- Run after the full local migration reset has completed.

WITH required_relations(schema_name, relation_name, expected_kind, owner_migration) AS (
  VALUES
    ('public', 'partners', 'BASE TABLE', '20260730150000_create_partner_management.sql'),
    ('public', 'partner_settlements', 'BASE TABLE', '20260730200000_create_finance_engine.sql'),
    ('public', 'notifications', 'BASE TABLE', '20260730210000_create_operations_engine.sql'),
    ('public', 'notification_templates', 'BASE TABLE', '20260730210000_create_operations_engine.sql'),
    ('public', 'notification_logs', 'BASE TABLE', '20260730210000_create_operations_engine.sql'),
    ('public', 'profiles', 'BASE TABLE', '20260730120000_create_core_schema.sql'),
    ('public', 'bookings', 'BASE TABLE', '20260730120000_create_core_schema.sql'),
    ('public', 'products', 'BASE TABLE', '20260730190000_create_product_management.sql'),
    ('public', 'product_images', 'BASE TABLE', '20260730190000_create_product_management.sql'),
    ('public', 'product_prices', 'BASE TABLE', '20260730190000_create_product_management.sql'),
    ('public', 'product_features', 'BASE TABLE', '20260730190000_create_product_management.sql'),
    ('public', 'product_availability', 'BASE TABLE', '20260730190000_create_product_management.sql')
)
SELECT
  r.schema_name,
  r.relation_name,
  r.owner_migration,
  r.expected_kind,
  t.table_type AS actual_kind,
  COUNT(t.table_name) OVER (PARTITION BY r.relation_name) AS live_table_count,
  (t.table_type = r.expected_kind) AS compatible,
  (COUNT(t.table_name) OVER (PARTITION BY r.relation_name) = 1) AS duplicate_ownership_cleared
FROM required_relations r
LEFT JOIN information_schema.tables t
  ON t.table_schema = r.schema_name
 AND t.table_name = r.relation_name
ORDER BY r.relation_name;

WITH required_columns(table_name, column_name, expected_data_type, expected_udt_name) AS (
  VALUES
    ('partners', 'company_name', 'text', 'text'),
    ('partners', 'contact_person', 'text', 'text'),
    ('partners', 'email', 'text', 'text'),
    ('partners', 'phone', 'text', 'text'),
    ('partners', 'country', 'text', 'text'),
    ('partners', 'city', 'text', 'text'),
    ('partners', 'slug', 'text', 'text'),
    ('partners', 'website_url', 'text', 'text'),
    ('partners', 'logo_url', 'text', 'text'),
    ('partners', 'description_ar', 'text', 'text'),
    ('partners', 'description_en', 'text', 'text'),
    ('partners', 'commercial_registration', 'text', 'text'),
    ('partners', 'tax_number', 'text', 'text'),
    ('partners', 'iban', 'text', 'text'),
    ('partners', 'shield_level', 'text', 'text'),
    ('partners', 'status', 'text', 'text'),
    ('partners', 'deleted_at', 'timestamp with time zone', 'timestamptz'),
    ('partners', 'created_at', 'timestamp with time zone', 'timestamptz'),
    ('partners', 'updated_at', 'timestamp with time zone', 'timestamptz'),
    ('partner_settlements', 'booking_id', 'uuid', 'uuid'),
    ('partner_settlements', 'partner_id', 'uuid', 'uuid'),
    ('partner_settlements', 'amount', 'numeric', 'numeric'),
    ('partner_settlements', 'partner_earnings', 'numeric', 'numeric'),
    ('partner_settlements', 'commission_amount', 'numeric', 'numeric'),
    ('partner_settlements', 'taxes', 'numeric', 'numeric'),
    ('partner_settlements', 'net_settlement', 'numeric', 'numeric'),
    ('partner_settlements', 'currency', 'text', 'text'),
    ('partner_settlements', 'status', 'text', 'text'),
    ('partner_settlements', 'settlement_status', 'text', 'text'),
    ('partner_settlements', 'release_date', 'timestamp with time zone', 'timestamptz'),
    ('partner_settlements', 'notes', 'text', 'text'),
    ('partner_settlements', 'created_at', 'timestamp with time zone', 'timestamptz'),
    ('partner_settlements', 'updated_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'profile_id', 'uuid', 'uuid'),
    ('notifications', 'template_id', 'uuid', 'uuid'),
    ('notifications', 'recipient_type', 'text', 'text'),
    ('notifications', 'recipient_id', 'uuid', 'uuid'),
    ('notifications', 'channel', 'text', 'text'),
    ('notifications', 'kind', 'text', 'text'),
    ('notifications', 'title', 'text', 'text'),
    ('notifications', 'subject', 'text', 'text'),
    ('notifications', 'body', 'text', 'text'),
    ('notifications', 'status', 'text', 'text'),
    ('notifications', 'provider', 'text', 'text'),
    ('notifications', 'read_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'sent_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'failed_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'error_message', 'text', 'text'),
    ('notifications', 'deleted_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'metadata', 'jsonb', 'jsonb'),
    ('notifications', 'created_at', 'timestamp with time zone', 'timestamptz'),
    ('notifications', 'updated_at', 'timestamp with time zone', 'timestamptz')
)
SELECT
  r.table_name,
  r.column_name,
  r.expected_data_type,
  c.data_type AS actual_data_type,
  c.udt_name AS actual_udt_name,
  c.is_nullable,
  (c.data_type = r.expected_data_type OR c.udt_name = r.expected_udt_name) AS compatible
FROM required_columns r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = r.table_name
 AND c.column_name = r.column_name
ORDER BY r.table_name, r.column_name;

WITH expected_indexes(index_name) AS (
  VALUES
    ('idx_partners_status'),
    ('idx_partners_company_name'),
    ('idx_partner_documents_partner_id'),
    ('idx_partner_services_partner_id'),
    ('idx_partner_coverage_partner_id'),
    ('idx_partner_performance_partner_id'),
    ('idx_partner_settlements_booking_id'),
    ('idx_partner_settlements_partner_id'),
    ('idx_partner_settlements_status'),
    ('idx_partner_settlements_settlement_status'),
    ('idx_notifications_status'),
    ('idx_notifications_template_id'),
    ('idx_notifications_profile_id'),
    ('idx_notifications_recipient'),
    ('idx_notification_logs_notification_id'),
    ('idx_products_category_id'),
    ('idx_product_images_product_id'),
    ('idx_product_prices_product_id'),
    ('idx_product_features_product_id'),
    ('idx_product_availability_product_id'),
    ('idx_product_availability_partner_id')
)
SELECT
  e.index_name,
  i.indexname AS actual_index_name,
  (i.indexname = e.index_name) AS compatible
FROM expected_indexes e
LEFT JOIN pg_indexes i
  ON i.schemaname = 'public'
 AND i.indexname = e.index_name
ORDER BY e.index_name;

WITH expected_constraints(table_name, constraint_name) AS (
  VALUES
    ('partners', 'partners_email_key'),
    ('partners', 'partners_slug_key'),
    ('partner_settlements', 'partner_settlements_booking_id_fkey'),
    ('partner_settlements', 'partner_settlements_partner_id_fkey'),
    ('partner_settlements', 'partner_settlements_status_check'),
    ('partner_settlements', 'partner_settlements_settlement_status_check'),
    ('notifications', 'notifications_profile_id_fkey'),
    ('notifications', 'notifications_template_id_fkey'),
    ('notification_logs', 'notification_logs_notification_id_fkey'),
    ('product_images', 'product_images_product_id_fkey'),
    ('product_prices', 'product_prices_product_id_fkey'),
    ('product_features', 'product_features_product_id_fkey'),
    ('product_availability', 'product_availability_product_id_fkey'),
    ('product_availability', 'product_availability_partner_id_fkey')
)
SELECT
  e.table_name,
  e.constraint_name,
  c.contype,
  pg_get_constraintdef(c.oid) AS definition,
  (c.conname = e.constraint_name) AS compatible
FROM expected_constraints e
LEFT JOIN pg_constraint c
  ON c.connamespace = 'public'::regnamespace
 AND c.conname = e.constraint_name
ORDER BY e.table_name, e.constraint_name;

WITH expected_triggers(table_name, trigger_name) AS (
  VALUES
    ('profiles', 'set_profiles_updated_at'),
    ('service_categories', 'set_service_categories_updated_at'),
    ('services', 'set_services_updated_at'),
    ('destinations', 'set_destinations_updated_at'),
    ('bookings', 'set_bookings_updated_at'),
    ('booking_items', 'set_booking_items_updated_at'),
    ('reviews', 'set_reviews_updated_at'),
    ('promotions', 'set_promotions_updated_at'),
    ('media', 'set_media_updated_at'),
    ('partners', 'set_partners_updated_at'),
    ('partner_settlements', 'set_partner_settlements_updated_at'),
    ('notification_templates', 'set_notification_templates_updated_at'),
    ('notifications', 'set_notifications_updated_at'),
    ('products', 'sync_product_active_state')
)
SELECT
  e.table_name,
  e.trigger_name,
  t.tgname AS actual_trigger_name,
  (t.tgname = e.trigger_name) AS compatible
FROM expected_triggers e
LEFT JOIN pg_trigger t
  ON t.tgname = e.trigger_name
LEFT JOIN pg_class c
  ON c.oid = t.tgrelid
LEFT JOIN pg_namespace n
  ON n.oid = c.relnamespace
 AND n.nspname = 'public'
ORDER BY e.table_name, e.trigger_name;

WITH expected_policies(table_name, policy_name) AS (
  VALUES
    ('profiles', 'users_read_own_profile'),
    ('profiles', 'users_update_own_profile'),
    ('profiles', 'users_insert_own_profile'),
    ('bookings', 'users_read_own_bookings'),
    ('bookings', 'admins_manage_bookings'),
    ('partners', 'Public read partners'),
    ('partners', 'admin_full_access'),
    ('partners', 'service_role_full_access'),
    ('partner_settlements', 'customer_read_own_partner_settlements'),
    ('partner_settlements', 'admin_full_access'),
    ('partner_settlements', 'service_role_full_access'),
    ('notifications', 'customer_read_own_notifications'),
    ('notifications', 'admin_full_access'),
    ('notifications', 'service_role_full_access'),
    ('products', 'public_read_active_products'),
    ('product_images', 'public_read_product_images'),
    ('product_prices', 'public_read_product_prices'),
    ('product_features', 'public_read_product_features'),
    ('product_availability', 'public_read_product_availability')
)
SELECT
  e.table_name,
  e.policy_name,
  p.policyname AS actual_policy_name,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check,
  (p.policyname = e.policy_name) AS compatible
FROM expected_policies e
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = e.table_name
 AND p.policyname = e.policy_name
ORDER BY e.table_name, e.policy_name;

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prorettype::regtype AS return_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_config,
  EXISTS (
    SELECT 1
    FROM information_schema.role_routine_grants g
    WHERE g.specific_schema = 'public'
      AND g.routine_name = p.proname
      AND g.grantee IN ('authenticated', 'service_role')
      AND g.privilege_type = 'EXECUTE'
  ) AS execute_granted_to_runtime_roles
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin_actor', 'sync_product_active_state')
ORDER BY p.proname;

SELECT
  table_schema,
  table_name,
  column_name,
  privilege_type,
  is_grantable,
  (column_name NOT IN ('role', 'status') OR privilege_type <> 'UPDATE') AS compatible
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'authenticated'
  AND column_name IN ('id', 'full_name', 'email', 'phone', 'avatar_url', 'role', 'status', 'updated_at')
ORDER BY column_name, privilege_type;

SELECT
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'authenticated'
  AND column_name IN ('role', 'status')
  AND privilege_type = 'UPDATE';

SELECT
  COUNT(*) AS public_base_tables,
  COUNT(*) >= 12 AS meets_minimum_table_threshold
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

SELECT
  COUNT(*) AS public_policy_count,
  COUNT(*) >= 20 AS meets_minimum_policy_threshold
FROM pg_policies
WHERE schemaname = 'public';

SELECT
  COUNT(*) AS public_rls_enabled_tables,
  COUNT(*) >= 10 AS meets_minimum_rls_threshold
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check,
  COUNT(*) OVER (PARTITION BY schemaname, tablename, policyname) AS policy_name_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('partners', 'partner_settlements', 'notifications', 'products', 'product_images', 'product_prices', 'product_features', 'product_availability', 'profiles', 'bookings')
ORDER BY tablename, policyname;

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  COUNT(*) OVER (PARTITION BY c.relname, t.tgname) AS trigger_name_count
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'service_categories', 'services', 'destinations', 'bookings', 'booking_items', 'reviews', 'promotions', 'media', 'partners', 'partner_settlements', 'notification_templates', 'notifications', 'products')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
