-- Read-only preflight for 20260802120000_p0_booking_auth_rls.sql.
-- Run before applying the migration. This script performs SELECT statements only.

WITH required_relations(schema_name, relation_name, expected_kind) AS (
  VALUES
    ('public', 'profiles', 'BASE TABLE'),
    ('public', 'bookings', 'BASE TABLE'),
    ('public', 'products', 'BASE TABLE')
)
SELECT
  r.schema_name,
  r.relation_name,
  r.expected_kind,
  t.table_type AS actual_kind,
  (t.table_type = r.expected_kind) AS compatible
FROM required_relations r
LEFT JOIN information_schema.tables t
  ON t.table_schema = r.schema_name
 AND t.table_name = r.relation_name
ORDER BY r.relation_name;

WITH required_columns(table_name, column_name, expected_data_type, expected_udt_name) AS (
  VALUES
    ('profiles', 'id', 'uuid', 'uuid'),
    ('profiles', 'role', 'text', 'text'),
    ('profiles', 'status', 'text', 'text'),
    ('bookings', 'profile_id', 'uuid', 'uuid'),
    ('products', 'status', 'text', 'text')
)
SELECT
  r.table_name,
  r.column_name,
  r.expected_data_type,
  c.data_type AS actual_data_type,
  c.udt_name AS actual_udt_name,
  c.is_nullable,
  (c.data_type = r.expected_data_type AND c.udt_name = r.expected_udt_name) AS compatible
FROM required_columns r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = r.table_name
 AND c.column_name = r.column_name
ORDER BY r.table_name, r.column_name;

SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  (pg_get_function_identity_arguments(p.oid) = '' AND pg_get_function_result(p.oid) = 'boolean') AS compatible
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin_actor';

SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'bookings', 'products')
ORDER BY c.relname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'bookings', 'products')
ORDER BY tablename, policyname;

SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'bookings', 'products')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT
  grantee,
  table_schema,
  table_name,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'authenticated'
ORDER BY column_name, privilege_type;
