-- Task217: qualification-only all-history provider-bound exception.
-- OpenAI/Anthropic: five; every other provider: four.
-- No change to ordinary-v2, daily limits, USD1/28, holds, cases, expiry or ACL/RLS.
-- Requires the exact reviewed pre-forward function bodies; never creates a missing helper.
BEGIN;
DO $task217_baseline$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'TASK217_POSTGRES_OWNER_REQUIRED'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure('private.reserve_dabra_qualification_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)')
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef
   AND p.prorettype='jsonb'::pg_catalog.regtype AND p.proconfig=ARRAY['search_path=""']
   AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='06a16dda6b616f4ed2a6129b84c99c5b08f503bc6f95caff459ec0c9505fb5c2'
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure('private.protect_dabra_qualification_insert()')
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef
   AND p.prorettype='trigger'::pg_catalog.regtype AND p.proconfig=ARRAY['search_path=""']
   AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='289d46a39b53639edce1c4c7aba216314f811f57ad10b0e62b09cdc645896cab'
   AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid=pg_catalog.to_regclass('private.dabra_dialogue_admissions')
   AND t.tgname='protect_dabra_qualification_insert' AND NOT t.tgisinternal AND t.tgenabled='O'
   AND t.tgfoid=pg_catalog.to_regprocedure('private.protect_dabra_qualification_insert()')
 ) THEN RAISE EXCEPTION 'TASK217_QUALIFICATION_PROVIDER_BOUND_BASELINE_MISMATCH'; END IF;
END $task217_baseline$;

