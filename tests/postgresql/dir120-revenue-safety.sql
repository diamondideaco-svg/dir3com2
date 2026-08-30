CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt()->>'sub', '')::uuid
$$;

CREATE TABLE public.marketplace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  request_type text NOT NULL,
  transaction_method text,
  supplier_name text,
  status text NOT NULL,
  payment_status text NOT NULL DEFAULT 'awaiting_payment',
  quote_amount numeric(12,2),
  quote_currency text,
  quote_expires_at timestamptz,
  next_action text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_requests TO service_role;
GRANT SELECT ON TABLE public.profiles TO service_role;

-- Replaced by scripts/run-dir120-postgresql.mjs with the exact repository migrations.
-- DIR120_BASE_MIGRATION_INCLUDE
-- DIR120_CORRECTIVE_MIGRATION_INCLUDE

DO $$
BEGIN
  IF to_regclass('public.marketplace_request_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'DIR120 canonical request audit table is missing';
  END IF;
END $$;

INSERT INTO public.profiles (id, role)
VALUES ('12000000-0000-4000-8000-000000000001', 'admin');

CREATE TEMP TABLE dir120_case_results (case_number integer PRIMARY KEY, case_name text NOT NULL);
GRANT ALL ON TABLE dir120_case_results TO service_role;

CREATE OR REPLACE FUNCTION public.dir120_actor_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '12000000-0000-4000-8000-000000000001'::uuid $$;

CREATE OR REPLACE FUNCTION public.dir120_seed_request(
  p_label text,
  p_method text DEFAULT 'request_to_confirm',
  p_status text DEFAULT 'awaiting_supplier',
  p_user_id uuid DEFAULT gen_random_uuid(),
  p_product_id uuid DEFAULT gen_random_uuid(),
  p_supplier text DEFAULT 'DIR120 Supplier'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE new_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.marketplace_requests (
    id, request_reference, user_id, product_id, request_type, transaction_method,
    supplier_name, status, payment_status, quote_amount, quote_currency, quote_expires_at
  ) VALUES (
    new_id,
    'REQ-' || p_label,
    p_user_id,
    p_product_id,
    CASE WHEN p_method = 'request_quote' THEN 'request_quote' ELSE 'request_to_confirm' END,
    p_method,
    p_supplier,
    p_status,
    'payment_verified',
    CASE WHEN p_method = 'request_quote' THEN 750 ELSE 500 END,
    'SAR',
    CASE WHEN p_method = 'request_quote' THEN NOW() + INTERVAL '1 day' ELSE NULL END
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dir120_seed_valid_evidence(
  p_request_id uuid,
  p_include_quote boolean DEFAULT false,
  p_source text DEFAULT 'supplier'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  request_row public.marketplace_requests%ROWTYPE;
  supplier_ref text;
  payment_ref text;
  quote_ref text;
BEGIN
  SELECT * INTO STRICT request_row FROM public.marketplace_requests WHERE id = p_request_id;
  supplier_ref := 'SUP-' || request_row.request_reference;
  payment_ref := 'PAY-' || request_row.request_reference;
  quote_ref := 'QUOTE-' || request_row.request_reference;

  INSERT INTO public.marketplace_request_evidence (
    request_id, user_id, product_id, supplier_context, evidence_type,
    source_type, evidence_reference, status, amount, currency, accepted_at, expires_at
  ) VALUES
    (request_row.id, request_row.user_id, request_row.product_id, request_row.supplier_name,
      'supplier_confirmation', p_source, supplier_ref, 'confirmed', NULL, NULL, NOW(), NULL),
    (request_row.id, request_row.user_id, request_row.product_id, request_row.supplier_name,
      'payment', 'payment_processor', payment_ref, 'verified',
      COALESCE(request_row.quote_amount, 500), COALESCE(request_row.quote_currency, 'SAR'), NOW(), NULL);

  IF p_include_quote THEN
    INSERT INTO public.marketplace_request_evidence (
      request_id, user_id, product_id, supplier_context, evidence_type,
      source_type, evidence_reference, status, amount, currency, accepted_at, expires_at
    ) VALUES (
      request_row.id, request_row.user_id, request_row.product_id, request_row.supplier_name,
      'quote', 'operations', quote_ref, 'accepted', request_row.quote_amount,
      request_row.quote_currency, NOW(), request_row.quote_expires_at
    );
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'confirmation_source', p_source,
    'confirmation_reference', supplier_ref,
    'payment_reference', payment_ref,
    'quote_reference', CASE WHEN p_include_quote THEN quote_ref END
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.dir120_transition_denied(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_evidence jsonb,
  p_expected_error text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.transition_marketplace_request(
    p_request_id, p_expected_status, p_new_status, p_evidence
  );
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN POSITION(p_expected_error IN SQLERRM) > 0;
END;
$$;

SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- 1. Valid authoritative evidence permits request-to-confirm confirmation.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('01-VALID'); evidence jsonb; result public.marketplace_requests;
BEGIN
  evidence := public.dir120_seed_valid_evidence(request_id);
  result := public.transition_marketplace_request(request_id, 'awaiting_supplier', 'confirmed', evidence);
  IF result.status <> 'confirmed'
    OR result.confirmation_evidence->>'validation' <> 'authoritative_request_bound_v1' THEN
    RAISE EXCEPTION 'case 1 failed';
  END IF;
  INSERT INTO dir120_case_results VALUES (1, 'valid authoritative evidence');
END $$;

-- 2. Arbitrary supplier reference is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('02-SUP'); evidence jsonb;
BEGIN
  evidence := jsonb_set(public.dir120_seed_valid_evidence(request_id), '{confirmation_reference}', '"SUP-ARBITRARY"');
  IF NOT public.dir120_transition_denied(request_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 2 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (2, 'arbitrary supplier reference denied');
END $$;

-- 3. Arbitrary payment reference is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('03-PAY'); evidence jsonb;
BEGIN
  evidence := jsonb_set(public.dir120_seed_valid_evidence(request_id), '{payment_reference}', '"PAY-ARBITRARY"');
  IF NOT public.dir120_transition_denied(request_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 3 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (3, 'arbitrary payment reference denied');
END $$;

-- 4. Arbitrary quote reference is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('04-QUOTE', 'request_quote', 'payment_verification'); evidence jsonb;
BEGIN
  evidence := jsonb_set(public.dir120_seed_valid_evidence(request_id, true), '{quote_reference}', '"QUOTE-ARBITRARY"');
  IF NOT public.dir120_transition_denied(request_id, 'payment_verification', 'confirmed', evidence, 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 4 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (4, 'arbitrary quote reference denied');
END $$;

-- 5. Missing authoritative evidence is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('05-MISSING');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'awaiting_supplier', 'confirmed', '{}'::jsonb, 'DIR120_CONFIRMATION_EVIDENCE_REQUIRED') THEN RAISE EXCEPTION 'case 5 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (5, 'missing evidence denied');
END $$;

-- 6. Evidence belonging to another request is denied.
DO $$
DECLARE source_id uuid := public.dir120_seed_request('06-SOURCE'); target_id uuid := public.dir120_seed_request('06-TARGET'); evidence jsonb;
BEGIN
  evidence := public.dir120_seed_valid_evidence(source_id);
  IF NOT public.dir120_transition_denied(target_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 6 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (6, 'cross-request evidence denied');
END $$;

-- 7. Evidence belonging to another customer/tenant is denied.
DO $$
DECLARE target_id uuid := public.dir120_seed_request('07-TENANT'); evidence jsonb;
BEGIN
  evidence := public.dir120_seed_valid_evidence(target_id);
  UPDATE public.marketplace_request_evidence AS e SET user_id = gen_random_uuid() WHERE e.request_id = target_id;
  IF NOT public.dir120_transition_denied(target_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 7 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (7, 'cross-tenant evidence denied');
END $$;

-- 8. Wrong supplier/product context is denied.
DO $$
DECLARE target_id uuid := public.dir120_seed_request('08-SUPPLIER'); evidence jsonb;
BEGIN
  evidence := public.dir120_seed_valid_evidence(target_id);
  UPDATE public.marketplace_request_evidence AS e SET supplier_context = 'Wrong Supplier' WHERE e.request_id = target_id;
  IF NOT public.dir120_transition_denied(target_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 8 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (8, 'wrong supplier evidence denied');
END $$;

-- 9. Failed/cancelled evidence is denied.
DO $$
DECLARE
  cancelled_id uuid := public.dir120_seed_request('09-CANCELLED');
  failed_id uuid := public.dir120_seed_request('09-FAILED');
  expired_id uuid := public.dir120_seed_request('09-EXPIRED', 'request_quote', 'payment_verification');
  wrong_source_id uuid := public.dir120_seed_request('09-PAY-SOURCE');
  stale_payment_id uuid := public.dir120_seed_request('09-PAY-STALE');
  wrong_value_id uuid := public.dir120_seed_request('09-PAY-VALUE');
  null_evidence_expiry_id uuid := public.dir120_seed_request('09-QUOTE-EVIDENCE-NULL', 'request_quote', 'payment_verification');
  null_request_expiry_id uuid := public.dir120_seed_request('09-QUOTE-REQUEST-NULL', 'request_quote', 'payment_verification');
  wrong_quote_source_id uuid := public.dir120_seed_request('09-QUOTE-SOURCE', 'request_quote', 'payment_verification');
  null_expiry_rejected boolean := false;
  evidence jsonb;
BEGIN
  evidence := public.dir120_seed_valid_evidence(cancelled_id);
  UPDATE public.marketplace_request_evidence AS e SET status = 'cancelled' WHERE e.request_id = cancelled_id AND e.evidence_type = 'supplier_confirmation';
  IF NOT public.dir120_transition_denied(cancelled_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_SUPPLIER_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 cancelled supplier failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(failed_id);
  UPDATE public.marketplace_request_evidence AS e SET status = 'failed' WHERE e.request_id = failed_id AND e.evidence_type = 'payment';
  IF NOT public.dir120_transition_denied(failed_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 failed payment failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(expired_id, true);
  UPDATE public.marketplace_request_evidence AS e SET status = 'expired' WHERE e.request_id = expired_id AND e.evidence_type = 'quote';
  IF NOT public.dir120_transition_denied(expired_id, 'payment_verification', 'confirmed', evidence, 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 expired quote failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(wrong_source_id);
  UPDATE public.marketplace_request_evidence AS e SET source_type = 'operations' WHERE e.request_id = wrong_source_id AND e.evidence_type = 'payment';
  IF NOT public.dir120_transition_denied(wrong_source_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 wrong payment source failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(stale_payment_id);
  UPDATE public.marketplace_requests SET payment_status = 'payment_rejected' WHERE id = stale_payment_id;
  IF NOT public.dir120_transition_denied(stale_payment_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 stale request payment failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(wrong_value_id);
  UPDATE public.marketplace_request_evidence AS e SET amount = amount - 1, currency = 'USD' WHERE e.request_id = wrong_value_id AND e.evidence_type = 'payment';
  IF NOT public.dir120_transition_denied(wrong_value_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_PAYMENT_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 wrong payment value failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(null_evidence_expiry_id, true);
  BEGIN
    UPDATE public.marketplace_request_evidence AS e SET expires_at = NULL WHERE e.request_id = null_evidence_expiry_id AND e.evidence_type = 'quote';
  EXCEPTION WHEN check_violation THEN
    null_expiry_rejected := true;
  END;
  IF NOT null_expiry_rejected THEN RAISE EXCEPTION 'case 9 null evidence expiry was accepted'; END IF;

  evidence := public.dir120_seed_valid_evidence(null_request_expiry_id, true);
  UPDATE public.marketplace_requests SET quote_expires_at = NULL WHERE id = null_request_expiry_id;
  IF NOT public.dir120_transition_denied(null_request_expiry_id, 'payment_verification', 'confirmed', evidence, 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 null request expiry failed'; END IF;

  evidence := public.dir120_seed_valid_evidence(wrong_quote_source_id, true);
  UPDATE public.marketplace_request_evidence AS e SET source_type = 'payment_processor' WHERE e.request_id = wrong_quote_source_id AND e.evidence_type = 'quote';
  IF NOT public.dir120_transition_denied(wrong_quote_source_id, 'payment_verification', 'confirmed', evidence, 'DIR120_QUOTE_EVIDENCE_NOT_AUTHORITATIVE') THEN RAISE EXCEPTION 'case 9 wrong quote source failed'; END IF;
  INSERT INTO dir120_case_results VALUES (9, 'invalid evidence denied');
END $$;

-- 10. Status update and audit commit atomically on a valid non-confirming edge.
DO $$
DECLARE
  target_request_id uuid := public.dir120_seed_request('10-ATOMIC', 'request_to_confirm', 'request_submitted');
  result public.marketplace_requests;
  audit_row public.marketplace_request_audit_logs%ROWTYPE;
BEGIN
  result := public.transition_marketplace_request(
    target_request_id,
    'request_submitted',
    'under_review',
    '{}'::jsonb
  );
  SELECT * INTO STRICT audit_row
  FROM public.marketplace_request_audit_logs AS audit
  WHERE audit.request_id = target_request_id;

  IF result.status <> 'under_review'
    OR (SELECT count(*) FROM public.marketplace_request_audit_logs a WHERE a.request_id = target_request_id) <> 1
    OR audit_row.request_id <> target_request_id
    OR audit_row.actor_user_id IS NOT NULL
    OR audit_row.actor_identity <> 'system:service_role'
    OR audit_row.actor_role <> 'service_role'
    OR audit_row.actor_source <> 'system_service'
    OR audit_row.previous_status <> 'request_submitted'
    OR audit_row.new_status <> 'under_review'
    OR audit_row.event_type <> 'request_status_updated'
    OR audit_row.metadata->>'request_reference' <> 'REQ-10-ATOMIC'
    OR audit_row.metadata->>'next_action' <> 'assign_owner'
  THEN
    RAISE EXCEPTION 'case 10 failed';
  END IF;
  INSERT INTO dir120_case_results VALUES (10, 'atomic status and audit success');
END $$;

-- 11. Forced audit failure rolls the status update back.
RESET ROLE;
CREATE FUNCTION public.reject_dir120_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'DIR120_FORCED_AUDIT_FAILURE'; END $$;
CREATE TRIGGER reject_dir120_audit BEFORE INSERT ON public.marketplace_request_audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_dir120_audit();
SET ROLE service_role;
DO $$
DECLARE request_id uuid := public.dir120_seed_request('11-ROLLBACK', 'request_to_confirm', 'request_submitted');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'request_submitted', 'under_review', '{}'::jsonb, 'DIR120_FORCED_AUDIT_FAILURE') THEN RAISE EXCEPTION 'case 11 failed to reject'; END IF;
  IF (SELECT status FROM public.marketplace_requests WHERE id = request_id) <> 'request_submitted' THEN RAISE EXCEPTION 'case 11 failed to roll back'; END IF;
  INSERT INTO dir120_case_results VALUES (11, 'audit failure rollback');
END $$;
RESET ROLE;
DROP TRIGGER reject_dir120_audit ON public.marketplace_request_audit_logs;
DROP FUNCTION public.reject_dir120_audit();
SET ROLE service_role;

-- 12. Stale expected state is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('12-STALE', 'request_to_confirm', 'under_review');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'request_submitted', 'awaiting_supplier', '{}'::jsonb, 'DIR120_STALE_REQUEST_STATE') THEN RAISE EXCEPTION 'case 12 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (12, 'stale transition denied');
END $$;

-- 13. No-op transition is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('13-NOOP', 'request_to_confirm', 'under_review');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'under_review', 'under_review', '{}'::jsonb, 'DIR120_NOOP_TRANSITION') THEN RAISE EXCEPTION 'case 13 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (13, 'no-op denied');
END $$;

-- 14. Forbidden lifecycle edge is denied.
DO $$
DECLARE
  request_id uuid := public.dir120_seed_request('14-FORBIDDEN', 'request_to_confirm', 'request_submitted');
  instant_id uuid := public.dir120_seed_request('14-INSTANT', 'instant_booking', 'awaiting_supplier');
  evidence jsonb;
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'request_submitted', 'confirmed', '{}'::jsonb, 'DIR120_TRANSITION_NOT_ALLOWED') THEN RAISE EXCEPTION 'case 14 failed'; END IF;
  evidence := public.dir120_seed_valid_evidence(instant_id);
  IF NOT public.dir120_transition_denied(instant_id, 'awaiting_supplier', 'confirmed', evidence, 'DIR120_CANONICAL_EVIDENCE_UNAVAILABLE') THEN RAISE EXCEPTION 'case 14 instant-booking fail-closed failed'; END IF;
  INSERT INTO dir120_case_results VALUES (14, 'forbidden transition denied');
END $$;

-- 15. Confirmed is terminal.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('15-CONFIRMED', 'request_to_confirm', 'confirmed');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'confirmed', 'under_review', '{}'::jsonb, 'DIR120_TRANSITION_NOT_ALLOWED') THEN RAISE EXCEPTION 'case 15 failed'; END IF;
  DELETE FROM public.marketplace_requests WHERE id = request_id;
  INSERT INTO dir120_case_results VALUES (15, 'confirmed terminal protected');
END $$;

-- 16. Declined is terminal.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('16-DECLINED', 'request_to_confirm', 'declined');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'declined', 'under_review', '{}'::jsonb, 'DIR120_TRANSITION_NOT_ALLOWED') THEN RAISE EXCEPTION 'case 16 failed'; END IF;
  DELETE FROM public.marketplace_requests WHERE id = request_id;
  INSERT INTO dir120_case_results VALUES (16, 'declined terminal protected');
END $$;

-- 17. Cancelled is terminal.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('17-CANCELLED', 'request_to_confirm', 'cancelled');
BEGIN
  IF NOT public.dir120_transition_denied(request_id, 'cancelled', 'under_review', '{}'::jsonb, 'DIR120_TRANSITION_NOT_ALLOWED') THEN RAISE EXCEPTION 'case 17 failed'; END IF;
  DELETE FROM public.marketplace_requests WHERE id = request_id;
  INSERT INTO dir120_case_results VALUES (17, 'cancelled terminal protected');
END $$;

-- 18. Accepted, unexpired, amount-matched quote evidence permits confirmation.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('18-QUOTE', 'request_quote', 'payment_verification'); evidence jsonb; result public.marketplace_requests;
BEGIN
  evidence := public.dir120_seed_valid_evidence(request_id, true);
  result := public.transition_marketplace_request(request_id, 'payment_verification', 'confirmed', evidence);
  IF result.status <> 'confirmed' OR result.confirmation_evidence->>'quote_evidence_id' IS NULL THEN RAISE EXCEPTION 'case 18 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (18, 'valid quote evidence');
END $$;

-- 19. Quote-required path without quote evidence is denied.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('19-NO-QUOTE', 'request_quote', 'payment_verification'); evidence jsonb;
BEGIN
  evidence := public.dir120_seed_valid_evidence(request_id, false);
  IF NOT public.dir120_transition_denied(request_id, 'payment_verification', 'confirmed', evidence, 'DIR120_QUOTE_EVIDENCE_REQUIRED') THEN RAISE EXCEPTION 'case 19 failed'; END IF;
  INSERT INTO dir120_case_results VALUES (19, 'missing quote evidence denied');
END $$;

-- 20. Legacy confirmed rows are rejected; clean authoritative rows pass the guard.
DO $$
DECLARE request_id uuid := public.dir120_seed_request('20-LEGACY', 'request_to_confirm', 'confirmed'); rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.assert_marketplace_request_confirmation_integrity();
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'case 20 failed to reject legacy row'; END IF;
  DELETE FROM public.marketplace_requests WHERE id = request_id;
  PERFORM public.assert_marketplace_request_confirmation_integrity();
  INSERT INTO dir120_case_results VALUES (20, 'legacy reconciliation guard');
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.transition_marketplace_request(uuid,text,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.transition_marketplace_request(uuid,text,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.transition_marketplace_request(uuid,text,text,jsonb)', 'EXECUTE')
    OR to_regprocedure('public.transition_marketplace_request(uuid,text,text,uuid,jsonb)') IS NOT NULL
    OR has_table_privilege('anon', 'public.marketplace_request_evidence', 'SELECT')
    OR has_table_privilege('authenticated', 'public.marketplace_request_evidence', 'SELECT')
    OR has_table_privilege('anon', 'public.marketplace_request_audit_logs', 'INSERT')
    OR has_table_privilege('authenticated', 'public.marketplace_request_audit_logs', 'INSERT')
    OR has_table_privilege('service_role', 'public.marketplace_request_audit_logs', 'UPDATE')
    OR has_table_privilege('service_role', 'public.marketplace_request_audit_logs', 'DELETE')
    OR has_table_privilege('service_role', 'public.marketplace_request_audit_logs', 'INSERT')
  THEN
    RAISE EXCEPTION 'DIR120 privilege boundary is unsafe';
  END IF;

  IF (SELECT count(*) FROM dir120_case_results) <> 20
    OR (SELECT min(case_number) FROM dir120_case_results) <> 1
    OR (SELECT max(case_number) FROM dir120_case_results) <> 20
  THEN
    RAISE EXCEPTION 'DIR120 did not execute exactly 20 cases';
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

SELECT 'DIR120_POSTGRESQL=PASS cases=20' AS result;
