-- Task217 LOCAL SOURCE ONLY. production_apply_authorized=false.
-- Qualification-only stored permit; no Customer authority, profile seed or live action.
-- Same advisory lock, immutable admissions and lifetime USD1/28 including disabled history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF to_regprocedure('private.task217_output_contract_manifest()') IS NULL
  OR to_regprocedure('private.protect_dabra_dialogue_grant()') IS NULL
  OR to_regprocedure('private.protect_dabra_pilot_admission()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.dabra_dialogue_funding_grants'::regclass
   AND conname='dabra_dialogue_funding_grants_reserved_credit_micros_check') THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_BASELINE_REQUIRED';
 END IF;
END $baseline$;
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_funding_mode_check;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_funding_mode_check
 CHECK(funding_mode IN('existing-credit','no-new-charge','bounded-account-charge','bounded-account-qualification'));
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_reserved_credit_micros_check;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_reserved_credit_micros_check
 CHECK(reserved_credit_micros>=0 AND CASE WHEN funding_mode IN('bounded-account-charge','bounded-account-qualification')
  THEN reserved_credit_micros<=1000000 ELSE reserved_credit_micros<=authorized_credit_micros END);
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_check1;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_check1 CHECK(
 (funding_mode='existing-credit' AND authorized_credit_micros>0 AND(
  (provider IN('openai','anthropic') AND NOT(proof ? 'pilotEnvelope')) OR
  (proof ? 'pilotEnvelope' AND proof->'pilotEnvelope'='{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb) OR
  (proof ? 'limitedOperation' AND NOT(proof ? 'pilotEnvelope'))))
 OR(funding_mode='no-new-charge' AND provider NOT IN('openai','anthropic') AND authorized_credit_micros=0 AND NOT(proof ? 'pilotEnvelope'))
 OR(funding_mode='bounded-account-charge' AND authorized_credit_micros=0 AND proof->'limitedOperation'->>'schema'='task217-limited-operation-v2')
 OR(funding_mode='bounded-account-qualification' AND authorized_credit_micros=0 AND proof->'limitedOperation'->>'schema'='task217-profile-qualification-authority-v1'));
DROP INDEX private.dabra_task217_grant_account_limited;
CREATE UNIQUE INDEX dabra_task217_grant_account_limited ON private.dabra_dialogue_funding_grants(provider,account_id)
 WHERE proof ? 'limitedOperation' AND funding_mode NOT IN('bounded-account-charge','bounded-account-qualification');
CREATE UNIQUE INDEX dabra_qualification_plan_identity ON private.dabra_dialogue_funding_grants
 ((proof->'limitedOperation'->'permit'->>'planId')) WHERE funding_mode='bounded-account-qualification';
CREATE UNIQUE INDEX dabra_qualification_case_consumed ON private.dabra_dialogue_admissions
 ((execution_pricing->>'qualificationKey')) WHERE execution_pricing->>'schema'='task217-qualification-execution-v1';

CREATE FUNCTION private.dabra_qualification_exact_keys(v jsonb,keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='object'
  THEN v-keys='{}'::jsonb AND (SELECT count(*) FROM jsonb_object_keys(v))=cardinality(keys) ELSE false END
$$;
REVOKE ALL ON FUNCTION private.dabra_qualification_exact_keys(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.valid_dabra_qualification_proof(p jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb;t jsonb;r jsonb;f jsonb;b jsonb;q jsonb;price jsonb;c jsonb;expected jsonb;
 tuple jsonb;case_values jsonb:='[]'::jsonb;idx integer:=0;manifest jsonb:=private.task217_output_contract_manifest();
BEGIN
 IF p_now IS NULL OR p_now<0 OR NOT private.dabra_qualification_exact_keys(p,
  ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation']) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256']) k
   WHERE jsonb_typeof(p->k) IS DISTINCT FROM 'string')
  OR p->>'mode' IS DISTINCT FROM 'bounded-account-qualification'
  OR coalesce(p->>'grantId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(p->>'model','')!~'^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$'
  OR p->>'environment' IS DISTINCT FROM 'provider-benchmark' OR p->>'currency' IS DISTINCT FROM 'USD' OR p->>'serviceTier' IS DISTINCT FROM 'standard'
  OR coalesce(p->>'accountId','')!~'^[a-zA-Z0-9:_-]{1,100}$' OR coalesce(p->>'projectId','')!~'^[a-zA-Z0-9:_-]{1,100}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['credentialSha256','evidenceSha256','pricingEvidenceSha256']) k WHERE coalesce(p->>k,'')!~'^[a-f0-9]{64}$') THEN RETURN false; END IF;
 SELECT value INTO price FROM jsonb_array_elements(manifest->'pricing') WHERE value->>'provider'=p->>'provider'
  AND value->>'model'=p->>'model' AND value->>'pricingEvidenceSha256'=p->>'pricingEvidenceSha256';
 IF NOT FOUND THEN RETURN false; END IF;
 a:=p->'limitedOperation';t:=p->'accountTerms';r:=t->'risks';f:=t->'fundingChargeProtection';b:=t->'allInChargeBound';q:=a->'permit';
 IF NOT private.dabra_qualification_exact_keys(a,ARRAY['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','contractSha256','permit','bindingSha256'])
  OR NOT private.dabra_qualification_exact_keys(t,ARRAY['schema','observedAtMs','evidenceSha256','validity','risks','fundingChargeProtection','allInChargeBound'])
  OR NOT private.dabra_qualification_exact_keys(r,ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage'])
  OR NOT private.dabra_qualification_exact_keys(f,ARRAY['kind','evidenceSha256'])
  OR NOT private.dabra_qualification_exact_keys(b,ARRAY['schema','currency','coverage','maxAdditionalMicros','evidenceSha256'])
  OR NOT private.dabra_qualification_exact_keys(q,ARRAY['schema','purpose','planId','sourceSha','caseSetSha','subjectHash','languages','authorizedAtMs','expiresAtMs','inputTokenCeiling','outputTokenCeiling','cases']) THEN RETURN false; END IF;
 IF a->>'schema' IS DISTINCT FROM 'task217-profile-qualification-authority-v1'
  OR coalesce(a->>'authorizationId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR a->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
  OR a->>'dataScope' IS DISTINCT FROM 'canonical-synthetic-measurement'
  OR a->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb OR a->'maxAttempts' IS DISTINCT FROM '28'::jsonb
  OR jsonb_typeof(a->'authorizedAtMs') IS DISTINCT FROM 'number' OR coalesce(a->>'authorizedAtMs','')!~'^[0-9]{1,16}$'
  OR (a->>'authorizedAtMs')::numeric>p_now OR coalesce(a->>'bindingSha256','')!~'^[a-f0-9]{64}$'
  OR a->>'contractSha256' IS DISTINCT FROM price->>'digest'
  OR t->>'schema' IS DISTINCT FROM 'task217-account-charge-terms-v1' OR t->>'validity' IS DISTINCT FROM 'until-contract-change'
  OR jsonb_typeof(t->'observedAtMs') IS DISTINCT FROM 'number' OR coalesce(t->>'observedAtMs','')!~'^[0-9]{1,16}$'
  OR (t->>'observedAtMs')::numeric>(a->>'authorizedAtMs')::numeric OR coalesce(t->>'evidenceSha256','')!~'^[a-f0-9]{64}$'
  OR coalesce(r->>'autoReload','') NOT IN('off','unknown') OR coalesce(r->>'postpaid','') NOT IN('blocked','allowed','unknown')
  OR coalesce(r->>'overdraft','') NOT IN('blocked','allowed','unknown') OR coalesce(r->>'concurrentAccountUsage','') NOT IN('bounded','unknown')
  OR coalesce(f->>'kind','') NOT IN('documented-manual-funding-only','documented-no-automatic-funding','provider-enforced-no-funding')
  OR coalesce(f->>'evidenceSha256','')!~'^[a-f0-9]{64}$' OR b->>'schema' IS DISTINCT FROM 'all-in-account-charge-bound-v1'
  OR b->>'currency' IS DISTINCT FROM 'USD' OR b->>'coverage' IS DISTINCT FROM 'all-applicable-api-tax-fx-and-funding-charges'
  OR jsonb_typeof(b->'maxAdditionalMicros') IS DISTINCT FROM 'number' OR coalesce(b->>'maxAdditionalMicros','')!~'^[0-9]{1,16}$'
  OR (b->>'maxAdditionalMicros')::numeric>1000000 OR coalesce(b->>'evidenceSha256','')!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
 -- Prevent JSON scalar coercion of every enum/string in the bound tuple.
 IF EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorizationId','taskId','dataScope','contractSha256','bindingSha256']) k WHERE jsonb_typeof(a->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','evidenceSha256','validity']) k WHERE jsonb_typeof(t->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM jsonb_each(f) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','currency','coverage','evidenceSha256']) k WHERE jsonb_typeof(b->k) IS DISTINCT FROM 'string') THEN RETURN false; END IF;
 IF q->>'schema' IS DISTINCT FROM 'task217-platform-units-measurement-v1' OR q->>'purpose' IS DISTINCT FROM 'profile-qualification'
  OR coalesce(q->>'planId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(q->>'sourceSha','')!~'^[a-f0-9]{40}$' OR coalesce(q->>'subjectHash','')!~'^[a-f0-9]{64}$'
  OR q->'authorizedAtMs' IS DISTINCT FROM a->'authorizedAtMs'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','purpose','planId','sourceSha','caseSetSha','subjectHash']) k WHERE jsonb_typeof(q->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedAtMs','expiresAtMs','inputTokenCeiling','outputTokenCeiling']) k WHERE jsonb_typeof(q->k) IS DISTINCT FROM 'number' OR coalesce(q->>k,'')!~'^[0-9]{1,16}$')
  OR jsonb_typeof(q->'cases') IS DISTINCT FROM 'array'
  OR q->'languages' NOT IN('["ar"]'::jsonb,'["en"]'::jsonb,'["ar","en"]'::jsonb) THEN RETURN false; END IF;
 IF q->'languages' IS NULL OR q->'languages'='null'::jsonb OR jsonb_typeof(q->'languages') IS DISTINCT FROM 'array'
  OR (q->>'expiresAtMs')::numeric-(q->>'authorizedAtMs')::numeric NOT BETWEEN 1 AND 3600000
  OR (q->>'expiresAtMs')::numeric<=p_now OR (q->>'inputTokenCeiling')::numeric NOT BETWEEN 1 AND 4096
  OR (q->>'outputTokenCeiling')::numeric NOT BETWEEN 1 AND 1024
  OR jsonb_array_length(q->'cases')<>2*jsonb_array_length(q->'languages') THEN RETURN false; END IF;
 IF q->>'caseSetSha' IS DISTINCT FROM (SELECT value->>'caseSetSha' FROM jsonb_array_elements(manifest->'contracts') WHERE value->>'id'='platform-units-v1' LIMIT 1) THEN RETURN false; END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements(manifest->'cases') WITH ORDINALITY e(value,ord) WHERE q->'languages' ? (value->>'language') ORDER BY ord LOOP
  c:=q->'cases'->idx;idx:=idx+1;
  IF NOT private.dabra_qualification_exact_keys(c,ARRAY['caseId','requestId','stage','language','inputSha256','contractSha256'])
   OR EXISTS(SELECT 1 FROM jsonb_each(c) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
   OR c->>'caseId' IS DISTINCT FROM expected->>'caseId' OR c->>'stage' IS DISTINCT FROM expected->>'stage'
   OR c->>'language' IS DISTINCT FROM expected->>'language' OR c->>'inputSha256' IS DISTINCT FROM expected->>'inputSha256'
   OR c->>'contractSha256' IS DISTINCT FROM expected->>'contractSha256'
   OR coalesce(c->>'requestId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR (q->>'inputTokenCeiling')::numeric<(expected->>'inputBytes')::numeric THEN RETURN false; END IF;
  case_values:=case_values||jsonb_build_array(jsonb_build_array(c->'caseId',c->'requestId',c->'stage',c->'language',c->'inputSha256',c->'contractSha256'));
 END LOOP;
 IF idx<>jsonb_array_length(q->'cases') OR (SELECT count(DISTINCT value->>'requestId') FROM jsonb_array_elements(q->'cases'))<>idx THEN RETURN false; END IF;
 tuple:=jsonb_build_array(p->'mode',p->'grantId',p->'provider',p->'model',p->'environment',p->'accountId',p->'projectId',p->'credentialSha256',p->'evidenceSha256',p->'currency',p->'serviceTier',p->'pricingEvidenceSha256',
  a->'schema',a->'authorizationId',a->'taskId',a->'dataScope',a->'maxCostMicros',a->'maxAttempts',a->'authorizedAtMs',a->'contractSha256',
  t->'schema',t->'observedAtMs',t->'evidenceSha256',t->'validity',r->'autoReload',r->'postpaid',r->'overdraft',r->'concurrentAccountUsage',
  f->'kind',f->'evidenceSha256',b->'schema',b->'currency',b->'coverage',b->'maxAdditionalMicros',b->'evidenceSha256',
  q->'schema',q->'purpose',q->'planId',q->'sourceSha',q->'caseSetSha',q->'subjectHash',q->'languages',q->'authorizedAtMs',q->'expiresAtMs',q->'inputTokenCeiling',q->'outputTokenCeiling',case_values);
 RETURN encode(sha256(convert_to(replace(tuple::text,' ',''),'UTF8')),'hex')=a->>'bindingSha256';
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_dabra_qualification_proof(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.valid_dabra_qualification_grant(g private.dabra_dialogue_funding_grants,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE price jsonb;
BEGIN
 IF NOT private.valid_dabra_qualification_proof(g.proof,p_now) THEN RETURN false; END IF;
 SELECT value INTO price FROM jsonb_array_elements(private.task217_output_contract_manifest()->'pricing') WHERE value->>'provider'=g.provider;
 RETURN coalesce(g.funding_mode='bounded-account-qualification' AND g.authorized_credit_micros=0
  AND g.reserved_credit_micros BETWEEN 0 AND 1000000 AND g.proof->>'grantId'=g.id::text
  AND g.proof->>'provider'=g.provider AND g.proof->>'accountId'=g.account_id AND g.proof->>'projectId'=g.project_id
  AND g.input_rate_micros_per_million=(price->>'inputMicrosPerMillion')::bigint
  AND g.output_rate_micros_per_million=(price->>'outputMicrosPerMillion')::bigint
  AND g.pricing_expires_at IS NULL
  AND floor(extract(epoch FROM g.authorized_at)*1000)::bigint=(g.proof->'limitedOperation'->>'authorizedAtMs')::bigint,false);
END $$;
REVOKE ALL ON FUNCTION private.valid_dabra_qualification_grant(private.dabra_dialogue_funding_grants,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.valid_dabra_qualification_execution(
 g private.dabra_dialogue_funding_grants,p_attempt uuid,p_request uuid,p_subject text,p_stage text,
 p_input integer,p_output integer,p_cost bigint,e jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q jsonb; a jsonb;c jsonb;o jsonb;price jsonb;expected_key text;quote bigint;
BEGIN
 IF private.valid_dabra_qualification_grant(g,p_now) IS NOT TRUE OR p_attempt IS NULL OR p_request IS NULL OR p_subject IS NULL
  OR p_stage IS DISTINCT FROM 'discover' OR p_input IS NULL OR p_output IS NULL OR p_cost IS NULL OR p_cost<=0
  OR NOT private.dabra_qualification_exact_keys(e,ARRAY['schema','observation','authorityBindingSha256','planId','caseId','runId','inputSha256','contractSha256','qualificationKey','attemptId','requestId','subjectHash','stage','language','inputTokenCeiling','outputTokenCeiling']) THEN RETURN false; END IF;
 q:=g.proof->'limitedOperation'->'permit';a:=g.proof->'limitedOperation';o:=e->'observation';
 SELECT value INTO c FROM jsonb_array_elements(q->'cases') WHERE value->>'caseId'=e->>'caseId';
 IF NOT FOUND THEN RETURN false; END IF;
 expected_key:=encode(sha256(convert_to(replace(jsonb_build_array(a->'taskId',g.proof->'provider',q->'caseSetSha',c->'caseId')::text,' ',''),'UTF8')),'hex');
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorityBindingSha256','planId','caseId','runId','inputSha256','contractSha256','qualificationKey','attemptId','requestId','subjectHash','stage','language']) k WHERE jsonb_typeof(e->k) IS DISTINCT FROM 'string')
  OR e->>'schema' IS DISTINCT FROM 'task217-qualification-execution-v1'
  OR e->>'authorityBindingSha256' IS DISTINCT FROM a->>'bindingSha256'
  OR e->>'planId' IS DISTINCT FROM q->>'planId' OR e->>'inputSha256' IS DISTINCT FROM c->>'inputSha256'
  OR e->>'contractSha256' IS DISTINCT FROM c->>'contractSha256' OR e->>'qualificationKey' IS DISTINCT FROM expected_key
  OR e->>'attemptId' IS DISTINCT FROM p_attempt::text OR e->>'requestId' IS DISTINCT FROM p_request::text
  OR p_request::text IS DISTINCT FROM c->>'requestId' OR e->>'subjectHash' IS DISTINCT FROM p_subject OR p_subject IS DISTINCT FROM q->>'subjectHash'
  OR e->>'stage' IS DISTINCT FROM p_stage OR e->>'language' IS DISTINCT FROM c->>'language'
  OR e->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input) OR q->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input)
  OR e->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output) OR q->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output)
  OR coalesce(e->>'runId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR NOT private.dabra_qualification_exact_keys(o,ARRAY['schema','provider','model','approvedPricingDigest','approvedContractDigest','currency','unitTokens','inputMicrosPerMillion','outputMicrosPerMillion','observedAtMs','expiresAtMs','bodySha256']) THEN RETURN false; END IF;
 SELECT value INTO price FROM jsonb_array_elements(private.task217_output_contract_manifest()->'pricing') WHERE value->>'provider'=g.provider;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['schema','provider','model','approvedPricingDigest','approvedContractDigest','currency','bodySha256']) k WHERE jsonb_typeof(o->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['unitTokens','inputMicrosPerMillion','outputMicrosPerMillion','observedAtMs','expiresAtMs']) k WHERE jsonb_typeof(o->k) IS DISTINCT FROM 'number' OR coalesce(o->>k,'')!~'^[0-9]{1,16}$')
  OR o->>'schema' IS DISTINCT FROM 'task217-public-pricing-observation-v1'
  OR o->>'provider' IS DISTINCT FROM g.provider OR o->>'model' IS DISTINCT FROM g.proof->>'model'
  OR o->>'approvedPricingDigest' IS DISTINCT FROM g.proof->>'pricingEvidenceSha256'
  OR o->>'approvedContractDigest' IS DISTINCT FROM a->>'contractSha256'
  OR o->>'currency' IS DISTINCT FROM 'USD' OR o->'unitTokens' IS DISTINCT FROM '1000000'::jsonb
  OR o->'inputMicrosPerMillion' IS DISTINCT FROM price->'inputMicrosPerMillion'
  OR o->'outputMicrosPerMillion' IS DISTINCT FROM price->'outputMicrosPerMillion'
  OR coalesce(o->>'bodySha256','')!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
 IF (o->>'observedAtMs')::numeric>p_now OR (o->>'expiresAtMs')::numeric<=p_now
  OR (o->>'expiresAtMs')::numeric-(o->>'observedAtMs')::numeric NOT BETWEEN 1 AND 900000
  OR (price->'tariffBeforeMs'<>'null'::jsonb AND ((o->>'expiresAtMs')::numeric>(price->>'tariffBeforeMs')::numeric OR p_now>=(price->>'tariffBeforeMs')::numeric)) THEN RETURN false; END IF;
 quote:=ceil((p_input::numeric*(price->>'inputMicrosPerMillion')::numeric+p_output::numeric*(price->>'outputMicrosPerMillion')::numeric)/1000000)::bigint
  +(g.proof->'accountTerms'->'allInChargeBound'->>'maxAdditionalMicros')::bigint;
 RETURN coalesce(quote>0 AND quote<=1000000 AND quote=p_cost,false);
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_dabra_qualification_execution(private.dabra_dialogue_funding_grants,uuid,uuid,text,text,integer,integer,bigint,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_dabra_dialogue_qualification_plan(p_plan_id uuid,p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g private.dabra_dialogue_funding_grants;c private.dabra_dialogue_funding_control;
 now_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF p_plan_id IS NULL OR p_subject_hash IS NULL OR p_subject_hash!~'^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
 IF NOT FOUND OR NOT c.enabled OR c.max_attempt_cost_micros NOT BETWEEN 1 AND 1000000 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE enabled AND funding_mode='bounded-account-qualification'
  AND proof->'limitedOperation'->'permit'->>'planId'=p_plan_id::text
  AND proof->'limitedOperation'->'permit'->>'subjectHash'=p_subject_hash;
 IF NOT FOUND OR private.valid_dabra_qualification_grant(g,now_ms) IS NOT TRUE THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('schema','task217-stored-qualification-plan-v1','proof',g.proof,'dailyLimits',c.daily_limits,'maxCostMicros',c.max_attempt_cost_micros);
END $$;
REVOKE ALL ON FUNCTION public.get_dabra_dialogue_qualification_plan(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_dabra_dialogue_qualification_plan(uuid,text) TO service_role;

CREATE FUNCTION private.reserve_dabra_qualification_attempt(
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
 IF holds+p_cost_micros>1000000 OR calls+1>28 OR provider_calls+1>4
  OR (v_index=0 AND (holds+p_cost_micros::numeric*plan_count>1000000 OR calls+plan_count>28 OR provider_calls+plan_count>4)) THEN
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
REVOKE ALL ON FUNCTION private.reserve_dabra_qualification_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.protect_dabra_qualification_insert()
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
 IF holds>1000000 OR calls+1>28 OR provider_calls+1>4 THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ENVELOPE'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_dabra_qualification_insert() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_dabra_qualification_insert BEFORE INSERT ON private.dabra_dialogue_admissions
 FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_qualification_insert();

CREATE OR REPLACE FUNCTION public.reserve_dabra_dialogue_attempt(
 p_attempt_id uuid,p_request_id uuid,p_stage text,p_subject_hash text,p_grant_id uuid,p_proof jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_limits jsonb,p_day_start_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 c private.dabra_dialogue_funding_control%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 v_now timestamptz; v_now_ms bigint; v_day bigint; q_start bigint; q_end bigint; v_quote bigint;
 total_calls bigint; user_calls bigint; users bigint; total_input bigint; total_output bigint; user_input bigint; user_output bigint;
 v_pilot boolean; v_limited boolean; pilot_holds numeric; pilot_calls bigint; v_bound jsonb; v_extra bigint;
 quota_calls bigint; quota_input bigint; quota_output bigint;
 v_source private.dabra_dialogue_funding_grants%ROWTYPE;
 v_snapshot boolean; v_auth jsonb; v_verified bigint; v_expires bigint; v_financial jsonb; v_case_values jsonb; v_case_index integer;
 v_proof jsonb; v_measurement boolean; v_request jsonb; v_permit jsonb; v_case jsonb; v_case_match jsonb;
 v_durable boolean; v_execution jsonb; v_observation jsonb; v_terms jsonb; v_risks jsonb; v_protection jsonb; v_charge jsonb; v_tuple jsonb;
 v_contract text; v_rate_input bigint; v_rate_output bigint; v_tariff_before_ms bigint; v_profile jsonb; v_candidate jsonb; v_m jsonb;
BEGIN

 IF p_proof->>'mode'='bounded-account-qualification' THEN
  RETURN private.reserve_dabra_qualification_attempt(p_attempt_id,p_request_id,p_stage,p_subject_hash,p_grant_id,p_proof,p_input_tokens,p_output_tokens,p_cost_micros,p_limits,p_day_start_ms);
 END IF;
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_measurement:=p_proof ? 'measurementRequest';
 v_proof:=p_proof;
 IF v_measurement THEN
  v_request:=p_proof->'measurementRequest';
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_request))<>(CASE WHEN p_proof ? 'snapshotUse' THEN 3 ELSE 2 END)
   OR (p_proof ? 'snapshotUse' AND coalesce(v_request->>'runId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
   OR coalesce(v_request->>'planId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR coalesce(v_request->>'caseId','') NOT IN ('intent-ar','intent-en','discover-ar','discover-en') THEN
   RETURN jsonb_build_object('decision','denied');
  END IF;
  v_proof:=p_proof-'measurementRequest';
 END IF;
 v_durable:=coalesce(p_proof->>'mode'='bounded-account-charge',false);
 IF v_durable THEN
  v_execution:=p_proof->'executionPricing'; v_proof:=v_proof-'executionPricing';
 ELSE
  IF p_proof ? 'executionPricing' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;
 IF p_attempt_id IS NULL OR p_request_id IS NULL OR p_grant_id IS NULL
  OR p_stage IS NULL OR p_stage NOT IN ('discover','intent.classify')
  OR p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$'
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096
  OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 0 AND 9007199254740991 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF jsonb_typeof(v_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(p_limits) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['uniqueUsers','requestsPerUser','requestsTotal','inputTokensPerUser','outputTokensPerUser','inputTokensTotal','outputTokensTotal']) k WHERE coalesce(p_limits->>k,'') !~ '^[1-9][0-9]{0,8}$')
  OR (NOT v_durable AND EXISTS(SELECT 1 FROM unnest(ARRAY['verifiedAtMs','expiresAtMs','quotaWindowStartMs','quotaWindowEndMs','remainingRequests','remainingInputTokens','remainingOutputTokens']) k WHERE coalesce(v_proof->>k,'') !~ '^[0-9]{1,16}$'))
  OR coalesce(v_proof->>'evidenceSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(v_proof->>'credentialSha256','') !~ '^[a-f0-9]{64}$' THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 -- One lock order for all users, providers, projects and workers. No external call is made under a DB lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 v_now:=clock_timestamp(); v_now_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 v_day:=floor((v_now_ms+10800000)::numeric/86400000)::bigint*86400000-10800000;
 IF p_day_start_ms IS DISTINCT FROM v_day OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE attempt_id=p_attempt_id) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND OR NOT c.enabled OR (p_subject_hash=ANY(c.subject_hashes)) IS NOT TRUE OR p_limits IS DISTINCT FROM c.daily_limits
  OR p_cost_micros>c.max_attempt_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 -- Server-stored limits are bounded again here; no caller can widen them.
 IF (p_limits->>'uniqueUsers')::integer NOT BETWEEN 1 AND 20
  OR (p_limits->>'requestsPerUser')::integer NOT BETWEEN 1 AND 6
  OR (p_limits->>'requestsTotal')::integer NOT BETWEEN 1 AND 60
  OR (p_limits->>'inputTokensPerUser')::integer NOT BETWEEN 1 AND 24576
  OR (p_limits->>'outputTokensPerUser')::integer NOT BETWEEN 1 AND 6144
  OR (p_limits->>'inputTokensTotal')::integer NOT BETWEEN 1 AND 245760
  OR (p_limits->>'outputTokensTotal')::integer NOT BETWEEN 1 AND 61440 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=p_grant_id FOR UPDATE;
 IF v_durable THEN

 IF NOT FOUND OR NOT g.enabled OR g.authorized_at>v_now OR v_proof IS DISTINCT FROM g.proof OR v_measurement THEN RETURN jsonb_build_object('decision','denied'); END IF;

 v_auth:=v_proof->'limitedOperation'; v_terms:=v_proof->'accountTerms';
 IF jsonb_typeof(v_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(v_auth) IS DISTINCT FROM 'object'
  OR jsonb_typeof(v_terms) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_proof))<>14 OR v_proof-ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation']::text[]<>'{}'::jsonb
  OR g.funding_mode<>'bounded-account-charge' OR g.authorized_credit_micros<>0 OR g.pricing_expires_at IS NOT NULL
  OR v_proof->>'mode' IS DISTINCT FROM g.funding_mode OR v_proof->>'grantId' IS DISTINCT FROM g.id::text
  OR v_proof->>'provider' IS DISTINCT FROM g.provider OR v_proof->>'accountId' IS DISTINCT FROM g.account_id
  OR v_proof->>'projectId' IS DISTINCT FROM g.project_id OR v_proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
  OR v_proof->>'currency' IS DISTINCT FROM 'USD' OR v_proof->>'serviceTier' IS DISTINCT FROM 'standard'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256']) k WHERE jsonb_typeof(v_proof->k) IS DISTINCT FROM 'string')
  OR coalesce(v_proof->>'model','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['credentialSha256','evidenceSha256','pricingEvidenceSha256']) k WHERE coalesce(v_proof->>k,'') !~ '^[a-f0-9]{64}$')
  OR (SELECT count(*) FROM jsonb_object_keys(v_auth))<>12
  OR v_auth-ARRAY['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','duration','providerRisk','acceptedProfileSha256s','contractSha256','bindingSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorizationId','taskId','dataScope','duration','providerRisk','contractSha256','bindingSha256']) k WHERE jsonb_typeof(v_auth->k) IS DISTINCT FROM 'string')
  OR v_auth->>'schema' IS DISTINCT FROM 'task217-limited-operation-v2'
  OR coalesce(v_auth->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR v_auth->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
  OR v_auth->>'dataScope' IS DISTINCT FROM 'redacted-travel-or-server-units'
  OR v_auth->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb OR v_auth->'maxAttempts' IS DISTINCT FROM '28'::jsonb
  OR v_auth->>'duration' IS DISTINCT FROM 'until-revoked-or-binding-change'
  OR v_auth->>'providerRisk' IS DISTINCT FROM 'bounded-account-liability-with-observed-risks'
  OR jsonb_typeof(v_auth->'authorizedAtMs') IS DISTINCT FROM 'number'
  OR coalesce(v_auth->>'authorizedAtMs','') !~ '^[0-9]{1,16}$'
  OR coalesce(v_auth->>'bindingSha256','') !~ '^[a-f0-9]{64}$'
  OR coalesce(v_auth->>'contractSha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v_auth->'acceptedProfileSha256s') IS DISTINCT FROM 'array'
  OR (SELECT count(*) FROM jsonb_object_keys(v_terms))<>7
  OR v_terms-ARRAY['schema','observedAtMs','evidenceSha256','validity','risks','fundingChargeProtection','allInChargeBound']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','evidenceSha256','validity']) k WHERE jsonb_typeof(v_terms->k) IS DISTINCT FROM 'string')
  OR v_terms->>'schema' IS DISTINCT FROM 'task217-account-charge-terms-v1'
  OR v_terms->>'validity' IS DISTINCT FROM 'until-contract-change'
  OR coalesce(v_terms->>'evidenceSha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v_terms->'observedAtMs') IS DISTINCT FROM 'number'
  OR coalesce(v_terms->>'observedAtMs','') !~ '^[0-9]{1,16}$' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (v_auth->>'authorizedAtMs')::bigint NOT BETWEEN 0 AND least(v_now_ms,9007199254740991)
  OR floor(extract(epoch FROM g.authorized_at)*1000)::bigint IS DISTINCT FROM (v_auth->>'authorizedAtMs')::bigint
  OR (v_terms->>'observedAtMs')::bigint>(v_auth->>'authorizedAtMs')::bigint
  OR jsonb_array_length(v_auth->'acceptedProfileSha256s') NOT BETWEEN 1 AND 4
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_auth->'acceptedProfileSha256s') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' !~ '^[a-f0-9]{64}$')
  OR EXISTS(SELECT 1 FROM (SELECT value#>>'{}' item,lag(value#>>'{}') OVER(ORDER BY ord) prior FROM jsonb_array_elements(v_auth->'acceptedProfileSha256s') WITH ORDINALITY t(value,ord)) p WHERE prior>=item)
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other WHERE other.id<>g.id
    AND other.proof->'limitedOperation'->>'authorizationId'=v_auth->>'authorizationId') THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_risks:=v_terms->'risks'; v_protection:=v_terms->'fundingChargeProtection'; v_charge:=v_terms->'allInChargeBound';
 IF jsonb_typeof(v_risks) IS DISTINCT FROM 'object' OR jsonb_typeof(v_protection) IS DISTINCT FROM 'object'
  OR jsonb_typeof(v_charge) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_risks))<>4
  OR v_risks-ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE jsonb_typeof(v_risks->k) IS DISTINCT FROM 'string')
  OR coalesce(v_risks->>'autoReload','') NOT IN ('off','unknown')
  OR coalesce(v_risks->>'postpaid','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_risks->>'overdraft','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_risks->>'concurrentAccountUsage','') NOT IN ('bounded','unknown')
  OR (SELECT count(*) FROM jsonb_object_keys(v_protection))<>2 OR v_protection-ARRAY['kind','evidenceSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['kind','evidenceSha256']) k WHERE jsonb_typeof(v_protection->k) IS DISTINCT FROM 'string')
  OR coalesce(v_protection->>'kind','') NOT IN ('documented-manual-funding-only','documented-no-automatic-funding','provider-enforced-no-funding')
  OR coalesce(v_protection->>'evidenceSha256','') !~ '^[a-f0-9]{64}$'
  OR (SELECT count(*) FROM jsonb_object_keys(v_charge))<>5 OR v_charge-ARRAY['schema','currency','coverage','maxAdditionalMicros','evidenceSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','currency','coverage','evidenceSha256']) k WHERE jsonb_typeof(v_charge->k) IS DISTINCT FROM 'string')
  OR v_charge->>'schema' IS DISTINCT FROM 'all-in-account-charge-bound-v1' OR v_charge->>'currency' IS DISTINCT FROM 'USD'
  OR v_charge->>'coverage' IS DISTINCT FROM 'all-applicable-api-tax-fx-and-funding-charges'
  OR jsonb_typeof(v_charge->'maxAdditionalMicros') IS DISTINCT FROM 'number'
  OR coalesce(v_charge->>'maxAdditionalMicros','') !~ '^[0-9]{1,7}$'
  OR coalesce(v_charge->>'evidenceSha256','') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (v_charge->>'maxAdditionalMicros')::bigint>1000000 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT r.contract,r.input_rate,r.output_rate,r.tariff_before_ms INTO v_contract,v_rate_input,v_rate_output,v_tariff_before_ms
 FROM (VALUES ('openai','gpt-6-luna','f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a','187f81010403df589d73368809106b52c25e3fe093ae5559d4ba14efeb343ee9',100000,500000,NULL::bigint),
('anthropic','claude-sonnet-5-5','97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4','51208c2b11b6d744ae57fcb4316c2b4b38cadcc01152da0ce158cc6a3657615c',2000000,10000000,NULL::bigint),
('gemini','gemini-3.8-flash','3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f','098195ab8b022de0499e94a4bd31379c144591556a503d5c6175383e944d54b4',750000,3750000,1798761600000::bigint),
('xai','grok-4.20-0309-non-reasoning','fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb','95028669dc240f0fe171a719b9f01c982dffcfbc1197a7ecf6f089cadf82cc14',1250000,2500000,NULL::bigint),
('deepseek','deepseek-flash','760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927','1a7e56eed7ab6c7c6e009c18a3d225d7ab8448abbe5b44a0300036b37ae9182e',300000,1200000,NULL::bigint),
('qwen','qwen3.8-flash','7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb','1c6c91f883b20fb56e05f336bc58a85b84fc875e67fb9356971f18ea51477032',150000,470000,NULL::bigint),
('mistral','mistral-small-2603','72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3','369e80769ebb120922a3878d60f8a7ff34c0a1e460bea6f145cfb3a9e46b3f75',150000,600000,NULL::bigint)) r(provider,model,pricing,contract,input_rate,output_rate,tariff_before_ms)
 WHERE r.provider=g.provider AND r.model=v_proof->>'model' AND r.pricing=v_proof->>'pricingEvidenceSha256';
 IF NOT FOUND OR v_contract IS DISTINCT FROM v_auth->>'contractSha256'
  OR v_rate_input IS DISTINCT FROM g.input_rate_micros_per_million
  OR v_rate_output IS DISTINCT FROM g.output_rate_micros_per_million THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_tuple:=jsonb_build_array(v_proof->'grantId',v_proof->'provider',v_proof->'model',v_proof->'environment',
  v_proof->'accountId',v_proof->'projectId',v_proof->'credentialSha256',v_proof->'evidenceSha256',
  v_proof->'mode',v_proof->'currency',v_proof->'serviceTier',v_proof->'pricingEvidenceSha256',
  v_auth->'schema',v_auth->'authorizationId',v_auth->'taskId',v_auth->'dataScope',v_auth->'maxCostMicros',
  v_auth->'maxAttempts',v_auth->'authorizedAtMs',v_auth->'duration',v_auth->'providerRisk',v_auth->'acceptedProfileSha256s',v_auth->'contractSha256',
  v_terms->'schema',v_terms->'observedAtMs',v_terms->'evidenceSha256',v_terms->'validity',
  v_risks->'autoReload',v_risks->'postpaid',v_risks->'overdraft',v_risks->'concurrentAccountUsage',
  v_protection->'kind',v_protection->'evidenceSha256',v_charge->'schema',v_charge->'currency',v_charge->'coverage',
  v_charge->'maxAdditionalMicros',v_charge->'evidenceSha256');
 IF encode(sha256(convert_to(replace(v_tuple::text,' ',''),'UTF8')),'hex') IS DISTINCT FROM v_auth->>'bindingSha256' THEN RETURN jsonb_build_object('decision','denied'); END IF;

 v_limited:=true; v_pilot:=false; v_snapshot:=false;
 IF jsonb_typeof(v_execution) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_execution))<>10
  OR v_execution-ARRAY['schema','observation','authorityBindingSha256','profileSha256','attemptId','requestId','subjectHash','stage','inputTokenCeiling','outputTokenCeiling']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorityBindingSha256','profileSha256','attemptId','requestId','subjectHash','stage']) k WHERE jsonb_typeof(v_execution->k) IS DISTINCT FROM 'string')
  OR v_execution->>'schema' IS DISTINCT FROM 'task217-execution-pricing-v1'
  OR v_execution->>'authorityBindingSha256' IS DISTINCT FROM v_auth->>'bindingSha256'
  OR v_execution->>'attemptId' IS DISTINCT FROM p_attempt_id::text OR v_execution->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_execution->>'subjectHash' IS DISTINCT FROM p_subject_hash OR v_execution->>'stage' IS DISTINCT FROM p_stage
  OR v_execution->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input_tokens)
  OR v_execution->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output_tokens)
  OR coalesce(v_execution->>'profileSha256','') !~ '^[a-f0-9]{64}$'
  OR NOT(v_auth->'acceptedProfileSha256s' ? (v_execution->>'profileSha256'))
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id AND stage=p_stage) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 v_observation:=v_execution->'observation';
 IF jsonb_typeof(v_observation) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_observation))<>12
  OR v_observation-ARRAY['schema','provider','model','approvedPricingDigest','approvedContractDigest','currency','unitTokens','inputMicrosPerMillion','outputMicrosPerMillion','observedAtMs','expiresAtMs','bodySha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','provider','model','approvedPricingDigest','approvedContractDigest','currency','bodySha256']) k WHERE jsonb_typeof(v_observation->k) IS DISTINCT FROM 'string')
  OR v_observation->>'schema' IS DISTINCT FROM 'task217-public-pricing-observation-v1'
  OR v_observation->>'provider' IS DISTINCT FROM g.provider OR v_observation->>'model' IS DISTINCT FROM v_proof->>'model'
  OR v_observation->>'approvedPricingDigest' IS DISTINCT FROM v_proof->>'pricingEvidenceSha256'
  OR v_observation->>'approvedContractDigest' IS DISTINCT FROM v_contract
  OR v_observation->>'currency' IS DISTINCT FROM 'USD' OR v_observation->'unitTokens' IS DISTINCT FROM '1000000'::jsonb
  OR v_observation->'inputMicrosPerMillion' IS DISTINCT FROM to_jsonb(v_rate_input)
  OR v_observation->'outputMicrosPerMillion' IS DISTINCT FROM to_jsonb(v_rate_output)
  OR coalesce(v_observation->>'bodySha256','') !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['observedAtMs','expiresAtMs']) k WHERE jsonb_typeof(v_observation->k) IS DISTINCT FROM 'number' OR coalesce(v_observation->>k,'') !~ '^[0-9]{1,16}$') THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 IF (v_observation->>'observedAtMs')::bigint>v_now_ms OR (v_observation->>'expiresAtMs')::bigint<=v_now_ms
  OR (v_observation->>'expiresAtMs')::bigint-(v_observation->>'observedAtMs')::bigint NOT BETWEEN 1 AND 900000
  OR (v_observation->>'expiresAtMs')::bigint>9007199254740991 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF v_tariff_before_ms IS NOT NULL AND ((v_observation->>'expiresAtMs')::bigint>v_tariff_before_ms OR v_now_ms>=v_tariff_before_ms) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 -- Exact accepted measurement with its original dates, not a synthetic new TTL.
 v_profile:=NULL;
 FOR v_candidate IN SELECT value FROM jsonb_array_elements(c.profiles) LOOP
  IF jsonb_typeof(v_candidate) IS DISTINCT FROM 'object' OR jsonb_typeof(v_candidate->'measurement') IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
  v_m:=v_candidate->'measurement';
  IF v_candidate->>'provider' IS DISTINCT FROM g.provider OR v_m->>'model' IS DISTINCT FROM v_proof->>'model'
   OR v_m->>'environment' IS DISTINCT FROM 'provider-benchmark' OR v_m->>'capability' IS DISTINCT FROM p_stage
   OR coalesce(v_m->>'language','') NOT IN ('ar','en')
   OR coalesce(v_m->>'sourceSha','') !~ '^[a-f0-9]{40}$' OR coalesce(v_m->>'caseSetSha','') !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['cases','passed','measuredAtMs','expiresAtMs','latencyMs','inputTokenCeiling','outputTokenCeiling']) k WHERE jsonb_typeof(v_m->k) IS DISTINCT FROM 'number' OR coalesce(v_m->>k,'') !~ '^[0-9]{1,16}$')
   OR jsonb_typeof(v_m->'costCeilingUsd') IS DISTINCT FROM 'number' OR coalesce(v_m->>'costCeilingUsd','') !~ '^[0-9]+([.][0-9]+)?$' THEN CONTINUE; END IF;
  IF (v_m->>'cases')::bigint<1 OR v_m->'cases' IS DISTINCT FROM v_m->'passed'
   OR (v_m->>'measuredAtMs')::bigint>(v_auth->>'authorizedAtMs')::bigint
   OR (v_m->>'expiresAtMs')::bigint<=(v_m->>'measuredAtMs')::bigint
   OR (v_m->>'latencyMs')::bigint>12000 OR p_cost_micros::numeric/1000000>(v_m->>'costCeilingUsd')::numeric
   OR v_m->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input_tokens)
   OR v_m->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output_tokens) THEN CONTINUE; END IF;
  v_tuple:=jsonb_build_array(v_candidate->'provider',v_m->'capability',v_m->'language',v_m->'model',v_m->'environment',
   v_m->'caseSetSha',v_m->'sourceSha',v_m->'cases',v_m->'passed',v_m->'measuredAtMs',v_m->'expiresAtMs',
   v_m->'latencyMs',v_m->'inputTokenCeiling',v_m->'outputTokenCeiling',v_m->'costCeilingUsd');
  IF encode(sha256(convert_to(replace(v_tuple::text,' ',''),'UTF8')),'hex')=v_execution->>'profileSha256' THEN
   IF v_profile IS NOT NULL THEN RETURN jsonb_build_object('decision','denied'); END IF;
   v_profile:=v_candidate;
  END IF;
 END LOOP;
 IF v_profile IS NULL THEN RETURN jsonb_build_object('decision','denied'); END IF;
 -- Account-charge liability is not a claim that USD prepaid credit exists.
 v_quote:=ceil((p_input_tokens::numeric*v_rate_input+p_output_tokens::numeric*v_rate_output)/1000000)::bigint
   +(v_charge->>'maxAdditionalMicros')::bigint;
 IF v_quote<=0 OR p_cost_micros<>v_quote OR v_quote>1000000 THEN RETURN jsonb_build_object('decision','denied'); END IF;



 ELSE
 v_limited:=coalesce(g.proof ? 'limitedOperation',false);
 IF NOT FOUND OR NOT g.enabled OR g.authorized_at>v_now OR v_proof IS DISTINCT FROM g.proof
  OR v_proof->>'grantId' IS DISTINCT FROM g.id::text
  OR v_proof->>'provider' IS DISTINCT FROM g.provider OR v_proof->>'accountId' IS DISTINCT FROM g.account_id
  OR v_proof->>'projectId' IS DISTINCT FROM g.project_id OR v_proof->>'mode' IS DISTINCT FROM g.funding_mode
  OR v_proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
  OR v_proof->>'autoReload' IS DISTINCT FROM 'off'
  OR coalesce(v_proof->>'postpaid','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_proof->>'overdraft','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_proof->>'concurrentAccountUsage','') NOT IN ('bounded','unknown')
  -- The fixed pilot bounds its own atomic ledger, not the whole provider account.
  -- Exact marker and measurement authority remain mandatory below before admission.
  OR (NOT coalesce(g.proof ? 'pilotEnvelope',false) AND (
    v_proof->>'postpaid' IS DISTINCT FROM 'blocked' OR (v_proof->>'overdraft' IS DISTINCT FROM 'blocked' AND NOT (v_limited AND v_proof->>'overdraft'='unknown'))
    OR v_proof->>'concurrentAccountUsage' IS DISTINCT FROM 'bounded'))
  OR (v_proof->>'evidenceSha256') !~ '^[a-f0-9]{64}$' OR (v_proof->>'credentialSha256') !~ '^[a-f0-9]{64}$'
  OR (v_proof->>'verifiedAtMs')::bigint>v_now_ms
  OR (v_proof->>'expiresAtMs')::bigint-(v_proof->>'verifiedAtMs')::bigint NOT BETWEEN 1 AND 3600000 THEN
  RETURN jsonb_build_object('decision','denied'); END IF;

 -- A private explicit authorization may reuse the original financial observation.
 -- It never re-dates that observation, its balance, or the independent price/fee evidence.
 v_verified:=(v_proof->>'verifiedAtMs')::bigint; v_expires:=(v_proof->>'expiresAtMs')::bigint;
 v_snapshot:=v_proof ? 'snapshotUse';
 IF v_snapshot THEN
  v_auth:=v_proof->'snapshotUse';
  IF NOT v_measurement OR NOT(g.proof ? 'pilotEnvelope') OR g.funding_mode<>'existing-credit'
   OR jsonb_typeof(v_auth) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_auth))<>6
   OR v_auth->>'schema' IS DISTINCT FROM 'task217-funding-snapshot-use-v1'
   OR coalesce(v_auth->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR coalesce(v_auth->>'financialSnapshotSha256','') !~ '^[a-f0-9]{64}$'
   OR coalesce(v_auth->>'measurementPermitSha256','') !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedAtMs','expiresAtMs']) k WHERE
    jsonb_typeof(v_auth->k) IS DISTINCT FROM 'number' OR coalesce(v_auth->>k,'') !~ '^[0-9]{1,16}$')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['grantId','provider','model','environment','accountId','projectId','mode',
    'currency','serviceTier','evidenceSha256','credentialSha256','autoReload','postpaid','overdraft','concurrentAccountUsage']) k
    WHERE coalesce(v_proof->>k,'') !~ '^[a-zA-Z0-9._:-]{1,100}$')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedCreditMicros','remainingCreditMicros']) k WHERE
    jsonb_typeof(v_proof->k) IS DISTINCT FROM 'number' OR coalesce(v_proof->>k,'') !~ '^[0-9]{1,16}$') THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
  SELECT jsonb_agg(v_proof->k ORDER BY ord) INTO v_financial FROM unnest(ARRAY[
   'grantId','provider','model','environment','accountId','projectId','mode','currency','serviceTier',
   'authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs',
   'autoReload','postpaid','overdraft','concurrentAccountUsage']) WITH ORDINALITY AS keys(k,ord);
  -- All strings in this tuple are whitespace-free validated identifiers. Separator
  -- removal matches JSON.stringify of the same ordered primitive tuple, not objects.
  IF encode(sha256(convert_to(replace(v_financial::text,' ',''),'UTF8')),'hex') IS DISTINCT FROM v_auth->>'financialSnapshotSha256'
   OR (v_auth->>'authorizedAtMs')::bigint<v_verified OR (v_auth->>'authorizedAtMs')::bigint>v_now_ms
   OR (v_auth->>'expiresAtMs')::bigint<=v_now_ms
   OR (v_auth->>'expiresAtMs')::bigint-(v_auth->>'authorizedAtMs')::bigint NOT BETWEEN 1 AND 3600000 THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
  v_verified:=(v_auth->>'authorizedAtMs')::bigint; v_expires:=(v_auth->>'expiresAtMs')::bigint;
 ELSIF v_expires<=v_now_ms AND NOT(v_limited AND coalesce((v_proof->'limitedOperation') ? 'financialSnapshotSha256',false)) THEN RETURN jsonb_build_object('decision','denied');
 END IF;

 -- Both operation kinds consume the SAME permanent Task217 envelope.
 v_pilot:=g.proof ? 'pilotEnvelope';
 IF v_measurement AND NOT v_pilot THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF g.funding_mode='existing-credit' AND g.provider NOT IN ('openai','anthropic') AND NOT v_pilot AND NOT v_limited THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 IF v_limited THEN
  v_auth:=g.proof->'limitedOperation';
  IF v_measurement OR v_pilot OR v_snapshot OR g.proof ? 'measurementPermit'
   OR g.funding_mode<>'existing-credit' OR g.provider NOT IN ('openai','anthropic','gemini','xai','deepseek','qwen','mistral')
   OR jsonb_typeof(v_auth) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_auth))<>(CASE WHEN v_auth ? 'financialSnapshotSha256' OR v_auth ? 'sourceGrantId' THEN 11 ELSE 9 END)
   OR v_auth->>'schema' IS DISTINCT FROM 'task217-limited-operation-v1'
   OR coalesce(v_auth->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR v_auth->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
   OR v_auth->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb OR v_auth->'maxAttempts' IS DISTINCT FROM '28'::jsonb
   OR v_auth->>'dataScope' IS DISTINCT FROM 'redacted-travel-or-server-units'
   OR v_auth->>'providerRisk' IS DISTINCT FROM 'overdraft-unknown'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedAtMs','expiresAtMs']) k WHERE
    jsonb_typeof(v_auth->k) IS DISTINCT FROM 'number' OR coalesce(v_auth->>k,'') !~ '^[0-9]{1,16}$') THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
  IF (v_auth->>'authorizedAtMs')::bigint>v_now_ms OR (v_auth->>'expiresAtMs')::bigint<=v_now_ms
   OR (v_auth->>'expiresAtMs')::bigint-(v_auth->>'authorizedAtMs')::bigint NOT BETWEEN 1 AND 3600000 THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
  IF v_auth ? 'financialSnapshotSha256' OR v_auth ? 'sourceGrantId' THEN
   IF coalesce(v_auth->>'sourceGrantId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR v_auth->>'sourceGrantId'=g.id::text OR coalesce(v_auth->>'financialSnapshotSha256','') !~ '^[a-f0-9]{64}$'
    OR (v_auth->>'authorizedAtMs')::bigint<v_verified THEN RETURN jsonb_build_object('decision','denied'); END IF;
   SELECT * INTO v_source FROM private.dabra_dialogue_funding_grants WHERE id=(v_auth->>'sourceGrantId')::uuid;
   IF NOT FOUND OR NOT(v_source.proof ? 'pilotEnvelope') OR v_source.proof ? 'limitedOperation'
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['provider','model','environment','accountId','projectId','mode','currency','serviceTier','authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs','autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE v_source.proof->k IS DISTINCT FROM v_proof->k) THEN
    RETURN jsonb_build_object('decision','denied'); END IF;
   SELECT jsonb_agg(v_source.proof->k ORDER BY ord) INTO v_financial FROM unnest(ARRAY['grantId','provider','model','environment','accountId','projectId','mode','currency','serviceTier','authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs','autoReload','postpaid','overdraft','concurrentAccountUsage']) WITH ORDINALITY keys(k,ord);
   IF encode(sha256(convert_to(replace(v_financial::text,' ',''),'UTF8')),'hex') IS DISTINCT FROM v_auth->>'financialSnapshotSha256' THEN
    RETURN jsonb_build_object('decision','denied'); END IF;
   -- The observation is unchanged. This separate authority accepts its age only.
   v_verified:=(v_auth->>'authorizedAtMs')::bigint; v_expires:=(v_auth->>'expiresAtMs')::bigint;
  ELSE
   v_expires:=least(v_expires,(v_auth->>'expiresAtMs')::bigint);
  END IF;
  IF EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id AND stage=p_stage AND subject_hash=p_subject_hash) THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;
 IF v_pilot OR v_limited THEN
  IF v_pilot AND (NOT v_measurement OR g.funding_mode<>'existing-credit'
   OR g.proof->'pilotEnvelope' IS DISTINCT FROM '{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb) THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
  SELECT coalesce(sum(greatest(pg.reserved_credit_micros,coalesce(a.cost,0))),0) INTO pilot_holds
   FROM private.dabra_dialogue_funding_grants pg LEFT JOIN LATERAL (
    SELECT sum(cost_micros) AS cost FROM private.dabra_dialogue_admissions WHERE grant_id=pg.id
   ) a ON true WHERE pg.proof ? 'pilotEnvelope' OR pg.proof ? 'limitedOperation';
  SELECT count(*) INTO pilot_calls
   FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id
   WHERE pg.proof ? 'pilotEnvelope' OR pg.proof ? 'limitedOperation';
  IF pilot_holds+p_cost_micros>1000000 OR pilot_calls+1>28
   OR (v_pilot AND (SELECT count(*) FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id
     WHERE pg.proof ? 'pilotEnvelope' AND pg.provider=g.provider)>=4) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;

 END IF;

 -- Exactly one branch. Invalid measurement never falls into ordinary qualification.
 IF v_measurement THEN
  v_permit:=g.proof->'measurementPermit';
  IF jsonb_typeof(v_permit) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_permit))<>9
   OR v_permit->>'schema' IS DISTINCT FROM 'task217-first-profile-v1'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['planId','sourceSha','caseSetSha','subjectHash']) k WHERE jsonb_typeof(v_permit->k) IS DISTINCT FROM 'string')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['expiresAtMs','inputTokenCeiling','outputTokenCeiling']) k WHERE jsonb_typeof(v_permit->k) IS DISTINCT FROM 'number')
   OR v_permit->>'planId' IS DISTINCT FROM v_request->>'planId'
   OR coalesce(v_permit->>'sourceSha','') !~ '^[a-f0-9]{40}$'
   OR coalesce(v_permit->>'caseSetSha','') !~ '^[a-f0-9]{64}$'
   OR v_permit->>'subjectHash' IS DISTINCT FROM p_subject_hash
   OR coalesce(v_permit->>'expiresAtMs','') !~ '^[0-9]{1,16}$'
   OR coalesce(v_permit->>'inputTokenCeiling','') !~ '^[1-9][0-9]{0,3}$'
   OR coalesce(v_permit->>'outputTokenCeiling','') !~ '^[1-9][0-9]{0,3}$'
   OR jsonb_typeof(v_permit->'cases') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (v_permit->>'expiresAtMs')::bigint<=v_now_ms
   OR (v_permit->>'expiresAtMs')::bigint>v_expires
   OR (v_permit->>'inputTokenCeiling')::integer IS DISTINCT FROM p_input_tokens
   OR (v_permit->>'outputTokenCeiling')::integer IS DISTINCT FROM p_output_tokens
   OR jsonb_array_length(v_permit->'cases')<>4 THEN RETURN jsonb_build_object('decision','denied'); END IF;
  FOR v_case IN SELECT value FROM jsonb_array_elements(v_permit->'cases') LOOP
   IF jsonb_typeof(v_case) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(v_case))<>4
    OR coalesce(v_case->>'caseId','') NOT IN ('intent-ar','intent-en','discover-ar','discover-en')
    OR coalesce(v_case->>'requestId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR v_case->>'stage' IS DISTINCT FROM (CASE WHEN v_case->>'caseId' IN ('intent-ar','intent-en') THEN 'intent.classify' ELSE 'discover' END)
    OR v_case->>'language' IS DISTINCT FROM (CASE WHEN v_case->>'caseId' IN ('intent-ar','discover-ar') THEN 'ar' ELSE 'en' END) THEN
    RETURN jsonb_build_object('decision','denied');
   END IF;
   IF v_case->>'caseId'=v_request->>'caseId' THEN v_case_match:=v_case; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'caseId') FROM jsonb_array_elements(v_permit->'cases'))<>4
   OR (SELECT count(DISTINCT value->>'requestId') FROM jsonb_array_elements(v_permit->'cases'))<>4
   OR v_case_match IS NULL OR v_case_match->>'requestId' IS DISTINCT FROM p_request_id::text
   OR v_case_match->>'stage' IS DISTINCT FROM p_stage
   -- Same lock and durable ledger, independent of attempt, worker, subject, session or day.
   OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id) THEN
   RETURN jsonb_build_object('decision','denied');
  END IF;
  IF v_snapshot THEN
   v_case_index:=array_position(ARRAY['intent-ar','intent-en','discover-ar','discover-en'],v_request->>'caseId');
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_permit->'cases') WITH ORDINALITY c(value,ord)
    WHERE value->>'caseId' IS DISTINCT FROM (ARRAY['intent-ar','intent-en','discover-ar','discover-en'])[ord]) THEN
    RETURN jsonb_build_object('decision','denied'); END IF;
   SELECT jsonb_agg(jsonb_build_array(value->'caseId',value->'requestId',value->'stage',value->'language') ORDER BY ord)
    INTO v_case_values FROM jsonb_array_elements(v_permit->'cases') WITH ORDINALITY c(value,ord);
   IF encode(sha256(convert_to(replace(jsonb_build_array(v_permit->'schema',v_permit->'planId',v_permit->'sourceSha',
     v_permit->'caseSetSha',v_permit->'subjectHash',v_permit->'expiresAtMs',v_permit->'inputTokenCeiling',
     v_permit->'outputTokenCeiling',v_case_values)::text,' ',''),'UTF8')),'hex')
     IS DISTINCT FROM v_auth->>'measurementPermitSha256' THEN RETURN jsonb_build_object('decision','denied'); END IF;
   -- The first admission is the durable owner of this authorization. New/restarted
   -- processes cannot join it, skip consumed cases, or mint another four calls.
   IF v_case_index=1 THEN
    IF p_attempt_id::text IS DISTINCT FROM v_request->>'runId'
     OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id) THEN
     RETURN jsonb_build_object('decision','denied'); END IF;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id
      AND request_id=(v_permit->'cases'->0->>'requestId')::uuid AND attempt_id=(v_request->>'runId')::uuid)
     OR (SELECT count(*) FROM private.dabra_dialogue_admissions WHERE grant_id=g.id)<>v_case_index-1
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_permit->'cases') WITH ORDINALITY c(value,ord) WHERE ord<v_case_index
       AND NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions a WHERE a.grant_id=g.id
        AND a.request_id=(value->>'requestId')::uuid AND a.stage=value->>'stage' AND a.subject_hash=p_subject_hash)) THEN
     RETURN jsonb_build_object('decision','denied'); END IF;
   END IF;
  END IF;
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(
   CASE WHEN jsonb_typeof(g.proof->'measurementPermit'->'cases')='array' THEN g.proof->'measurementPermit'->'cases' ELSE '[]'::jsonb END) v
   WHERE v->>'requestId'=p_request_id::text) THEN
  -- A qualified ordinary caller cannot replay an approved measurement request without its envelope.
  RETURN jsonb_build_object('decision','denied');
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.profiles) profile WHERE profile->>'provider'=g.provider
   AND profile->'measurement'->>'model'=v_proof->>'model' AND profile->'measurement'->>'capability'=p_stage) THEN
  RETURN jsonb_build_object('decision','denied');
 END IF;
 IF v_durable THEN q_start:=v_day; q_end:=v_day+86400000;
 ELSE q_start:=(v_proof->>'quotaWindowStartMs')::bigint; q_end:=(v_proof->>'quotaWindowEndMs')::bigint; END IF;
 IF q_start>v_now_ms OR q_end<=v_now_ms THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF v_durable THEN
  -- v_quote was recomputed above from the exact public observation and fixed all-in basis.
  IF g.reserved_credit_micros+v_quote>1000000 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 ELSIF g.funding_mode='existing-credit' THEN
  IF coalesce(v_proof->>'authorizedCreditMicros','') !~ '^[0-9]{1,16}$' OR coalesce(v_proof->>'remainingCreditMicros','') !~ '^[0-9]{1,16}$'
   OR v_proof->>'currency' IS DISTINCT FROM 'USD' OR v_proof->>'serviceTier' IS DISTINCT FROM 'standard'
   OR v_proof->>'pricing' IS DISTINCT FROM 'standard-2026-10-28'
   OR (v_proof->>'authorizedCreditMicros')::bigint IS DISTINCT FROM g.authorized_credit_micros
   OR g.input_rate_micros_per_million IS NULL OR g.output_rate_micros_per_million IS NULL
   OR g.pricing_expires_at IS NULL OR g.pricing_expires_at<=v_now THEN RETURN jsonb_build_object('decision','denied'); END IF;
  v_quote:=ceil((p_input_tokens::numeric*g.input_rate_micros_per_million+p_output_tokens::numeric*g.output_rate_micros_per_million)/1000000)::bigint;
  IF v_pilot OR v_limited THEN
   v_bound:=v_proof->'allInChargeBound';
   IF jsonb_typeof(v_bound) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
   IF (SELECT count(*) FROM jsonb_object_keys(v_bound))<>6
    OR v_bound->>'schema' IS DISTINCT FROM 'all-in-charge-bound-v1' OR v_bound->>'currency' IS DISTINCT FROM 'USD'
    OR v_bound->>'coverage' IS DISTINCT FROM 'all-applicable-api-charges'
    OR jsonb_typeof(v_bound->'maxAdditionalMicros') IS DISTINCT FROM 'number'
    OR coalesce(v_bound->>'maxAdditionalMicros','') !~ '^[0-9]{1,7}$'
    OR jsonb_typeof(v_bound->'observedAtMs') IS DISTINCT FROM 'number'
    OR coalesce(v_bound->>'observedAtMs','') !~ '^[0-9]{1,16}$'
    OR coalesce(v_bound->>'evidenceSha256','') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('decision','denied'); END IF;
   v_extra:=(v_bound->>'maxAdditionalMicros')::bigint;
   IF v_extra>1000000 OR (v_bound->>'observedAtMs')::bigint>v_verified
    OR v_expires-(v_bound->>'observedAtMs')::bigint>3600000 THEN RETURN jsonb_build_object('decision','denied'); END IF;
   -- Pricing observation is independently current and matches the stored grant's genuine token rates.
   IF coalesce(v_proof->>'pricingEvidenceSha256','') !~ '^[a-f0-9]{64}$'
    OR v_proof->'pricingVerification'->>'schema' IS DISTINCT FROM 'standard-pricing-verification-v1'
    OR coalesce(v_proof->'pricingVerification'->>'observedAtMs','') !~ '^[0-9]{1,16}$'
    OR coalesce(v_proof->'pricingVerification'->>'inputMicrosPerMillion','') !~ '^[0-9]{1,16}$'
    OR coalesce(v_proof->'pricingVerification'->>'outputMicrosPerMillion','') !~ '^[0-9]{1,16}$'
    OR coalesce(v_proof->'pricingVerification'->>'evidenceSha256','') !~ '^[a-f0-9]{64}$'
    OR v_proof->'pricingVerification'->>'snapshotSha256' IS DISTINCT FROM v_proof->>'pricingEvidenceSha256' THEN
    RETURN jsonb_build_object('decision','denied'); END IF;
   IF (v_proof->'pricingVerification'->>'inputMicrosPerMillion')::bigint IS DISTINCT FROM g.input_rate_micros_per_million
    OR (v_proof->'pricingVerification'->>'outputMicrosPerMillion')::bigint IS DISTINCT FROM g.output_rate_micros_per_million
    OR (v_proof->'pricingVerification'->>'observedAtMs')::bigint>v_verified
    OR v_expires-(v_proof->'pricingVerification'->>'observedAtMs')::bigint>3600000 THEN
    RETURN jsonb_build_object('decision','denied'); END IF;
   v_quote:=v_quote+v_extra;
  END IF;
  IF p_cost_micros<>v_quote OR v_quote<=0 OR g.reserved_credit_micros+v_quote>g.authorized_credit_micros
   OR g.reserved_credit_micros+v_quote>(v_proof->>'remainingCreditMicros')::bigint THEN RETURN jsonb_build_object('decision','denied'); END IF;
 ELSE
  IF v_proof->>'enforcement' IS DISTINCT FROM 'provider-hard-no-new-charge' OR p_cost_micros<>0 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;
 SELECT count(*),count(DISTINCT subject_hash),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0),
  count(*) FILTER(WHERE subject_hash=p_subject_hash),coalesce(sum(input_tokens) FILTER(WHERE subject_hash=p_subject_hash),0),
  coalesce(sum(output_tokens) FILTER(WHERE subject_hash=p_subject_hash),0)
 INTO total_calls,users,total_input,total_output,user_calls,user_input,user_output FROM private.dabra_dialogue_admissions WHERE day_start_ms=v_day;
 IF (user_calls=0 AND users>=(p_limits->>'uniqueUsers')::integer)
  OR user_calls+1>(p_limits->>'requestsPerUser')::integer OR total_calls+1>(p_limits->>'requestsTotal')::integer
  OR user_input+p_input_tokens>(p_limits->>'inputTokensPerUser')::integer OR user_output+p_output_tokens>(p_limits->>'outputTokensPerUser')::integer
  OR total_input+p_input_tokens>(p_limits->>'inputTokensTotal')::integer OR total_output+p_output_tokens>(p_limits->>'outputTokensTotal')::integer THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 IF NOT v_durable THEN
 SELECT count(*),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0) INTO quota_calls,quota_input,quota_output
 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND quota_start_ms=q_start AND quota_end_ms=q_end;
 IF quota_calls+1>(v_proof->>'remainingRequests')::bigint OR quota_input+p_input_tokens>(v_proof->>'remainingInputTokens')::bigint
  OR quota_output+p_output_tokens>(v_proof->>'remainingOutputTokens')::bigint THEN RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;
 -- T217-CONT-S1: every funding mode uses the same non-renewing task envelope.
 -- The transaction already holds the shared advisory lock; no network or reset.
 SELECT coalesce(sum(greatest(pg.reserved_credit_micros,coalesce(a.cost,0))),0) INTO pilot_holds
 FROM private.dabra_dialogue_funding_grants pg LEFT JOIN LATERAL (
  SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=pg.id
 ) a ON true;
 SELECT count(*) INTO pilot_calls FROM private.dabra_dialogue_admissions a
 JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id;
 IF pilot_holds+p_cost_micros>1000000 OR pilot_calls+1>28 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+p_cost_micros WHERE id=g.id;
 INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros,execution_pricing)
 VALUES(p_attempt_id,p_request_id,p_stage,p_subject_hash,g.id,v_day,q_start,q_end,p_input_tokens,p_output_tokens,p_cost_micros,CASE WHEN v_durable THEN v_execution ELSE NULL END);
 -- Holds never expire/refund/reset automatically, including cancellations, failed/unknown provider results and new application days.
 IF v_durable THEN
  RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,'pricing_expires_at_ms',(v_observation->>'expiresAtMs')::bigint);
 END IF;
 IF v_snapshot OR v_limited THEN
  -- Bind the independent price deadline to this attempt's durable receipt. The
  -- original proof stays unchanged and policy reloads cannot extend this bound.
  RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,
   'pricing_expires_at_ms',floor(extract(epoch FROM g.pricing_expires_at)*1000)::bigint);
 END IF;
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id);
END $$;
CREATE OR REPLACE FUNCTION private.protect_dabra_dialogue_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source private.dabra_dialogue_funding_grants%ROWTYPE; v_financial jsonb; v_auth jsonb;
 g private.dabra_dialogue_funding_grants%ROWTYPE; v_proof jsonb; v_now_ms bigint; v_terms jsonb; v_risks jsonb; v_protection jsonb; v_charge jsonb; v_tuple jsonb;
 v_contract text; v_rate_input bigint; v_rate_output bigint; v_tariff_before_ms bigint;
