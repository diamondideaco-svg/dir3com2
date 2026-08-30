-- DIR-120: atomic, authoritative-evidence-backed marketplace request transitions.
ALTER TABLE public.marketplace_requests
  ADD COLUMN IF NOT EXISTS confirmation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- No existing request-scoped supplier/payment/quote evidence source carries every
-- required tenant and transaction binding. This typed ledger is server-written,
-- request-scoped, and never populated by the transition RPC itself.
CREATE TABLE IF NOT EXISTS public.marketplace_request_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.marketplace_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  supplier_context text NOT NULL CHECK (NULLIF(BTRIM(supplier_context), '') IS NOT NULL),
  evidence_type text NOT NULL CHECK (evidence_type IN ('supplier_confirmation', 'payment', 'quote')),
  source_type text NOT NULL CHECK (source_type IN ('supplier', 'provider', 'payment_processor', 'operations')),
  evidence_reference text NOT NULL CHECK (NULLIF(BTRIM(evidence_reference), '') IS NOT NULL),
  status text NOT NULL CHECK (status IN ('confirmed', 'verified', 'captured', 'settled', 'accepted', 'cancelled', 'failed', 'rejected', 'expired')),
  amount numeric(12,2),
  currency text,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (evidence_type, evidence_reference),
  CHECK (
    (evidence_type = 'supplier_confirmation' AND status IN ('confirmed', 'cancelled', 'rejected')) OR
    (evidence_type = 'payment' AND status IN ('verified', 'captured', 'settled', 'failed', 'rejected')) OR
    (evidence_type = 'quote' AND status IN ('accepted', 'cancelled', 'rejected', 'expired'))
  ),
  CHECK (
    evidence_type <> 'quote' OR (
      amount IS NOT NULL AND amount > 0
      AND NULLIF(BTRIM(currency), '') IS NOT NULL
      AND accepted_at IS NOT NULL
      AND expires_at IS NOT NULL
    )
  ),
  CHECK (
    evidence_type <> 'payment' OR (
      amount IS NOT NULL AND amount > 0
      AND NULLIF(BTRIM(currency), '') IS NOT NULL
    )
  ),
  CHECK (
    evidence_type NOT IN ('supplier_confirmation', 'payment')
    OR accepted_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_marketplace_request_evidence_request
  ON public.marketplace_request_evidence (request_id, evidence_type, status);

ALTER TABLE public.marketplace_request_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_request_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_request_evidence TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_marketplace_request_confirmation_evidence(
  p_request_id uuid,
  p_confirmation_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_request public.marketplace_requests%ROWTYPE;
  supplied_evidence jsonb := COALESCE(p_confirmation_evidence, '{}'::jsonb);
  supplier_evidence public.marketplace_request_evidence%ROWTYPE;
  payment_evidence public.marketplace_request_evidence%ROWTYPE;
  quote_evidence public.marketplace_request_evidence%ROWTYPE;
  confirmation_source text := NULLIF(BTRIM(supplied_evidence->>'confirmation_source'), '');
  confirmation_reference text := NULLIF(BTRIM(supplied_evidence->>'confirmation_reference'), '');
  payment_reference text := NULLIF(BTRIM(supplied_evidence->>'payment_reference'), '');
  quote_reference text := NULLIF(BTRIM(supplied_evidence->>'quote_reference'), '');
  transaction_mode text;
BEGIN
  SELECT * INTO current_request
  FROM public.marketplace_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DIR120_REQUEST_NOT_FOUND';
  END IF;

  transaction_mode := COALESCE(NULLIF(current_request.transaction_method, ''), current_request.request_type);

  IF transaction_mode NOT IN ('request_to_confirm', 'request_quote') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_CANONICAL_EVIDENCE_UNAVAILABLE';
  END IF;

  IF current_request.user_id IS NULL
    OR current_request.product_id IS NULL
    OR NULLIF(BTRIM(current_request.supplier_name), '') IS NULL
    OR confirmation_source NOT IN ('supplier', 'provider')
    OR confirmation_reference IS NULL
    OR payment_reference IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_CONFIRMATION_EVIDENCE_REQUIRED';
  END IF;

  SELECT * INTO supplier_evidence
  FROM public.marketplace_request_evidence
  WHERE request_id = current_request.id
    AND user_id = current_request.user_id
    AND product_id = current_request.product_id
    AND supplier_context = current_request.supplier_name
    AND evidence_type = 'supplier_confirmation'
    AND source_type = confirmation_source
    AND evidence_reference = confirmation_reference
    AND status = 'confirmed'
    AND accepted_at IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE';
  END IF;

  SELECT * INTO payment_evidence
  FROM public.marketplace_request_evidence
  WHERE request_id = current_request.id
    AND user_id = current_request.user_id
    AND product_id = current_request.product_id
    AND supplier_context = current_request.supplier_name
    AND evidence_type = 'payment'
    AND source_type = 'payment_processor'
    AND evidence_reference = payment_reference
    AND status IN ('verified', 'captured', 'settled')
    AND accepted_at IS NOT NULL
    AND amount IS NOT NULL
    AND amount > 0
    AND NULLIF(BTRIM(currency), '') IS NOT NULL
    AND amount = current_request.quote_amount
    AND currency = current_request.quote_currency
  FOR SHARE;

  IF current_request.payment_status <> 'payment_verified'
    OR current_request.quote_amount IS NULL
    OR current_request.quote_amount <= 0
    OR NULLIF(BTRIM(current_request.quote_currency), '') IS NULL
    OR NOT FOUND
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE';
  END IF;

  IF transaction_mode = 'request_quote' THEN
    IF quote_reference IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_REQUIRED';
    END IF;

    SELECT * INTO quote_evidence
    FROM public.marketplace_request_evidence
    WHERE request_id = current_request.id
      AND user_id = current_request.user_id
      AND product_id = current_request.product_id
      AND supplier_context = current_request.supplier_name
      AND evidence_type = 'quote'
      AND source_type IN ('supplier', 'provider', 'operations')
      AND evidence_reference = quote_reference
      AND status = 'accepted'
      AND accepted_at IS NOT NULL
      AND amount = current_request.quote_amount
      AND currency = current_request.quote_currency
      AND expires_at IS NOT NULL
      AND expires_at > NOW()
      AND current_request.quote_expires_at IS NOT NULL
      AND current_request.quote_expires_at > NOW()
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE';
    END IF;

  ELSIF quote_reference IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DIR120_QUOTE_EVIDENCE_NOT_APPLICABLE';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'confirmation_source', supplier_evidence.source_type,
    'confirmation_reference', supplier_evidence.evidence_reference,
    'supplier_evidence_id', supplier_evidence.id,
    'payment_reference', payment_evidence.evidence_reference,
    'payment_evidence_id', payment_evidence.id,
    'quote_reference', CASE WHEN transaction_mode = 'request_quote' THEN quote_evidence.evidence_reference END,
    'quote_evidence_id', CASE WHEN transaction_mode = 'request_quote' THEN quote_evidence.id END,
    'validation', 'authoritative_request_bound_v1'
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_marketplace_request_confirmation_integrity()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  confirmed_request record;
BEGIN
  FOR confirmed_request IN
    SELECT id, confirmation_evidence
    FROM public.marketplace_requests
    WHERE status = 'confirmed'
  LOOP
    PERFORM public.resolve_marketplace_request_confirmation_evidence(
      confirmed_request.id,
      confirmed_request.confirmation_evidence
    );
  END LOOP;
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
  authoritative_evidence jsonb := '{}'::jsonb;
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
      'confirmation_evidence', CASE WHEN p_new_status = 'confirmed' THEN authoritative_evidence ELSE '{}'::jsonb END
    ),
    p_actor_id::text
  );

  RETURN updated_request;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_marketplace_request_confirmation_evidence(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_marketplace_request_confirmation_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_marketplace_request_confirmation_evidence(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_marketplace_request_confirmation_integrity() TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_request(uuid, text, text, uuid, jsonb) TO service_role;

-- Deployment guard: no existing confirmed request is silently grandfathered.
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
