-- DIR-120 corrective migration: provide a canonical, request-scoped audit
-- ledger and remove the transition RPC's dependency on a non-existent global
-- public.audit_logs relation. The historical DIR-120 migration remains intact;
-- this migration is the only supported final-state correction.

CREATE TABLE public.marketplace_request_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.marketplace_requests(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  actor_identity text NOT NULL CHECK (NULLIF(BTRIM(actor_identity), '') IS NOT NULL),
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'staff', 'service_role')),
  actor_source text NOT NULL CHECK (actor_source IN ('admin_operations_rpc', 'system_transition_rpc')),
  previous_status text NOT NULL CHECK (NULLIF(BTRIM(previous_status), '') IS NOT NULL),
  new_status text NOT NULL CHECK (NULLIF(BTRIM(new_status), '') IS NOT NULL),
  event_type text NOT NULL CHECK (event_type = 'request_status_updated'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_request_audit_status_changed CHECK (previous_status <> new_status)
);

CREATE INDEX idx_marketplace_request_audit_logs_request_created
  ON public.marketplace_request_audit_logs (request_id, created_at DESC);

CREATE INDEX idx_marketplace_request_audit_logs_created
  ON public.marketplace_request_audit_logs (created_at DESC);

ALTER TABLE public.marketplace_request_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_request_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.marketplace_request_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.reject_marketplace_request_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'DIR120_REQUEST_AUDIT_APPEND_ONLY';
END;
$$;

CREATE TRIGGER marketplace_request_audit_reject_update_delete
BEFORE UPDATE OR DELETE ON public.marketplace_request_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.reject_marketplace_request_audit_mutation();

CREATE TRIGGER marketplace_request_audit_reject_truncate
BEFORE TRUNCATE ON public.marketplace_request_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_marketplace_request_audit_mutation();

REVOKE ALL ON FUNCTION public.reject_marketplace_request_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transition_marketplace_request(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id uuid,
  p_confirmation_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS public.marketplace_requests
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_request public.marketplace_requests%ROWTYPE;
  updated_request public.marketplace_requests%ROWTYPE;
  actor_role_value text;
  next_action_value text;
  authoritative_evidence jsonb := '{}'::jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_INVALID_TRANSITION_INPUT';
  END IF;

  SELECT CASE WHEN LOWER(role) IN ('admin', 'super_admin') THEN 'admin' ELSE LOWER(role) END
  INTO actor_role_value
  FROM public.profiles
  WHERE id = p_actor_id
    AND LOWER(role) IN ('admin', 'super_admin')
    AND status = 'active'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIR120_ACTOR_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO current_request
  FROM public.marketplace_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DIR120_REQUEST_NOT_FOUND';
  END IF;

  IF current_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  IF current_request.status = p_new_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_NOOP_TRANSITION';
  END IF;

  IF NOT (
    (current_request.status = 'request_submitted' AND p_new_status IN ('under_review', 'declined', 'cancelled')) OR
    (current_request.status = 'under_review' AND p_new_status IN ('awaiting_supplier', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_supplier' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'awaiting_availability' AND p_new_status IN ('confirmed', 'declined', 'cancelled')) OR
    (current_request.status = 'payment_verification' AND p_new_status IN ('confirmed', 'declined', 'cancelled'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_TRANSITION_NOT_ALLOWED';
  END IF;

  IF p_new_status = 'confirmed' THEN
    IF COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type) = 'request_quote'
      AND current_request.status <> 'payment_verification'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_NOT_ACCEPTED_FOR_CONFIRMATION';
    END IF;

    authoritative_evidence := public.resolve_marketplace_request_confirmation_evidence(
      current_request.id,
      p_confirmation_evidence
    );
  END IF;

  next_action_value := CASE p_new_status
    WHEN 'under_review' THEN 'assign_owner'
    WHEN 'awaiting_supplier' THEN 'contact_supplier'
    WHEN 'confirmed' THEN 'notify_customer'
    WHEN 'declined' THEN 'notify_customer'
    WHEN 'cancelled' THEN 'none'
    ELSE NULL
  END;

  UPDATE public.marketplace_requests
  SET status = p_new_status,
      next_action = next_action_value,
      confirmation_evidence = CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE confirmation_evidence END,
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = p_expected_status
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  INSERT INTO public.marketplace_request_audit_logs (
    request_id,
    actor_user_id,
    actor_identity,
    actor_role,
    actor_source,
    previous_status,
    new_status,
    event_type,
    metadata
  ) VALUES (
    current_request.id,
    p_actor_id,
    p_actor_id::text,
    actor_role_value,
    'admin_operations_rpc',
    current_request.status,
    p_new_status,
    'request_status_updated',
    jsonb_build_object(
      'request_reference', current_request.request_reference,
      'transaction_method', COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type),
      'next_action', next_action_value,
      'confirmation_evidence', CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE '{}'::jsonb END
    )
  );

  RETURN updated_request;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb)
  TO service_role;

-- Re-run the legacy confirmation guard after installing the corrected final
-- transition function. No pre-existing confirmed request is grandfathered.
DO $$
BEGIN
  PERFORM public.assert_marketplace_request_confirmation_integrity();
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'DIR120_LEGACY_CONFIRMED_REQUIRES_RECONCILIATION',
    DETAIL = SQLERRM;
END;
$$;
