-- Task217/PR231: bind the existing Task166 permit to a trusted worker fingerprint.
-- Source preparation only; applying this forward requires separate Production approval.
-- No secret read/copy, permit backfill, renewal, activation, budget or EXECUTE change.
BEGIN;
DO $baseline$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'TASK166_POSTGRES_OWNER_REQUIRED'; END IF;
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.pg_get_functiondef('public.bind_task166_existing_worker(uuid,text,text,text)'::regprocedure),'UTF8')),'hex')
      IS DISTINCT FROM 'aba770e46424d96b35f0d1a1ad55ffc7a82b6cb2461612bd98cd33800f34b80e'
    THEN RAISE EXCEPTION 'TASK166_BINDING_BASELINE_MISMATCH'; END IF;
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.pg_get_functiondef('public.get_task166_worker_binding_state(uuid)'::regprocedure),'UTF8')),'hex')
      IS DISTINCT FROM 'ae6b5fc540dd0bea50b378480534884311abd89854356917e45b62cee1601f1c'
    THEN RAISE EXCEPTION 'TASK166_BINDING_BASELINE_MISMATCH'; END IF;
END $baseline$;

-- Only the existing postgres-owned private permit issuer can pin this field.
-- NULL deliberately preserves old rows while stopping every unfinished legacy permit.
ALTER TABLE drive_notification_private.task166_worker_binding_permit
  ADD COLUMN expected_worker_sha256 text
  CHECK (expected_worker_sha256 IS NULL OR expected_worker_sha256 ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.get_task166_worker_binding_state(p_approval_id uuid)
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
    -- Legacy unfinished permits have no trusted proof. Never backfill or renew them.
    IF permit.expected_worker_sha256 IS NULL
      THEN RETURN jsonb_build_object('code','WORKER_BINDING_PROOF_REQUIRED'); END IF;
    IF reference_id IS NOT NULL THEN RETURN jsonb_build_object('code','CONFLICT_STOP'); END IF;
    IF clock_timestamp() < permit.issued_at OR clock_timestamp() >= permit.expires_at
      THEN RETURN jsonb_build_object('code','EXPIRED'); END IF;
  END IF;
  RETURN jsonb_build_object('code',CASE WHEN permit.consumed_at IS NULL THEN 'READY' ELSE 'BOUND' END,
    'approvalId',permit.approval_id,'sourceSha',permit.source_sha,'deploymentId',permit.deployment_id,
    'referenceName',permit.reference_name,'secretId',permit.vault_secret_id);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code','UNCONFIRMED_CHECK_METADATA');
END $state$;

CREATE OR REPLACE FUNCTION public.bind_task166_existing_worker(p_approval_id uuid,p_source_sha text,p_deployment_id text,p_worker text)
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
  -- The fingerprint is pinned by the trusted permit issuer, never by this RPC.
  -- The permit row lock fences replacement/revocation until both writes finish.
  IF permit.expected_worker_sha256 IS NULL
    THEN RETURN jsonb_build_object('code','WORKER_BINDING_PROOF_REQUIRED'); END IF;
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'task166-existing-worker-v1:' || p_worker,'UTF8')),'hex')
      IS DISTINCT FROM permit.expected_worker_sha256
    THEN RETURN jsonb_build_object('code','WORKER_IDENTITY_MISMATCH'); END IF;
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

-- CREATE OR REPLACE retains the existing function OIDs/ACLs.
-- No GRANT/REVOKE or existing permit, Vault value or completed binding is changed.
COMMIT;
