-- DIR-120: atomic, evidence-backed marketplace request transitions.
ALTER TABLE public.marketplace_requests
  ADD COLUMN IF NOT EXISTS confirmation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.marketplace_requests
    WHERE status = 'confirmed'
      AND (
        COALESCE(confirmation_evidence->>'confirmation_source', '') NOT IN ('supplier', 'provider')
        OR NULLIF(BTRIM(confirmation_evidence->>'confirmation_reference'), '') IS NULL
        OR NULLIF(BTRIM(confirmation_evidence->>'payment_reference'), '') IS NULL
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DIR120_LEGACY_CONFIRMED_REQUIRES_RECONCILIATION';
  END IF;
END;
$$;

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
  next_action_value text;
  evidence jsonb := COALESCE(p_confirmation_evidence, '{}'::jsonb);
BEGIN
  IF p_actor_id IS NULL OR p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DIR120_INVALID_TRANSITION_INPUT';
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
    IF COALESCE(evidence->>'confirmation_source', '') NOT IN ('supplier', 'provider')
      OR NULLIF(BTRIM(evidence->>'confirmation_reference'), '') IS NULL
      OR NULLIF(BTRIM(evidence->>'payment_reference'), '') IS NULL
      OR current_request.payment_status <> 'payment_verified'
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_CONFIRMATION_EVIDENCE_REQUIRED';
    END IF;

    IF current_request.request_type = 'request_quote' AND (
      NULLIF(BTRIM(evidence->>'quote_reference'), '') IS NULL
      OR current_request.quote_amount IS NULL
      OR current_request.quote_amount <= 0
      OR NULLIF(BTRIM(current_request.quote_currency), '') IS NULL
      OR (current_request.quote_expires_at IS NOT NULL AND current_request.quote_expires_at <= NOW())
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_REQUIRED';
    END IF;
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
      confirmation_evidence = CASE WHEN p_new_status = 'confirmed' THEN evidence ELSE confirmation_evidence END,
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = p_expected_status
  RETURNING * INTO updated_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'DIR120_STALE_REQUEST_STATE';
  END IF;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    old_values,
    new_values,
    performed_by
  ) VALUES (
    'marketplace_requests',
    p_request_id::text,
    'request_status_updated',
    jsonb_build_object('status', current_request.status),
    jsonb_build_object(
      'status', p_new_status,
      'next_action', next_action_value,
      'confirmation_evidence', CASE WHEN p_new_status = 'confirmed' THEN evidence ELSE '{}'::jsonb END
    ),
    p_actor_id::text
  );

  RETURN updated_request;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb) TO service_role;
