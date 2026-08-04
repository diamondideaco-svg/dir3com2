-- Read-only preflight for 20260802123000_p0_admin_role_and_product_state.sql.
-- Run before applying the migration. This script performs SELECT statements only.

WITH canonical_owners(table_name, owner_migration) AS (
  VALUES
    ('partners', '20260730150000_create_partner_management.sql'),
    ('partner_settlements', '20260730200000_create_finance_engine.sql'),
    ('notifications', '20260730210000_create_operations_engine.sql')
)
SELECT
  o.table_name,
  o.owner_migration,
  t.table_type AS actual_kind,
  COUNT(t.table_name) OVER (PARTITION BY o.table_name) AS live_table_count,
  (t.table_type = 'BASE TABLE') AS owner_table_present,
  (COUNT(t.table_name) OVER (PARTITION BY o.table_name) = 1) AS duplicate_ownership_risk_cleared
FROM canonical_owners o
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = o.table_name
ORDER BY o.table_name;

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

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prorettype::regtype AS return_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.prokind AS kind,
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
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check,
  (cmd = 'ALL' AND roles @> ARRAY['authenticated']::text[]) AS broad_authenticated_access
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'partners',
    'partner_settlements',
    'notifications',
    'products',
    'product_images',
    'product_prices',
    'product_features',
    'product_availability',
    'profiles',
    'bookings'
  )
ORDER BY tablename, policyname;
