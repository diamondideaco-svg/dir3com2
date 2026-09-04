-- Forward-only least-privilege reconciliation for DABRA provider telemetry.
-- The historical migration intentionally remains unchanged.

DO $migration_preconditions$
DECLARE
  target_oid oid := to_regclass('public.dabra_provider_attempts');
  target_owner name;
  protected_role name;
  expected_columns constant text[] := ARRAY[
    'attempt_id', 'request_id', 'provider', 'model', 'intent_class', 'language', 'route',
    'started_at', 'completed_at', 'latency_ms', 'success', 'error_category', 'fallback_from',
    'fallback_reason', 'fallback_hop', 'input_tokens', 'output_tokens', 'estimated_cost_usd',
    'pricing_version', 'grounding_status', 'created_at'
  ];
  actual_columns text[];
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'dabra_provider_attempts is missing';
  END IF;

  SELECT c.relowner::regrole::name
  INTO target_owner
  FROM pg_class c
  WHERE c.oid = target_oid
    AND c.relkind = 'r';

  IF target_owner IS NULL OR target_owner <> current_user THEN
    RAISE EXCEPTION 'unexpected dabra_provider_attempts ownership: %', coalesce(target_owner, '<not-an-ordinary-table>');
  END IF;

  FOREACH protected_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name, 'service_role'::name]
  LOOP
    IF pg_has_role(protected_role, target_owner, 'USAGE')
       OR pg_has_role(protected_role, target_owner, 'SET') THEN
      RAISE EXCEPTION '% can inherit or assume telemetry table ownership', protected_role;
    END IF;
  END LOOP;

  SELECT array_agg(a.attname::text ORDER BY a.attnum)
  INTO actual_columns
  FROM pg_attribute a
  WHERE a.attrelid = target_oid
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION 'unexpected dabra_provider_attempts column contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = target_oid
      AND i.indexrelid = to_regclass('public.dabra_provider_attempts_request_hop_unique_idx')
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 2
      AND i.indnatts = 2
      AND pg_get_indexdef(i.indexrelid) LIKE '%(request_id, fallback_hop)%'
  ) THEN
    RAISE EXCEPTION 'dabra_provider_attempts logical identity constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_attribute attempt_id_column
      ON attempt_id_column.attrelid = constraint_row.conrelid
      AND attempt_id_column.attname = 'attempt_id'
    WHERE constraint_row.conrelid = target_oid
      AND constraint_row.contype = 'p'
      AND constraint_row.convalidated
      AND constraint_row.conkey = ARRAY[attempt_id_column.attnum]::smallint[]
  ) THEN
    RAISE EXCEPTION 'dabra_provider_attempts primary key is missing';
  END IF;

  IF to_regprocedure('public.get_dabra_provider_metrics(timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'DABRA provider metrics aggregation function is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE c.oid = target_oid
      AND acl.grantee <> c.relowner
      AND (
        coalesce(grantee.rolname, 'PUBLIC') NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
        OR acl.grantor <> c.relowner
      )
  ) THEN
    RAISE EXCEPTION 'unexpected table ACL principal on dabra_provider_attempts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    CROSS JOIN LATERAL aclexplode(a.attacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE a.attrelid = target_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
      AND (
        coalesce(grantee.rolname, 'PUBLIC') NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
        OR acl.grantor <> c.relowner
      )
  ) THEN
    RAISE EXCEPTION 'unexpected column ACL principal on dabra_provider_attempts';
  END IF;
END
$migration_preconditions$;

ALTER TABLE public.dabra_provider_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dabra_provider_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.dabra_provider_attempts
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL (
  attempt_id, request_id, provider, model, intent_class, language, route,
  started_at, completed_at, latency_ms, success, error_category, fallback_from,
  fallback_reason, fallback_hop, input_tokens, output_tokens, estimated_cost_usd,
  pricing_version, grounding_status, created_at
)
ON TABLE public.dabra_provider_attempts
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT
ON TABLE public.dabra_provider_attempts
TO service_role;

DO $migration_postconditions$
DECLARE
  target_oid oid := 'public.dabra_provider_attempts'::regclass;
  forbidden_privilege text;
BEGIN
  IF NOT has_table_privilege('service_role', target_oid, 'SELECT')
     OR NOT has_table_privilege('service_role', target_oid, 'INSERT') THEN
    RAISE EXCEPTION 'service_role is missing required SELECT or INSERT telemetry privilege';
  END IF;

  FOREACH forbidden_privilege IN ARRAY ARRAY[
    'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ] LOOP
    IF has_table_privilege('service_role', target_oid, forbidden_privilege) THEN
      RAISE EXCEPTION 'service_role retains forbidden % telemetry privilege', forbidden_privilege;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS roles(role_name)
    CROSS JOIN unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
    ]) AS privileges(privilege_name)
    WHERE has_table_privilege(role_name, target_oid, privilege_name)
  ) THEN
    RAISE EXCEPTION 'anonymous or authenticated telemetry privilege remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = target_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'column-level telemetry ACL remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.oid = target_oid
      AND c.relowner::regrole::name = current_user
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'telemetry ownership, RLS, or FORCE RLS postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE c.oid = target_oid
      AND acl.grantee <> c.relowner
      AND (
        coalesce(grantee.rolname, 'PUBLIC') <> 'service_role'
        OR acl.privilege_type NOT IN ('SELECT', 'INSERT')
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'telemetry table ACL does not match the least-privilege contract';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE c.oid = target_oid
      AND grantee.rolname = 'service_role'
      AND acl.privilege_type IN ('SELECT', 'INSERT')
      AND NOT acl.is_grantable
  ) <> 2 THEN
    RAISE EXCEPTION 'service_role direct telemetry ACL is incomplete';
  END IF;
END
$migration_postconditions$;
