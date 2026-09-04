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
    IF pg_has_role(protected_role, target_owner, 'MEMBER') THEN
      RAISE EXCEPTION '% has a role-membership path to telemetry table ownership', protected_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_roles reachable_role
    WHERE reachable_role.oid <> 'service_role'::regrole
      AND pg_has_role('service_role'::regrole, reachable_role.oid, 'MEMBER')
      AND (
        reachable_role.rolsuper
        OR reachable_role.rolbypassrls
        OR reachable_role.oid = target_owner::regrole
        OR reachable_role.oid = (SELECT namespace_row.nspowner FROM pg_namespace namespace_row WHERE namespace_row.oid = 'public'::regnamespace)
        OR reachable_role.rolname IN (
          'pg_write_all_data', 'pg_maintain', 'pg_read_server_files',
          'pg_write_server_files', 'pg_execute_server_program'
        )
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'service_role has a role-membership path to a privileged role for dabra_provider_attempts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) protected(role_name)
    CROSS JOIN pg_roles reachable_role
    WHERE reachable_role.oid <> protected.role_name::regrole
      AND pg_has_role(protected.role_name::regrole, reachable_role.oid, 'MEMBER')
      AND (
        has_table_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'anonymous or authenticated role has a role-membership path to telemetry access';
  END IF;

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
    FROM pg_proc procedure_row
    WHERE procedure_row.oid = to_regprocedure('public.get_dabra_provider_observability_hardening_status()')
      AND procedure_row.proowner <> current_user::regrole
  ) THEN
    RAISE EXCEPTION 'unexpected hardening evidence function ownership';
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

CREATE OR REPLACE FUNCTION public.get_dabra_provider_observability_hardening_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  target_oid oid := to_regclass('public.dabra_provider_attempts');
  target_owner oid;
  service_role_membership_graph_safe boolean;
  anonymous_authenticated_membership_graph_safe boolean;
BEGIN
  SELECT class_row.relowner
  INTO target_owner
  FROM pg_class class_row
  WHERE class_row.oid = target_oid;

  SELECT NOT EXISTS (
    SELECT 1
    FROM pg_roles reachable_role
    WHERE reachable_role.oid <> 'service_role'::regrole
      AND pg_has_role('service_role'::regrole, reachable_role.oid, 'MEMBER')
      AND (
        reachable_role.rolsuper
        OR reachable_role.rolbypassrls
        OR reachable_role.oid = target_owner
        OR reachable_role.oid = (SELECT namespace_row.nspowner FROM pg_namespace namespace_row WHERE namespace_row.oid = 'public'::regnamespace)
        OR reachable_role.rolname IN (
          'pg_write_all_data', 'pg_maintain', 'pg_read_server_files',
          'pg_write_server_files', 'pg_execute_server_program'
        )
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) INTO service_role_membership_graph_safe;

  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) protected(role_name)
    CROSS JOIN pg_roles reachable_role
    WHERE reachable_role.oid <> protected.role_name::regrole
      AND pg_has_role(protected.role_name::regrole, reachable_role.oid, 'MEMBER')
      AND (
        has_table_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) INTO anonymous_authenticated_membership_graph_safe;

  RETURN jsonb_build_object(
    'target_table', 'public.dabra_provider_attempts',
    'migration_identity', '20260904210623_harden_dabra_provider_attempt_acl',
    'migration_applied', EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations migration_row
      WHERE migration_row.version = '20260904210623'
    ),
    'service_role_select', has_table_privilege('service_role', target_oid, 'SELECT'),
    'service_role_insert', has_table_privilege('service_role', target_oid, 'INSERT'),
    'service_role_update', has_table_privilege('service_role', target_oid, 'UPDATE'),
    'service_role_delete', has_table_privilege('service_role', target_oid, 'DELETE'),
    'service_role_truncate', has_table_privilege('service_role', target_oid, 'TRUNCATE'),
    'service_role_references', has_table_privilege('service_role', target_oid, 'REFERENCES'),
    'service_role_trigger', has_table_privilege('service_role', target_oid, 'TRIGGER'),
    'service_role_maintain', has_table_privilege('service_role', target_oid, 'MAINTAIN'),
    'service_role_column_mutation_absent', NOT (
      has_any_column_privilege('service_role', target_oid, 'UPDATE')
      OR has_any_column_privilege('service_role', target_oid, 'REFERENCES')
    ),
    'service_role_set_role_safe', service_role_membership_graph_safe,
    'service_role_role_membership_safe', service_role_membership_graph_safe,
    'anonymous_authenticated_set_role_safe', anonymous_authenticated_membership_graph_safe,
    'anonymous_authenticated_role_membership_safe', anonymous_authenticated_membership_graph_safe,
    'table_acl_exact', (
      NOT EXISTS (
        SELECT 1
        FROM pg_class class_row
        CROSS JOIN LATERAL aclexplode(coalesce(class_row.relacl, acldefault('r', class_row.relowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE class_row.oid = target_oid
          AND acl.grantee <> class_row.relowner
          AND (
            coalesce(grantee.rolname, 'PUBLIC') <> 'service_role'
            OR acl.privilege_type NOT IN ('SELECT', 'INSERT')
            OR acl.is_grantable
          )
      )
      AND (
        SELECT count(*)
        FROM pg_class class_row
        CROSS JOIN LATERAL aclexplode(coalesce(class_row.relacl, acldefault('r', class_row.relowner))) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE class_row.oid = target_oid
          AND grantee.rolname = 'service_role'
          AND acl.privilege_type IN ('SELECT', 'INSERT')
          AND NOT acl.is_grantable
      ) = 2
    ),
    'column_acl_absent', NOT EXISTS (
      SELECT 1
      FROM pg_attribute attribute_row
      WHERE attribute_row.attrelid = target_oid
        AND attribute_row.attnum > 0
        AND NOT attribute_row.attisdropped
        AND attribute_row.attacl IS NOT NULL
    ),
    'rls_enabled', (SELECT class_row.relrowsecurity FROM pg_class class_row WHERE class_row.oid = target_oid),
    'force_rls_enabled', (SELECT class_row.relforcerowsecurity FROM pg_class class_row WHERE class_row.oid = target_oid)
  );
END
$function$;

REVOKE ALL PRIVILEGES
ON FUNCTION public.get_dabra_provider_observability_hardening_status()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.get_dabra_provider_observability_hardening_status()
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
    FROM pg_roles reachable_role
    JOIN pg_class target_class ON target_class.oid = target_oid
    WHERE reachable_role.oid <> 'service_role'::regrole
      AND pg_has_role('service_role'::regrole, reachable_role.oid, 'MEMBER')
      AND (
        reachable_role.rolsuper
        OR reachable_role.rolbypassrls
        OR reachable_role.oid = target_class.relowner
        OR reachable_role.oid = (SELECT namespace_row.nspowner FROM pg_namespace namespace_row WHERE namespace_row.oid = 'public'::regnamespace)
        OR reachable_role.rolname IN (
          'pg_write_all_data', 'pg_maintain', 'pg_read_server_files',
          'pg_write_server_files', 'pg_execute_server_program'
        )
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'service_role retains a role-membership path to a privileged role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) protected(role_name)
    CROSS JOIN pg_roles reachable_role
    WHERE reachable_role.oid <> protected.role_name::regrole
      AND pg_has_role(protected.role_name::regrole, reachable_role.oid, 'MEMBER')
      AND (
        has_table_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_table_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'DELETE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRUNCATE')
        OR has_table_privilege(reachable_role.oid, target_oid, 'REFERENCES')
        OR has_table_privilege(reachable_role.oid, target_oid, 'TRIGGER')
        OR has_table_privilege(reachable_role.oid, target_oid, 'MAINTAIN')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'SELECT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'INSERT')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'UPDATE')
        OR has_any_column_privilege(reachable_role.oid, target_oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'anonymous or authenticated role retains a role-membership path to telemetry access';
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

  IF NOT has_function_privilege('service_role', 'public.get_dabra_provider_observability_hardening_status()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_dabra_provider_observability_hardening_status()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_dabra_provider_observability_hardening_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hardening evidence function ACL does not match the service-role-only contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure_row
    WHERE procedure_row.oid = 'public.get_dabra_provider_observability_hardening_status()'::regprocedure
      AND procedure_row.proowner = current_user::regrole
      AND procedure_row.prosecdef
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc procedure_row
    CROSS JOIN LATERAL aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE procedure_row.oid = 'public.get_dabra_provider_observability_hardening_status()'::regprocedure
      AND acl.grantee <> procedure_row.proowner
      AND (
        coalesce(grantee.rolname, 'PUBLIC') <> 'service_role'
        OR acl.privilege_type <> 'EXECUTE'
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'hardening evidence function ownership or ACL drift remains';
  END IF;
END
$migration_postconditions$;
