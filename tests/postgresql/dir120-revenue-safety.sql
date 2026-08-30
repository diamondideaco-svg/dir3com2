\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.marketplace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_reference text NOT NULL UNIQUE,
  request_type text NOT NULL, status text NOT NULL,
  payment_status text NOT NULL DEFAULT 'awaiting_payment', quote_amount numeric(12,2),
  quote_currency text, quote_expires_at timestamptz, next_action text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL,
  entity_id text NOT NULL, action text NOT NULL, old_values jsonb DEFAULT '{}'::jsonb,
  new_values jsonb DEFAULT '{}'::jsonb, performed_by text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

\i /tmp/dir120-revenue-request-transition-safety.sql

DO $$
DECLARE request_id uuid := gen_random_uuid(); actor_id uuid := gen_random_uuid(); result public.marketplace_requests;
BEGIN
  INSERT INTO public.marketplace_requests (id, request_reference, request_type, status, payment_status)
  VALUES (request_id, 'REQ-DIR120-SUCCESS', 'request_to_confirm', 'awaiting_supplier', 'payment_verified');
  result := public.transition_marketplace_request(request_id, 'awaiting_supplier', 'confirmed', actor_id,
    '{"confirmation_source":"supplier","confirmation_reference":"SUP-1","payment_reference":"PAY-1"}'::jsonb);
  IF result.status <> 'confirmed' OR result.next_action <> 'notify_customer' THEN
    RAISE EXCEPTION 'successful transition did not derive expected state';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id = request_id::text) <> 1 THEN
    RAISE EXCEPTION 'successful transition did not write exactly one audit';
  END IF;
END $$;

DO $$
DECLARE request_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.marketplace_requests (id, request_reference, request_type, status)
  VALUES (request_id, 'REQ-DIR120-STALE', 'request_to_confirm', 'under_review');
  BEGIN
    PERFORM public.transition_marketplace_request(request_id, 'request_submitted', 'awaiting_supplier', gen_random_uuid(), '{}'::jsonb);
    RAISE EXCEPTION 'stale transition unexpectedly succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  IF (SELECT status FROM public.marketplace_requests WHERE id = request_id) <> 'under_review'
    OR EXISTS (SELECT 1 FROM public.audit_logs WHERE entity_id = request_id::text) THEN
    RAISE EXCEPTION 'stale transition changed durable state';
  END IF;
END $$;

DO $$
DECLARE request_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.marketplace_requests (id, request_reference, request_type, status, payment_status)
  VALUES (request_id, 'REQ-DIR120-EVIDENCE', 'request_to_confirm', 'awaiting_supplier', 'payment_verified');
  BEGIN
    PERFORM public.transition_marketplace_request(
      request_id, 'awaiting_supplier', 'confirmed', gen_random_uuid(),
      '{"confirmation_reference":"SUP-OMITTED-SOURCE","payment_reference":"PAY-OMITTED-SOURCE"}'::jsonb
    );
    RAISE EXCEPTION 'confirmation without evidence unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT status FROM public.marketplace_requests WHERE id = request_id) <> 'awaiting_supplier' THEN
    RAISE EXCEPTION 'failed confirmation mutated request';
  END IF;
END $$;

CREATE FUNCTION public.reject_dir120_audit() RETURNS trigger LANGUAGE plpgsql
AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$;
CREATE TRIGGER reject_dir120_audit BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.reject_dir120_audit();

DO $$
DECLARE request_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.marketplace_requests (id, request_reference, request_type, status)
  VALUES (request_id, 'REQ-DIR120-ROLLBACK', 'request_to_confirm', 'request_submitted');
  BEGIN
    PERFORM public.transition_marketplace_request(request_id, 'request_submitted', 'under_review', gen_random_uuid(), '{}'::jsonb);
    RAISE EXCEPTION 'transition with rejected audit unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF (SELECT status FROM public.marketplace_requests WHERE id = request_id) <> 'request_submitted' THEN
    RAISE EXCEPTION 'audit failure did not roll back request';
  END IF;
END $$;

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.transition_marketplace_request(uuid,text,text,uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.transition_marketplace_request(uuid,text,text,uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.transition_marketplace_request(uuid,text,text,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'transition function privileges are unsafe';
  END IF;
END $$;

SELECT 'DIR120_POSTGRESQL_PASS' AS result;