BEGIN
 -- Qualification purpose is never converted into a Customer standing grant.
 IF TG_OP='DELETE' THEN
  IF OLD.funding_mode='bounded-account-qualification' THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_IMMUTABLE'; END IF;
 ELSIF NEW.funding_mode='bounded-account-qualification' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
  IF TG_OP='UPDATE' THEN
   IF to_jsonb(NEW)-ARRAY['enabled','reserved_credit_micros']::text[] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['enabled','reserved_credit_micros']::text[]
    OR NEW.reserved_credit_micros<OLD.reserved_credit_micros
    OR (NEW.reserved_credit_micros>OLD.reserved_credit_micros AND NOT NEW.enabled) THEN
    RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_IMMUTABLE'; END IF;
   -- An expired/revoked run can always be disabled without re-dating its proof.
   IF NOT NEW.enabled AND NEW.reserved_credit_micros=OLD.reserved_credit_micros THEN RETURN NEW; END IF;
  END IF;
  IF private.valid_dabra_qualification_grant(NEW,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) IS NOT TRUE THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_AUTHORITY_INVALID'; END IF;
  RETURN NEW;
 ELSIF TG_OP='UPDATE' AND OLD.funding_mode='bounded-account-qualification' THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_IMMUTABLE';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF TG_OP='DELETE' THEN
  IF OLD.proof ? 'limitedOperation' THEN RAISE EXCEPTION 'DIALOGUE_LIMITED_IMMUTABLE'; END IF;
  IF OLD.proof ? 'pilotEnvelope' THEN RAISE EXCEPTION 'DIALOGUE_PILOT_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.provider IS DISTINCT FROM OLD.provider
   OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
   OR NEW.funding_mode IS DISTINCT FROM OLD.funding_mode OR NEW.authorized_credit_micros IS DISTINCT FROM OLD.authorized_credit_micros
   OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at OR NEW.reserved_credit_micros<OLD.reserved_credit_micros THEN
   RAISE EXCEPTION 'DIALOGUE_GRANT_IMMUTABLE';
  END IF;
  -- A referenced source and the accepted observation cannot be re-dated or replaced.
  IF (EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other
    WHERE other.proof->'limitedOperation'->>'sourceGrantId'=OLD.id::text)
    OR coalesce((OLD.proof->'limitedOperation') ? 'financialSnapshotSha256',false))
   AND EXISTS(SELECT 1 FROM unnest(ARRAY['grantId','provider','model','environment','accountId','projectId','mode','currency','serviceTier','authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs','autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE NEW.proof->k IS DISTINCT FROM OLD.proof->k) THEN
   RAISE EXCEPTION 'DIALOGUE_LIMITED_FINANCIAL_IMMUTABLE';
  END IF;
  -- Both presence and exact marker are immutable from INSERT, including absence on ordinary grants.
  IF (NEW.proof ? 'pilotEnvelope') IS DISTINCT FROM (OLD.proof ? 'pilotEnvelope')
   OR NEW.proof->'pilotEnvelope' IS DISTINCT FROM OLD.proof->'pilotEnvelope' THEN
   RAISE EXCEPTION 'DIALOGUE_PILOT_IMMUTABLE';
  END IF;
  IF OLD.proof ? 'measurementPermit' AND (
   NEW.proof->'measurementPermit' IS DISTINCT FROM OLD.proof->'measurementPermit'
   OR NEW.proof->>'model' IS DISTINCT FROM OLD.proof->>'model'
   OR NEW.proof->>'environment' IS DISTINCT FROM OLD.proof->>'environment'
   OR NEW.proof->>'credentialSha256' IS DISTINCT FROM OLD.proof->>'credentialSha256') THEN
   RAISE EXCEPTION 'DIALOGUE_MEASUREMENT_IMMUTABLE';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND (
  (NEW.proof ? 'limitedOperation') IS DISTINCT FROM (OLD.proof ? 'limitedOperation')
  OR (OLD.proof ? 'limitedOperation' AND (
   NEW.proof->'limitedOperation' IS DISTINCT FROM OLD.proof->'limitedOperation'
   OR NEW.proof->>'model' IS DISTINCT FROM OLD.proof->>'model'
   OR NEW.proof->>'environment' IS DISTINCT FROM OLD.proof->>'environment'
   OR NEW.proof->>'credentialSha256' IS DISTINCT FROM OLD.proof->>'credentialSha256'))) THEN
  RAISE EXCEPTION 'DIALOGUE_LIMITED_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' AND OLD.funding_mode='bounded-account-charge' AND (
  NEW.proof IS DISTINCT FROM OLD.proof OR NEW.input_rate_micros_per_million IS DISTINCT FROM OLD.input_rate_micros_per_million
  OR NEW.output_rate_micros_per_million IS DISTINCT FROM OLD.output_rate_micros_per_million OR NEW.pricing_expires_at IS DISTINCT FROM OLD.pricing_expires_at) THEN
  RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_IMMUTABLE'; END IF;
 IF NEW.funding_mode='bounded-account-charge' THEN
  g:=NEW; v_proof:=NEW.proof; v_now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;

 v_auth:=v_proof->'limitedOperation'; v_terms:=v_proof->'accountTerms';
 IF jsonb_typeof(v_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(v_auth) IS DISTINCT FROM 'object'
  OR jsonb_typeof(v_terms) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_proof))<>14 OR v_proof-ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256','accountTerms','limitedOperation']::text[]<>'{}'::jsonb
  OR g.funding_mode<>'bounded-account-charge' OR g.authorized_credit_micros<>0 OR g.pricing_expires_at IS NOT NULL
  OR v_proof->>'mode' IS DISTINCT FROM g.funding_mode OR v_proof->>'grantId' IS DISTINCT FROM g.id::text
  OR v_proof->>'provider' IS DISTINCT FROM g.provider OR v_proof->>'accountId' IS DISTINCT FROM g.account_id
  OR v_proof->>'projectId' IS DISTINCT FROM g.project_id OR v_proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
  OR v_proof->>'currency' IS DISTINCT FROM 'USD' OR v_proof->>'serviceTier' IS DISTINCT FROM 'standard'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['mode','grantId','provider','model','environment','accountId','projectId','credentialSha256','evidenceSha256','currency','serviceTier','pricingEvidenceSha256']) k WHERE jsonb_typeof(v_proof->k) IS DISTINCT FROM 'string')
  OR coalesce(v_proof->>'model','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['credentialSha256','evidenceSha256','pricingEvidenceSha256']) k WHERE coalesce(v_proof->>k,'') !~ '^[a-f0-9]{64}$')
  OR (SELECT count(*) FROM jsonb_object_keys(v_auth))<>12
  OR v_auth-ARRAY['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','duration','providerRisk','acceptedProfileSha256s','contractSha256','bindingSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorizationId','taskId','dataScope','duration','providerRisk','contractSha256','bindingSha256']) k WHERE jsonb_typeof(v_auth->k) IS DISTINCT FROM 'string')
  OR v_auth->>'schema' IS DISTINCT FROM 'task217-limited-operation-v2'
  OR coalesce(v_auth->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR v_auth->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
  OR v_auth->>'dataScope' IS DISTINCT FROM 'redacted-travel-or-server-units'
  OR v_auth->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb OR v_auth->'maxAttempts' IS DISTINCT FROM '28'::jsonb
  OR v_auth->>'duration' IS DISTINCT FROM 'until-revoked-or-binding-change'
  OR v_auth->>'providerRisk' IS DISTINCT FROM 'bounded-account-liability-with-observed-risks'
  OR jsonb_typeof(v_auth->'authorizedAtMs') IS DISTINCT FROM 'number'
  OR coalesce(v_auth->>'authorizedAtMs','') !~ '^[0-9]{1,16}$'
  OR coalesce(v_auth->>'bindingSha256','') !~ '^[a-f0-9]{64}$'
  OR coalesce(v_auth->>'contractSha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v_auth->'acceptedProfileSha256s') IS DISTINCT FROM 'array'
  OR (SELECT count(*) FROM jsonb_object_keys(v_terms))<>7
  OR v_terms-ARRAY['schema','observedAtMs','evidenceSha256','validity','risks','fundingChargeProtection','allInChargeBound']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','evidenceSha256','validity']) k WHERE jsonb_typeof(v_terms->k) IS DISTINCT FROM 'string')
  OR v_terms->>'schema' IS DISTINCT FROM 'task217-account-charge-terms-v1'
  OR v_terms->>'validity' IS DISTINCT FROM 'until-contract-change'
  OR coalesce(v_terms->>'evidenceSha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v_terms->'observedAtMs') IS DISTINCT FROM 'number'
  OR coalesce(v_terms->>'observedAtMs','') !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 IF (v_auth->>'authorizedAtMs')::bigint NOT BETWEEN 0 AND least(v_now_ms,9007199254740991)
  OR floor(extract(epoch FROM g.authorized_at)*1000)::bigint IS DISTINCT FROM (v_auth->>'authorizedAtMs')::bigint
  OR (v_terms->>'observedAtMs')::bigint>(v_auth->>'authorizedAtMs')::bigint
  OR jsonb_array_length(v_auth->'acceptedProfileSha256s') NOT BETWEEN 1 AND 4
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_auth->'acceptedProfileSha256s') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' !~ '^[a-f0-9]{64}$')
  OR EXISTS(SELECT 1 FROM (SELECT value#>>'{}' item,lag(value#>>'{}') OVER(ORDER BY ord) prior FROM jsonb_array_elements(v_auth->'acceptedProfileSha256s') WITH ORDINALITY t(value,ord)) p WHERE prior>=item)
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other WHERE other.id<>g.id
    AND other.proof->'limitedOperation'->>'authorizationId'=v_auth->>'authorizationId') THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 v_risks:=v_terms->'risks'; v_protection:=v_terms->'fundingChargeProtection'; v_charge:=v_terms->'allInChargeBound';
 IF jsonb_typeof(v_risks) IS DISTINCT FROM 'object' OR jsonb_typeof(v_protection) IS DISTINCT FROM 'object'
  OR jsonb_typeof(v_charge) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v_risks))<>4
  OR v_risks-ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE jsonb_typeof(v_risks->k) IS DISTINCT FROM 'string')
  OR coalesce(v_risks->>'autoReload','') NOT IN ('off','unknown')
  OR coalesce(v_risks->>'postpaid','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_risks->>'overdraft','') NOT IN ('blocked','allowed','unknown')
  OR coalesce(v_risks->>'concurrentAccountUsage','') NOT IN ('bounded','unknown')
  OR (SELECT count(*) FROM jsonb_object_keys(v_protection))<>2 OR v_protection-ARRAY['kind','evidenceSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['kind','evidenceSha256']) k WHERE jsonb_typeof(v_protection->k) IS DISTINCT FROM 'string')
  OR coalesce(v_protection->>'kind','') NOT IN ('documented-manual-funding-only','documented-no-automatic-funding','provider-enforced-no-funding')
  OR coalesce(v_protection->>'evidenceSha256','') !~ '^[a-f0-9]{64}$'
  OR (SELECT count(*) FROM jsonb_object_keys(v_charge))<>5 OR v_charge-ARRAY['schema','currency','coverage','maxAdditionalMicros','evidenceSha256']::text[]<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','currency','coverage','evidenceSha256']) k WHERE jsonb_typeof(v_charge->k) IS DISTINCT FROM 'string')
  OR v_charge->>'schema' IS DISTINCT FROM 'all-in-account-charge-bound-v1' OR v_charge->>'currency' IS DISTINCT FROM 'USD'
  OR v_charge->>'coverage' IS DISTINCT FROM 'all-applicable-api-tax-fx-and-funding-charges'
  OR jsonb_typeof(v_charge->'maxAdditionalMicros') IS DISTINCT FROM 'number'
  OR coalesce(v_charge->>'maxAdditionalMicros','') !~ '^[0-9]{1,7}$'
  OR coalesce(v_charge->>'evidenceSha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 IF (v_charge->>'maxAdditionalMicros')::bigint>1000000 THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 SELECT r.contract,r.input_rate,r.output_rate,r.tariff_before_ms INTO v_contract,v_rate_input,v_rate_output,v_tariff_before_ms
 FROM (VALUES ('openai','gpt-6-luna','f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a','187f81010403df589d73368809106b52c25e3fe093ae5559d4ba14efeb343ee9',100000,500000,NULL::bigint),
('anthropic','claude-sonnet-5-5','97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4','51208c2b11b6d744ae57fcb4316c2b4b38cadcc01152da0ce158cc6a3657615c',2000000,10000000,NULL::bigint),
('gemini','gemini-3.8-flash','3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f','098195ab8b022de0499e94a4bd31379c144591556a503d5c6175383e944d54b4',750000,3750000,1798761600000::bigint),
('xai','grok-4.20-0309-non-reasoning','fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb','95028669dc240f0fe171a719b9f01c982dffcfbc1197a7ecf6f089cadf82cc14',1250000,2500000,NULL::bigint),
('deepseek','deepseek-flash','760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927','1a7e56eed7ab6c7c6e009c18a3d225d7ab8448abbe5b44a0300036b37ae9182e',300000,1200000,NULL::bigint),
('qwen','qwen3.8-flash','7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb','1c6c91f883b20fb56e05f336bc58a85b84fc875e67fb9356971f18ea51477032',150000,470000,NULL::bigint),
('mistral','mistral-small-2603','72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3','369e80769ebb120922a3878d60f8a7ff34c0a1e460bea6f145cfb3a9e46b3f75',150000,600000,NULL::bigint)) r(provider,model,pricing,contract,input_rate,output_rate,tariff_before_ms)
 WHERE r.provider=g.provider AND r.model=v_proof->>'model' AND r.pricing=v_proof->>'pricingEvidenceSha256';
 IF NOT FOUND OR v_contract IS DISTINCT FROM v_auth->>'contractSha256'
  OR v_rate_input IS DISTINCT FROM g.input_rate_micros_per_million
  OR v_rate_output IS DISTINCT FROM g.output_rate_micros_per_million THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;
 v_tuple:=jsonb_build_array(v_proof->'grantId',v_proof->'provider',v_proof->'model',v_proof->'environment',
  v_proof->'accountId',v_proof->'projectId',v_proof->'credentialSha256',v_proof->'evidenceSha256',
  v_proof->'mode',v_proof->'currency',v_proof->'serviceTier',v_proof->'pricingEvidenceSha256',
  v_auth->'schema',v_auth->'authorizationId',v_auth->'taskId',v_auth->'dataScope',v_auth->'maxCostMicros',
  v_auth->'maxAttempts',v_auth->'authorizedAtMs',v_auth->'duration',v_auth->'providerRisk',v_auth->'acceptedProfileSha256s',v_auth->'contractSha256',
  v_terms->'schema',v_terms->'observedAtMs',v_terms->'evidenceSha256',v_terms->'validity',
  v_risks->'autoReload',v_risks->'postpaid',v_risks->'overdraft',v_risks->'concurrentAccountUsage',
  v_protection->'kind',v_protection->'evidenceSha256',v_charge->'schema',v_charge->'currency',v_charge->'coverage',
  v_charge->'maxAdditionalMicros',v_charge->'evidenceSha256');
 IF encode(sha256(convert_to(replace(v_tuple::text,' ',''),'UTF8')),'hex') IS DISTINCT FROM v_auth->>'bindingSha256' THEN RAISE EXCEPTION 'DIALOGUE_DURABLE_AUTHORITY_REQUIRED'; END IF;

  RETURN NEW;
 END IF;
 IF NEW.proof ? 'limitedOperation' THEN
  IF NEW.proof ? 'pilotEnvelope' OR NEW.proof ? 'measurementPermit' OR NEW.proof ? 'snapshotUse'
   OR NEW.funding_mode<>'existing-credit' OR NEW.provider NOT IN ('openai','anthropic','gemini','xai','deepseek','qwen','mistral')
   OR NEW.proof->>'grantId' IS DISTINCT FROM NEW.id::text OR NEW.proof->>'provider' IS DISTINCT FROM NEW.provider
   OR NEW.proof->>'accountId' IS DISTINCT FROM NEW.account_id OR NEW.proof->>'projectId' IS DISTINCT FROM NEW.project_id
   OR NEW.proof->>'mode' IS DISTINCT FROM NEW.funding_mode OR NEW.proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
   OR coalesce(NEW.proof->>'credentialSha256','') !~ '^[a-f0-9]{64}$'
   OR jsonb_typeof(NEW.proof->'limitedOperation') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.proof->'limitedOperation'))<>(CASE WHEN (NEW.proof->'limitedOperation') ? 'financialSnapshotSha256' OR (NEW.proof->'limitedOperation') ? 'sourceGrantId' THEN 11 ELSE 9 END)
   OR NEW.proof->'limitedOperation'->>'schema' IS DISTINCT FROM 'task217-limited-operation-v1'
   OR coalesce(NEW.proof->'limitedOperation'->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR NEW.proof->'limitedOperation'->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
   OR NEW.proof->'limitedOperation'->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb
   OR NEW.proof->'limitedOperation'->'maxAttempts' IS DISTINCT FROM '28'::jsonb
   OR NEW.proof->'limitedOperation'->>'dataScope' IS DISTINCT FROM 'redacted-travel-or-server-units'
   OR NEW.proof->'limitedOperation'->>'providerRisk' IS DISTINCT FROM 'overdraft-unknown'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedAtMs','expiresAtMs']) k WHERE
    jsonb_typeof(NEW.proof->'limitedOperation'->k) IS DISTINCT FROM 'number'
    OR coalesce(NEW.proof->'limitedOperation'->>k,'') !~ '^[0-9]{1,16}$') THEN
   RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
  IF (NEW.proof->'limitedOperation'->>'expiresAtMs')::bigint-(NEW.proof->'limitedOperation'->>'authorizedAtMs')::bigint NOT BETWEEN 1 AND 3600000 THEN
   RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
  v_auth:=NEW.proof->'limitedOperation';
  IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other WHERE other.id<>NEW.id
    AND other.proof->'limitedOperation'->>'authorizationId'=v_auth->>'authorizationId') THEN
   RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
  IF v_auth ? 'financialSnapshotSha256' OR v_auth ? 'sourceGrantId' THEN
   IF coalesce(v_auth->>'sourceGrantId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR v_auth->>'sourceGrantId'=NEW.id::text OR coalesce(v_auth->>'financialSnapshotSha256','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
   SELECT * INTO v_source FROM private.dabra_dialogue_funding_grants WHERE id=(v_auth->>'sourceGrantId')::uuid;
   IF NOT FOUND OR NOT(v_source.proof ? 'pilotEnvelope') OR v_source.proof ? 'limitedOperation'
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['provider','model','environment','accountId','projectId','mode','currency','serviceTier','authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs','autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE v_source.proof->k IS DISTINCT FROM NEW.proof->k)
    OR EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other WHERE other.id<>NEW.id AND (
      other.proof->'limitedOperation'->>'sourceGrantId'=v_auth->>'sourceGrantId'
      OR other.proof->'limitedOperation'->>'financialSnapshotSha256'=v_auth->>'financialSnapshotSha256')) THEN
    RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
   SELECT jsonb_agg(v_source.proof->k ORDER BY ord) INTO v_financial FROM unnest(ARRAY['grantId','provider','model','environment','accountId','projectId','mode','currency','serviceTier','authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs','autoReload','postpaid','overdraft','concurrentAccountUsage']) WITH ORDINALITY keys(k,ord);
   IF encode(sha256(convert_to(replace(v_financial::text,' ',''),'UTF8')),'hex') IS DISTINCT FROM v_auth->>'financialSnapshotSha256' THEN
    RAISE EXCEPTION 'DIALOGUE_LIMITED_BINDING_REQUIRED'; END IF;
  END IF;
 END IF;
 IF NEW.proof ? 'pilotEnvelope' THEN
  IF NEW.proof->'pilotEnvelope' IS DISTINCT FROM '{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb
   OR NEW.funding_mode<>'existing-credit' OR jsonb_typeof(NEW.proof->'measurementPermit') IS DISTINCT FROM 'object'
   OR NEW.proof->>'grantId' IS DISTINCT FROM NEW.id::text OR NEW.proof->>'provider' IS DISTINCT FROM NEW.provider
   OR NEW.proof->>'accountId' IS DISTINCT FROM NEW.account_id OR NEW.proof->>'projectId' IS DISTINCT FROM NEW.project_id
   OR NEW.proof->>'mode' IS DISTINCT FROM NEW.funding_mode
   OR NEW.proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
   OR coalesce(NEW.proof->>'model','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$'
   OR coalesce(NEW.proof->>'credentialSha256','') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'DIALOGUE_PILOT_BINDING_REQUIRED';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.proof ? 'snapshotUse' AND NEW.proof->'snapshotUse' IS DISTINCT FROM OLD.proof->'snapshotUse' THEN
   RAISE EXCEPTION 'DIALOGUE_SNAPSHOT_USE_IMMUTABLE';
  END IF;
  -- Adding the authorization also preserves the original observation byte-for-byte
  -- as JSON values; a later observation cannot be disguised as the saved snapshot.
  IF NEW.proof ? 'snapshotUse' AND EXISTS(SELECT 1 FROM unnest(ARRAY[
   'grantId','provider','model','environment','accountId','projectId','mode','currency','serviceTier',
   'authorizedCreditMicros','remainingCreditMicros','evidenceSha256','credentialSha256','verifiedAtMs','expiresAtMs',
   'autoReload','postpaid','overdraft','concurrentAccountUsage']) k WHERE NEW.proof->k IS DISTINCT FROM OLD.proof->k) THEN
   RAISE EXCEPTION 'DIALOGUE_SNAPSHOT_FINANCIAL_IMMUTABLE';
  END IF;
 END IF;
 IF NEW.proof ? 'snapshotUse' THEN
  IF NOT(NEW.proof ? 'pilotEnvelope') OR jsonb_typeof(NEW.proof->'snapshotUse') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'DIALOGUE_SNAPSHOT_USE_BINDING_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.proof->'snapshotUse'))<>6
   OR NEW.proof->'snapshotUse'->>'schema' IS DISTINCT FROM 'task217-funding-snapshot-use-v1'
   OR coalesce(NEW.proof->'snapshotUse'->>'authorizationId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants other WHERE other.id<>NEW.id
     AND other.proof->'snapshotUse'->>'authorizationId'=NEW.proof->'snapshotUse'->>'authorizationId') THEN
   RAISE EXCEPTION 'DIALOGUE_SNAPSHOT_USE_BINDING_REQUIRED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.protect_dabra_pilot_admission()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=OLD.grant_id AND (proof ? 'pilotEnvelope' OR funding_mode IN('bounded-account-charge','bounded-account-qualification'))) THEN
  RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=NEW.grant_id AND (proof ? 'pilotEnvelope' OR funding_mode IN('bounded-account-charge','bounded-account-qualification'))) THEN
   RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
  END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
-- Existing RPC/trigger OID, owner and ACL preserved; new private functions revoked.
-- No counter, old observation, admission or control value is deleted/reset/seeded.
COMMIT;