CREATE OR REPLACE FUNCTION private.reserve_dabra_qualification_attempt(
 p_attempt_id uuid,p_request_id uuid,p_stage text,p_subject_hash text,p_grant_id uuid,p_proof jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_limits jsonb,p_day_start_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g private.dabra_dialogue_funding_grants;c private.dabra_dialogue_funding_control;
 v_proof jsonb;r jsonb;e jsonb;q jsonb;v_case jsonb;v_index bigint;prior jsonb;prior_index bigint;
 now_ms bigint;v_day bigint;holds numeric;calls bigint;provider_calls bigint;plan_count integer;
 total_calls bigint;user_calls bigint;users bigint;total_input bigint;total_output bigint;user_input bigint;user_output bigint;
BEGIN
 IF p_attempt_id IS NULL OR p_request_id IS NULL OR p_grant_id IS NULL OR p_subject_hash IS NULL
  OR p_stage IS DISTINCT FROM 'discover' OR p_input_tokens IS NULL OR p_output_tokens IS NULL OR p_cost_micros IS NULL
  OR NOT private.dabra_qualification_exact_keys(p_proof,
   ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation','measurementRequest','executionPricing'])
  OR NOT private.dabra_qualification_exact_keys(p_limits,
   ARRAY['uniqueUsers','requestsPerUser','requestsTotal','inputTokensPerUser','outputTokensPerUser','inputTokensTotal','outputTokensTotal'])
  OR EXISTS(SELECT 1 FROM jsonb_each(p_limits) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'number' OR x.value#>>'{}'!~'^[1-9][0-9]{0,8}$') THEN RETURN jsonb_build_object('decision','denied'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 v_day:=floor((now_ms+10800000)::numeric/86400000)::bigint*86400000-10800000;
 SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND OR NOT c.enabled OR p_day_start_ms IS DISTINCT FROM v_day OR p_limits IS DISTINCT FROM c.daily_limits
  OR p_cost_micros NOT BETWEEN 1 AND 1000000 OR p_cost_micros>c.max_attempt_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (p_limits->>'uniqueUsers')::integer NOT BETWEEN 1 AND 20 OR (p_limits->>'requestsPerUser')::integer NOT BETWEEN 1 AND 6
  OR (p_limits->>'requestsTotal')::integer NOT BETWEEN 1 AND 60 OR (p_limits->>'inputTokensPerUser')::integer NOT BETWEEN 1 AND 24576
  OR (p_limits->>'outputTokensPerUser')::integer NOT BETWEEN 1 AND 6144 OR (p_limits->>'inputTokensTotal')::integer NOT BETWEEN 1 AND 245760
  OR (p_limits->>'outputTokensTotal')::integer NOT BETWEEN 1 AND 61440 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=p_grant_id FOR UPDATE;
 v_proof:=p_proof-ARRAY['measurementRequest','executionPricing'];r:=p_proof->'measurementRequest';e:=p_proof->'executionPricing';
 IF NOT FOUND OR NOT g.enabled OR v_proof IS DISTINCT FROM g.proof
  OR private.valid_dabra_qualification_execution(g,p_attempt_id,p_request_id,p_subject_hash,p_stage,p_input_tokens,p_output_tokens,p_cost_micros,e,now_ms) IS NOT TRUE
  OR NOT private.dabra_qualification_exact_keys(r,ARRAY['planId','caseId','runId'])
  OR r->>'planId' IS DISTINCT FROM e->>'planId' OR r->>'caseId' IS DISTINCT FROM e->>'caseId' OR r->>'runId' IS DISTINCT FROM e->>'runId' THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 q:=g.proof->'limitedOperation'->'permit';plan_count:=jsonb_array_length(q->'cases');
 SELECT value,ord-1 INTO v_case,v_index FROM jsonb_array_elements(q->'cases') WITH ORDINALITY x(value,ord) WHERE value->>'caseId'=r->>'caseId';
 IF NOT FOUND OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE attempt_id=p_attempt_id OR (request_id=p_request_id AND stage=p_stage)
   OR (execution_pricing->>'schema'='task217-qualification-execution-v1' AND execution_pricing->>'qualificationKey'=e->>'qualificationKey')) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF v_index=0 THEN
  IF p_attempt_id::text IS DISTINCT FROM r->>'runId' OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id) THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND request_id=(q->'cases'->0->>'requestId')::uuid
    AND attempt_id=(r->>'runId')::uuid AND execution_pricing->>'runId'=r->>'runId') THEN RETURN jsonb_build_object('decision','denied'); END IF;
  FOR prior,prior_index IN SELECT value,ord-1 FROM jsonb_array_elements(q->'cases') WITH ORDINALITY x(value,ord) WHERE ord-1<v_index LOOP
   IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND request_id=(prior->>'requestId')::uuid
     AND execution_pricing->>'caseId'=prior->>'caseId' AND execution_pricing->>'runId'=r->>'runId') THEN RETURN jsonb_build_object('decision','denied'); END IF;
  END LOOP;
 END IF;
 SELECT coalesce(sum(greatest(pg.reserved_credit_micros,coalesce(a.cost,0))),0) INTO holds
 FROM private.dabra_dialogue_funding_grants pg LEFT JOIN LATERAL
  (SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=pg.id) a ON true;
 SELECT count(*) INTO calls FROM private.dabra_dialogue_admissions;
 SELECT count(*) INTO provider_calls FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id WHERE pg.provider=g.provider;
 -- Do not start an incomplete language profile when its complete selected case
 -- group already cannot fit the remaining original envelope/provider bound.
 IF holds+p_cost_micros>1000000 OR calls+1>28 OR provider_calls+1>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END)
  OR (v_index=0 AND (holds+p_cost_micros::numeric*plan_count>1000000 OR calls+plan_count>28 OR provider_calls+plan_count>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END))) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT count(*),count(DISTINCT subject_hash),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0),
  count(*) FILTER(WHERE subject_hash=p_subject_hash),coalesce(sum(input_tokens) FILTER(WHERE subject_hash=p_subject_hash),0),coalesce(sum(output_tokens) FILTER(WHERE subject_hash=p_subject_hash),0)
 INTO total_calls,users,total_input,total_output,user_calls,user_input,user_output FROM private.dabra_dialogue_admissions WHERE day_start_ms=v_day;
 IF total_calls+1>(p_limits->>'requestsTotal')::integer OR user_calls+1>(p_limits->>'requestsPerUser')::integer
  OR (user_calls=0 AND users+1>(p_limits->>'uniqueUsers')::integer)
  OR total_input+p_input_tokens>(p_limits->>'inputTokensTotal')::integer OR total_output+p_output_tokens>(p_limits->>'outputTokensTotal')::integer
  OR user_input+p_input_tokens>(p_limits->>'inputTokensPerUser')::integer OR user_output+p_output_tokens>(p_limits->>'outputTokensPerUser')::integer THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+p_cost_micros WHERE id=g.id;
 INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros,execution_pricing)
 VALUES(p_attempt_id,p_request_id,p_stage,p_subject_hash,g.id,v_day,(q->>'authorizedAtMs')::bigint,(q->>'expiresAtMs')::bigint,p_input_tokens,p_output_tokens,p_cost_micros,e);
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,
  'pricing_expires_at_ms',least((e->'observation'->>'expiresAtMs')::bigint,(q->>'expiresAtMs')::bigint));
