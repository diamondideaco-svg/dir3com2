-- Forward-only prerequisite for the six pending PR #93 migrations.
-- Deliberately no DDL, DML, grants, policies or triggers on notifications.
BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  old_values jsonb DEFAULT '{}'::jsonb,
  new_values jsonb DEFAULT '{}'::jsonb,
  performed_by text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  ip_address text
);
CREATE TABLE IF NOT EXISTS public.activity_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  event_type text NOT NULL,
  summary text,
  metadata jsonb DEFAULT '{}'::jsonb,
  performed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- IF NOT EXISTS is not a schema reconciliation mechanism. Stop if a
-- pre-existing operations relation differs from the reviewed contract.
DO $$
DECLARE
  target text; expected text[]; actual text[];
  expected_defaults jsonb; actual_defaults jsonb;
  previous_search_path text := current_setting('search_path');
BEGIN
  -- Deparse defaults with built-ins first: a same-named custom function must
  -- not masquerade as the reviewed UUID/time generator.
  PERFORM set_config('search_path','pg_catalog, public',true);
  FOREACH target IN ARRAY ARRAY['audit_logs','activity_timeline','system_events'] LOOP
    expected := CASE target
      WHEN 'audit_logs' THEN ARRAY['action:text:true','entity_id:text:true','entity_type:text:true','id:uuid:true','ip_address:text:false','new_values:jsonb:false','old_values:jsonb:false','performed_by:text:false','timestamp:timestamp with time zone:true']
      WHEN 'activity_timeline' THEN ARRAY['created_at:timestamp with time zone:true','entity_id:text:true','entity_type:text:true','event_type:text:true','id:uuid:true','metadata:jsonb:false','performed_by:text:false','summary:text:false']
      ELSE ARRAY['created_at:timestamp with time zone:true','entity_id:text:false','entity_type:text:false','event_name:text:true','id:uuid:true','payload:jsonb:false','source:text:false'] END;
    SELECT array_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text ORDER BY a.attname)
      INTO actual FROM pg_attribute a
      WHERE a.attrelid=to_regclass('public.' || target) AND a.attnum>0 AND NOT a.attisdropped;
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'PR93_OPERATIONS_SCHEMA_CONFLICT: %', target;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=to_regclass('public.' || target) AND c.contype='p'
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid=c.conrelid AND attname='id' AND NOT attisdropped)]::smallint[]
        AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
    ) THEN
      RAISE EXCEPTION 'PR93_OPERATIONS_PK_CONFLICT: %', target;
    END IF;
    expected_defaults := CASE target
      WHEN 'audit_logs' THEN jsonb_build_object('id','gen_random_uuid()','timestamp','now()','old_values','''{}''::jsonb','new_values','''{}''::jsonb')
      WHEN 'activity_timeline' THEN jsonb_build_object('id','gen_random_uuid()','created_at','now()','metadata','''{}''::jsonb')
      ELSE jsonb_build_object('id','gen_random_uuid()','created_at','now()','payload','''{}''::jsonb') END;
    SELECT jsonb_object_agg(a.attname,pg_get_expr(d.adbin,d.adrelid)) INTO actual_defaults
      FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=to_regclass('public.' || target) AND a.attnum>0 AND NOT a.attisdropped;
    IF actual_defaults IS DISTINCT FROM expected_defaults OR EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.' || target)
        AND attnum>0 AND NOT attisdropped AND (attgenerated<>'' OR attidentity<>'')
    ) THEN
      RAISE EXCEPTION 'PR93_OPERATIONS_DEFAULT_CONFLICT: %', target;
    END IF;
    -- The reviewed tables have only their id PK. Extra checks, references,
    -- uniqueness or exclusions can reject otherwise valid runtime inserts.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.' || target)
        AND contype IN ('c','f','u','x','t'))
      OR EXISTS (SELECT 1 FROM pg_index WHERE indrelid=to_regclass('public.' || target)
        AND indisunique AND NOT indisprimary) THEN
      RAISE EXCEPTION 'PR93_OPERATIONS_CONSTRAINT_CONFLICT: %', target;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.' || target)) THEN
      RAISE EXCEPTION 'PR93_OPERATIONS_POLICY_CONFLICT: %', target;
    END IF;
  END LOOP;
  PERFORM set_config('search_path',previous_search_path,true);
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type,entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_entity ON public.activity_timeline(entity_type,entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_created_at ON public.activity_timeline(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_name ON public.system_events(event_name);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON public.system_events(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_timeline FORCE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs,public.activity_timeline,public.system_events FROM PUBLIC,anon,authenticated,service_role;
-- Current operations actions use the authenticated admin client for writes
-- (and .insert().select()), and requireAdminReadAccess for server reads.
GRANT SELECT, INSERT ON public.audit_logs,public.activity_timeline,public.system_events TO authenticated;
GRANT SELECT ON public.audit_logs,public.activity_timeline,public.system_events TO service_role;

CREATE POLICY operations_admin_read ON public.audit_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));
CREATE POLICY operations_admin_insert ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (performed_by=(SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));
CREATE POLICY operations_admin_read ON public.activity_timeline FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));
CREATE POLICY operations_admin_insert ON public.activity_timeline FOR INSERT TO authenticated
WITH CHECK (performed_by=(SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));
CREATE POLICY operations_admin_read ON public.system_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));
CREATE POLICY operations_admin_insert ON public.system_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND lower(trim(p.role::text)) IN ('admin','super_admin') AND p.status='active' AND p.deleted_at IS NULL));

CREATE FUNCTION public.reject_operations_record_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'OPERATIONS_RECORD_APPEND_ONLY'; END $$;
REVOKE ALL ON FUNCTION public.reject_operations_record_mutation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER operations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_operations_record_mutation();
CREATE TRIGGER operations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.activity_timeline
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_operations_record_mutation();
CREATE TRIGGER operations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON public.system_events
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_operations_record_mutation();
COMMIT;
