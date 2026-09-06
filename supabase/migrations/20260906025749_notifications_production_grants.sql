-- Permissions only. No notification rows, columns, policies or triggers change.
-- Current master uses the guarded server client for summary SELECT and
-- createNotification INSERT ... RETURNING. No direct client consumer exists.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target oid := to_regclass('public.notifications');
  actual text[];
  defaults jsonb;
BEGIN
  IF target IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid=target AND relkind='r'
      AND relrowsecurity AND NOT relforcerowsecurity
      AND pg_get_userbyid(relowner)='postgres'
  ) THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_RELATION_CONFLICT';
  END IF;
  LOCK TABLE public.notifications IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=target OR inhparent=target) THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_RELATION_CONFLICT';
  END IF;

  SELECT array_agg(attname || ':' || format_type(atttypid,atttypmod) || ':' || attnotnull::text ORDER BY attname)
    INTO actual FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped;
  IF actual IS DISTINCT FROM ARRAY[
    'body:text:false','created_at:timestamp with time zone:true','deleted_at:timestamp with time zone:false',
    'id:uuid:true','kind:text:true','profile_id:uuid:false','read_at:timestamp with time zone:false',
    'status:text:true','title:text:true','updated_at:timestamp with time zone:true'
  ] OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped
    AND (attgenerated<>'' OR attidentity<>'')) THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_COLUMNS_CONFLICT';
  END IF;
  SELECT jsonb_object_agg(a.attname,pg_get_expr(d.adbin,d.adrelid)) INTO defaults
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped;
  IF defaults IS DISTINCT FROM jsonb_build_object(
    'id','gen_random_uuid()','kind','''info''::text','status','''active''::text',
    'created_at','now()','updated_at','now()'
  ) THEN RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_DEFAULTS_CONFLICT'; END IF;

  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO actual
    FROM pg_constraint WHERE conrelid=target;
  IF actual IS DISTINCT FROM ARRAY[
    'CHECK ((kind = ANY (ARRAY[''info''::text, ''booking''::text, ''promotion''::text, ''system''::text])))',
    'CHECK ((status = ANY (ARRAY[''active''::text, ''read''::text, ''archived''::text])))',
    'FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE','PRIMARY KEY (id)'
  ] THEN RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_CONSTRAINTS_CONFLICT'; END IF;
  SELECT array_agg(indexdef ORDER BY indexname) INTO actual FROM pg_indexes
    WHERE schemaname='public' AND tablename='notifications';
  IF actual IS DISTINCT FROM ARRAY[
    'CREATE INDEX idx_notifications_profile_id ON public.notifications USING btree (profile_id)',
    'CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)'
  ] OR EXISTS (SELECT 1 FROM pg_index WHERE indrelid=target AND (NOT indisvalid OR NOT indisready)) THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_INDEXES_CONFLICT';
  END IF;

  -- Match the existing policy expressions, not just their names. A permissive
  -- replacement must not be blessed by this permissions-only migration.
  IF (SELECT count(*) FROM pg_policy WHERE polrelid=target) <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target
      AND polname='Service role full access' AND polcmd='*' AND polpermissive
      AND polroles=ARRAY[0::oid]
      AND pg_get_expr(polqual,polrelid)='(auth.role() = ''service_role''::text)'
      AND pg_get_expr(polwithcheck,polrelid)='(auth.role() = ''service_role''::text)')
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target
      AND polname='Users manage own notifications' AND polcmd='*' AND polpermissive
      AND polroles=ARRAY[0::oid]
      AND pg_get_expr(polqual,polrelid)='((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text))'
      AND pg_get_expr(polwithcheck,polrelid)='((profile_id IS NOT NULL) AND ((profile_id)::text = (auth.uid())::text))')
  THEN RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_POLICIES_CONFLICT'; END IF;
  SELECT array_agg(pg_get_triggerdef(oid) ORDER BY tgname) INTO actual
    FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal;
  IF actual IS DISTINCT FROM ARRAY[
    'CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
  ] OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal AND tgenabled<>'O') THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_TRIGGERS_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped
    AND cardinality(attacl)>0) THEN
    RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_COLUMN_PRIVILEGE_CONFLICT';
  END IF;
END $$;

-- Remove inherited PUBLIC/table privileges too; grant no UPDATE/DELETE,
-- TRUNCATE, REFERENCES, TRIGGER or MAINTAIN capability to application roles.
REVOKE ALL PRIVILEGES ON TABLE public.notifications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.notifications TO service_role;

DO $$
DECLARE actor text; privilege text;
BEGIN
  FOREACH actor IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege(actor,'public.notifications',privilege)
        IS DISTINCT FROM (actor='service_role' AND privilege IN ('SELECT','INSERT')) THEN
        RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_EFFECTIVE_PRIVILEGE_CONFLICT: % %', actor, privilege;
      END IF;
    END LOOP;
    -- Check effective column privileges too, including inherited access.
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.notifications'::regclass
      AND attnum>0 AND NOT attisdropped AND (
        has_column_privilege(actor,attrelid,attnum,'UPDATE')
        OR has_column_privilege(actor,attrelid,attnum,'REFERENCES')
        OR (actor<>'service_role' AND (has_column_privilege(actor,attrelid,attnum,'SELECT')
          OR has_column_privilege(actor,attrelid,attnum,'INSERT')))
      )) THEN RAISE EXCEPTION 'NOTIFICATIONS_GRANTS_COLUMN_PRIVILEGE_CONFLICT: %', actor; END IF;
  END LOOP;
END $$;
COMMIT;