END $$;

CREATE OR REPLACE FUNCTION private.protect_dabra_qualification_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g private.dabra_dialogue_funding_grants;e jsonb;q jsonb;idx bigint;item jsonb;prior jsonb;prior_idx bigint;
 now_ms bigint;holds numeric;calls bigint;provider_calls bigint;
BEGIN
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=NEW.grant_id;
 IF NOT FOUND OR g.funding_mode<>'bounded-account-qualification' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;e:=NEW.execution_pricing;q:=g.proof->'limitedOperation'->'permit';
 IF NOT g.enabled OR private.valid_dabra_qualification_execution(g,NEW.attempt_id,NEW.request_id,NEW.subject_hash,NEW.stage,NEW.input_tokens,NEW.output_tokens,NEW.cost_micros,e,now_ms) IS NOT TRUE
  OR NEW.day_start_ms IS DISTINCT FROM floor((now_ms+10800000)::numeric/86400000)::bigint*86400000-10800000
  OR NEW.quota_start_ms IS DISTINCT FROM (q->>'authorizedAtMs')::bigint OR NEW.quota_end_ms IS DISTINCT FROM (q->>'expiresAtMs')::bigint THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_EXECUTION_INVALID'; END IF;
 SELECT value,ord-1 INTO item,idx FROM jsonb_array_elements(q->'cases') WITH ORDINALITY x(value,ord) WHERE value->>'caseId'=e->>'caseId';
 IF NOT FOUND OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=NEW.request_id AND stage=NEW.stage) THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_REPLAY'; END IF;
 IF idx=0 THEN
  IF NEW.attempt_id::text IS DISTINCT FROM e->>'runId' OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id) THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_RUN_INVALID'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND request_id=(q->'cases'->0->>'requestId')::uuid
    AND attempt_id=(e->>'runId')::uuid AND execution_pricing->>'runId'=e->>'runId') THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_RUN_INVALID'; END IF;
  FOR prior,prior_idx IN SELECT value,ord-1 FROM jsonb_array_elements(q->'cases') WITH ORDINALITY x(value,ord) WHERE ord-1<idx LOOP
   IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND request_id=(prior->>'requestId')::uuid
     AND execution_pricing->>'caseId'=prior->>'caseId' AND execution_pricing->>'runId'=e->>'runId') THEN
    RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ORDER_INVALID'; END IF;
  END LOOP;
 END IF;
 IF g.reserved_credit_micros<(SELECT coalesce(sum(cost_micros),0)+NEW.cost_micros FROM private.dabra_dialogue_admissions WHERE grant_id=g.id) THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_HOLD_REQUIRED'; END IF;
 SELECT coalesce(sum(greatest(pg.reserved_credit_micros,coalesce(a.cost,0))),0) INTO holds FROM private.dabra_dialogue_funding_grants pg
 LEFT JOIN LATERAL (SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=pg.id) a ON true;
 SELECT count(*) INTO calls FROM private.dabra_dialogue_admissions;
 SELECT count(*) INTO provider_calls FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id WHERE pg.provider=g.provider;
 IF holds>1000000 OR calls+1>28 OR provider_calls+1>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END) THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ENVELOPE'; END IF;
 RETURN NEW;
END $$;

COMMIT;
