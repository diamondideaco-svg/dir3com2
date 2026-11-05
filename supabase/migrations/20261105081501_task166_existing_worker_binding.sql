-- Task166: a new protected consumer, not activation or a generic secret API.
-- No permit, secret, scheduled job, network request or existing ACL is changed.
BEGIN;
DO $owner$ BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'TASK166_POSTGRES_OWNER_REQUIRED'; END IF;
END $owner$;

CREATE TABLE drive_notification_private.task166_worker_binding_permit (
  approval_id uuid PRIMARY KEY,
  reference_name text NOT NULL DEFAULT 'task166_existing_worker_bearer'
    UNIQUE CHECK (reference_name = 'task166_existing_worker_bearer'),
  actor_uuid uuid NOT NULL DEFAULT '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'
    CHECK (actor_uuid = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'),
  source_sha text NOT NULL CHECK (source_sha ~ '^[a-f0-9]{40}$'),
  deployment_id text NOT NULL CHECK (deployment_id ~ '^dpl_[A-Za-z0-9]{10,100}$'),
  vercel_project_id text NOT NULL DEFAULT 'prj_gZUtHIctrzE0MeOwdBC2DS3yKJSJ'
    CHECK (vercel_project_id = 'prj_gZUtHIctrzE0MeOwdBC2DS3yKJSJ'),
  supabase_project_ref text NOT NULL DEFAULT 'ynupwivgvwcyrsdhtkcc'
    CHECK (supabase_project_ref = 'ynupwivgvwcyrsdhtkcc'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  vault_secret_id uuid,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'),
  CHECK ((consumed_at IS NULL) = (vault_secret_id IS NULL))
);
ALTER TABLE drive_notification_private.task166_worker_binding_permit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON drive_notification_private.task166_worker_binding_permit FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_task166_worker_binding_state(p_approval_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $state$
DECLARE
  permit drive_notification_private.task166_worker_binding_permit%ROWTYPE;
  reference_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid()
      AND lower(btrim(role))='admin' AND status='active' AND deleted_at IS NULL)
    THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  SELECT * INTO permit FROM drive_notification_private.task166_worker_binding_permit WHERE approval_id=p_approval_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','NOT_APPROVED'); END IF;
  IF permit.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('code','REVOKED'); END IF;
  SELECT id INTO reference_id FROM vault.secrets WHERE name='task166_existing_worker_bearer';
  IF permit.consumed_at IS NOT NULL THEN
    IF reference_id IS DISTINCT FROM permit.vault_secret_id THEN RETURN jsonb_build_object('code','INCONSISTENT_STOP'); END IF;
  ELSE
    IF reference_id IS NOT NULL THEN RETURN jsonb_build_object('code','CONFLICT_STOP'); END IF;
    IF clock_timestamp() < permit.issued_at OR clock_timestamp() >= permit.expires_at
      THEN RETURN jsonb_build_object('code','EXPIRED'); END IF;
  END IF;
  RETURN jsonb_build_object('code',CASE WHEN permit.consumed_at IS NULL THEN 'READY' ELSE 'BOUND' END,
    'approvalId',permit.approval_id,'sourceSha',permit.source_sha,'deploymentId',permit.deployment_id,
    'referenceName',permit.reference_name,'secretId',permit.vault_secret_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code','UNCONFIRMED_CHECK_METADATA');
END $state$;

CREATE FUNCTION public.bind_task166_existing_worker(p_approval_id uuid,p_source_sha text,p_deployment_id text,p_worker text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $bind$
DECLARE
  permit drive_notification_private.task166_worker_binding_permit%ROWTYPE;
  current_state jsonb;
  reference_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  -- Fence a concurrent profile revocation before touching the permit or Vault.
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() AND lower(btrim(role))='admin'
    AND status='active' AND deleted_at IS NULL FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','FORBIDDEN'); END IF;
  SELECT * INTO permit FROM drive_notification_private.task166_worker_binding_permit
    WHERE approval_id=p_approval_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','NOT_APPROVED'); END IF;
  IF p_source_sha IS DISTINCT FROM permit.source_sha OR p_deployment_id IS DISTINCT FROM permit.deployment_id
    THEN RETURN jsonb_build_object('code','IDENTITY_MISMATCH'); END IF;
  current_state:=public.get_task166_worker_binding_state(p_approval_id);
  IF current_state->>'code'='BOUND' THEN RETURN current_state || jsonb_build_object('code','ALREADY_BOUND'); END IF;
  IF current_state->>'code' IS DISTINCT FROM 'READY' THEN RETURN current_state; END IF;
  IF p_worker IS NULL OR char_length(p_worker)<32 OR char_length(p_worker)>512
    THEN RETURN jsonb_build_object('code','WORKER_UNAVAILABLE'); END IF;
  -- Installed signature verified read-only. Its unique name index also fences
  -- a concurrent writer outside this one-time permit. Never upsert/adopt.
  SELECT vault.create_secret(p_worker,'task166_existing_worker_bearer','Task166 existing worker binding',NULL::uuid)
    INTO reference_id;
  IF reference_id IS NULL THEN RAISE EXCEPTION 'TASK166_BIND_UNCONFIRMED'; END IF;
  -- Expiry is checked again after Vault returns; exception rolls back BOTH writes.
  IF clock_timestamp() >= permit.expires_at THEN RAISE EXCEPTION 'TASK166_BIND_UNCONFIRMED'; END IF;
  UPDATE drive_notification_private.task166_worker_binding_permit
    SET consumed_at=clock_timestamp(),vault_secret_id=reference_id WHERE approval_id=permit.approval_id;
  RETURN jsonb_build_object('code','BOUND','approvalId',permit.approval_id,
    'sourceSha',permit.source_sha,'deploymentId',permit.deployment_id,
    'referenceName',permit.reference_name,'secretId',reference_id);
EXCEPTION
  WHEN lock_not_available THEN RETURN jsonb_build_object('code','BUSY_CHECK_METADATA');
  WHEN OTHERS THEN RETURN jsonb_build_object('code','UNCONFIRMED_CHECK_METADATA');
END $bind$;

REVOKE ALL ON FUNCTION public.get_task166_worker_binding_state(uuid),
  public.bind_task166_existing_worker(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_task166_worker_binding_state(uuid),
  public.bind_task166_existing_worker(uuid,text,text,text) TO authenticated;
-- postgres owns these objects. Existing Vault/service_role/platform trust is
-- unchanged. No client gets table/schema/Vault grants. No permit is seeded.
COMMIT;
