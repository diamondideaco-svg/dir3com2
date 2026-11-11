-- Local preparation only. production_apply_authorized=false.
-- No approval, enabled authority, grant, credential or financial data is seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'TASK217_POSTGRES_OWNER_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('private.valid_dabra_qualification_proof(jsonb,bigint)') AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='c2cf1a65d90df643c538e1e1178df03c723d1eb7fe522d24098b04505779d50b') THEN RAISE EXCEPTION 'TASK217_BILINGUAL_BASELINE_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('private.reserve_dabra_qualification_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)') AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d2e1e782c1bb7dee65af733e620507e08c8eec832bf66b48725eaca0d5255809') THEN RAISE EXCEPTION 'TASK217_BILINGUAL_BASELINE_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('private.protect_dabra_qualification_insert()') AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='8f9f9a0ad25f48d4ca34a12268a142eeea5beb2b40402519cc0727d6e426501f') THEN RAISE EXCEPTION 'TASK217_BILINGUAL_BASELINE_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.get_dabra_dialogue_qualification_plan(uuid,text)') AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='66983d4ca9d4bf0af808d78e5f3d958de448b78c27ea4e027f94a9747580009a') THEN RAISE EXCEPTION 'TASK217_BILINGUAL_BASELINE_REQUIRED'; END IF;
END $baseline$;
ALTER TABLE private.dabra_dialogue_funding_control ADD COLUMN qualification_authority jsonb;

CREATE FUNCTION private.task217_bilingual_daily()
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT '{"uniqueUsers":1,"requestsPerUser":56,"requestsTotal":56,"inputTokensPerUser":229376,"outputTokensPerUser":57344,"inputTokensTotal":229376,"outputTokensTotal":57344}'::jsonb
$$;

CREATE FUNCTION private.task217_qualification_history()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 WITH providers AS (SELECT unnest(ARRAY['openai','gemini','anthropic','xai','deepseek','qwen','mistral']) provider),
 counts AS (SELECT p.provider,count(a.attempt_id) calls FROM providers p
  LEFT JOIN private.dabra_dialogue_funding_grants g ON g.provider=p.provider
  LEFT JOIN private.dabra_dialogue_admissions a ON a.grant_id=g.id GROUP BY p.provider),
 holds AS (SELECT coalesce(sum(greatest(g.reserved_credit_micros,coalesce(a.cost,0))),0) cost
  FROM private.dabra_dialogue_funding_grants g LEFT JOIN LATERAL
   (SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=g.id) a ON true)
 SELECT jsonb_build_object('ledgerSha256',encode(sha256(convert_to(jsonb_build_array(
   (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.id),'[]'::jsonb) FROM private.dabra_dialogue_funding_grants g),
   (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attempt_id),'[]'::jsonb) FROM private.dabra_dialogue_admissions a))::text,'UTF8')),'hex'),
  'attempts',(SELECT count(*) FROM private.dabra_dialogue_admissions),'heldCostMicros',(SELECT cost FROM holds),
  'providerAttempts',(SELECT jsonb_object_agg(provider,calls) FROM counts))
$$;

CREATE FUNCTION private.task217_bilingual_binding(a jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(replace(jsonb_build_array(a->'schema',a->'authorizationId',a->'approvalEvidenceSha256',
  a->'sourceSha',a->'subjectHash',a->'authorizedAtMs',a->'expiresAtMs',a->'baseline'->'ledgerSha256',
  a->'baseline'->'attempts',a->'baseline'->'heldCostMicros',
  (SELECT jsonb_agg(jsonb_build_array(p,a->'baseline'->'providerAttempts'->p) ORDER BY ord)
   FROM unnest(ARRAY['openai','gemini','anthropic','xai','deepseek','qwen','mistral']) WITH ORDINALITY x(p,ord)),
  a->'maxAttempts',a->'maxCostMicros',a->'maxAttemptCostMicros',jsonb_build_array(
   a->'dailyLimits'->'uniqueUsers',a->'dailyLimits'->'requestsPerUser',a->'dailyLimits'->'requestsTotal',
   a->'dailyLimits'->'inputTokensPerUser',a->'dailyLimits'->'outputTokensPerUser',a->'dailyLimits'->'inputTokensTotal',a->'dailyLimits'->'outputTokensTotal'),
  a->'runTimeoutMs',(SELECT jsonb_agg(jsonb_build_array(p->'provider',p->'grantId',p->'planId',p->'factsSha256') ORDER BY ord)
   FROM jsonb_array_elements(a->'plans') WITH ORDINALITY x(p,ord)))::text,' ',''),'UTF8')),'hex')
$$;

CREATE FUNCTION private.valid_task217_bilingual_authority(a jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE b jsonb;p jsonb;n jsonb;provider text;idx integer:=0;total numeric:=0;
BEGIN
 IF p_now IS NULL OR p_now<0 OR NOT private.dabra_qualification_exact_keys(a,ARRAY['schema','enabled','authorizationId','approvalEvidenceSha256',
  'sourceSha','subjectHash','authorizedAtMs','expiresAtMs','baseline','maxAttempts','maxCostMicros','maxAttemptCostMicros','dailyLimits','runTimeoutMs','plans','bindingSha256'])
  OR a->>'schema' IS DISTINCT FROM 'task217-bilingual-qualification-authority-v1' OR a->'enabled' IS DISTINCT FROM 'true'::jsonb
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorizationId','approvalEvidenceSha256','sourceSha','subjectHash','bindingSha256']) k WHERE jsonb_typeof(a->k) IS DISTINCT FROM 'string')
  OR coalesce(a->>'authorizationId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(a->>'sourceSha','')!~'^[a-f0-9]{40}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['approvalEvidenceSha256','subjectHash','bindingSha256']) k WHERE coalesce(a->>k,'')!~'^[a-f0-9]{64}$')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['authorizedAtMs','expiresAtMs','maxAttempts','maxCostMicros','maxAttemptCostMicros','runTimeoutMs']) k
   WHERE jsonb_typeof(a->k) IS DISTINCT FROM 'number' OR coalesce(a->>k,'')!~'^[0-9]{1,16}$' OR (a->>k)::numeric>9007199254740991)
  OR (a->>'authorizedAtMs')::numeric>p_now OR (a->>'expiresAtMs')::numeric<=p_now
  OR (a->>'expiresAtMs')::numeric-(a->>'authorizedAtMs')::numeric NOT BETWEEN 1 AND 3600000
  OR a->'maxAttemptCostMicros' IS DISTINCT FROM '18432'::jsonb OR a->'runTimeoutMs' IS DISTINCT FROM '120000'::jsonb
  OR a->'dailyLimits' IS DISTINCT FROM private.task217_bilingual_daily()
  OR jsonb_typeof(a->'plans') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'plans')<>7 THEN RETURN false; END IF;
 b:=a->'baseline';
 IF NOT private.dabra_qualification_exact_keys(b,ARRAY['ledgerSha256','attempts','heldCostMicros','providerAttempts'])
  OR jsonb_typeof(b->'ledgerSha256') IS DISTINCT FROM 'string' OR coalesce(b->>'ledgerSha256','')!~'^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['attempts','heldCostMicros']) k WHERE jsonb_typeof(b->k) IS DISTINCT FROM 'number'
   OR coalesce(b->>k,'')!~'^[0-9]{1,16}$' OR (b->>k)::numeric>9007199254740991)
  OR NOT private.dabra_qualification_exact_keys(b->'providerAttempts',ARRAY['openai','gemini','anthropic','xai','deepseek','qwen','mistral'])
  OR (a->>'maxAttempts')::numeric<>(b->>'attempts')::numeric+56
  OR (a->>'maxCostMicros')::numeric NOT BETWEEN 1 AND 1000000
  OR (b->>'heldCostMicros')::numeric>(a->>'maxCostMicros')::numeric THEN RETURN false; END IF;
 FOREACH provider IN ARRAY ARRAY['openai','gemini','anthropic','xai','deepseek','qwen','mistral'] LOOP
  n:=b->'providerAttempts'->provider;p:=a->'plans'->idx;idx:=idx+1;
  IF jsonb_typeof(n) IS DISTINCT FROM 'number' OR coalesce(n#>>'{}','')!~'^[0-9]{1,16}$'
   OR (n#>>'{}')::numeric>(b->>'attempts')::numeric
   OR NOT private.dabra_qualification_exact_keys(p,ARRAY['provider','grantId','planId','factsSha256'])
   OR EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
   OR p->>'provider' IS DISTINCT FROM provider OR coalesce(p->>'factsSha256','')!~'^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['grantId','planId']) k WHERE coalesce(p->>k,'')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RETURN false; END IF;
  total:=total+(n#>>'{}')::numeric;
 END LOOP;
 RETURN coalesce(total=(b->>'attempts')::numeric
  AND (SELECT count(DISTINCT entry.value->>'grantId') FROM jsonb_array_elements(a->'plans') entry(value))=7
  AND (SELECT count(DISTINCT entry.value->>'planId') FROM jsonb_array_elements(a->'plans') entry(value))=7
  AND private.task217_bilingual_binding(a)=a->>'bindingSha256',false);
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;

-- A statement-level lock precedes row locks, matching reservation lock order.
CREATE FUNCTION private.lock_task217_qualification_control()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF TG_OP='TRUNCATE' AND EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_control WHERE qualification_authority IS NOT NULL) THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_AUTHORITY_IMMUTABLE'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER lock_task217_qualification_control BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON private.dabra_dialogue_funding_control FOR EACH STATEMENT EXECUTE FUNCTION private.lock_task217_qualification_control();

CREATE FUNCTION private.protect_task217_qualification_control()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.qualification_authority IS NOT NULL THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_AUTHORITY_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.qualification_authority IS NOT NULL THEN
  IF NEW.qualification_authority IS NOT DISTINCT FROM OLD.qualification_authority THEN RETURN NEW; END IF;
  -- Only terminal revocation is mutable; no clear, replacement, re-date or refill.
  IF OLD.qualification_authority->'enabled'='true'::jsonb
   AND NEW.qualification_authority=jsonb_set(OLD.qualification_authority,'{enabled}','false'::jsonb) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_AUTHORITY_IMMUTABLE';
 END IF;
 IF NEW.qualification_authority IS NULL THEN RETURN NEW; END IF;
 IF private.valid_task217_bilingual_authority(NEW.qualification_authority,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) IS NOT TRUE
  OR NEW.qualification_authority->'baseline' IS DISTINCT FROM private.task217_qualification_history() THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_APPROVAL_SNAPSHOT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_task217_qualification_control BEFORE INSERT OR UPDATE OR DELETE
 ON private.dabra_dialogue_funding_control FOR EACH ROW EXECUTE FUNCTION private.protect_task217_qualification_control();

CREATE FUNCTION private.task217_qualification_plan_facts(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 WITH parts AS (SELECT p->'accountTerms' t,p->'limitedOperation'->'permit' q),
 facts AS (SELECT t,q,t->'risks' r,t->'fundingChargeProtection' f,t->'allInChargeBound' b FROM parts)
 SELECT encode(sha256(convert_to(replace(jsonb_build_array(p->'mode',p->'grantId',p->'provider',p->'model',p->'environment',
  p->'accountId',p->'projectId',p->'credentialSha256',p->'evidenceSha256',p->'currency',p->'serviceTier',p->'pricingEvidenceSha256',p->'limitedOperation'->'contractSha256',
  t->'schema',t->'observedAtMs',t->'evidenceSha256',t->'validity',r->'autoReload',r->'postpaid',r->'overdraft',r->'concurrentAccountUsage',
  f->'kind',f->'evidenceSha256',b->'schema',b->'currency',b->'coverage',b->'maxAdditionalMicros',b->'evidenceSha256',
  q->'schema',q->'purpose',q->'planId',q->'sourceSha',q->'caseSetSha',q->'subjectHash',q->'languages',q->'authorizedAtMs',q->'expiresAtMs',
  q->'inputTokenCeiling',q->'outputTokenCeiling',(SELECT jsonb_agg(jsonb_build_array(c->'caseId',c->'requestId',c->'stage',c->'language',c->'inputSha256',c->'contractSha256') ORDER BY ord)
   FROM jsonb_array_elements(q->'cases') WITH ORDINALITY x(c,ord)))::text,' ',''),'UTF8')),'hex') FROM facts
$$;

CREATE FUNCTION private.valid_task217_bilingual_plan(p jsonb,h jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb:=p->'limitedOperation';q jsonb:=a->'permit';
BEGIN
 IF private.valid_task217_bilingual_authority(h,p_now) IS NOT TRUE THEN RETURN false; END IF;
 RETURN coalesce(a->>'schema'='task217-profile-qualification-authority-v2' AND a->'authoritySha256'=h->'bindingSha256'
  AND a->'authorizationId'=h->'authorizationId' AND a->'authorizedAtMs'=h->'authorizedAtMs'
  AND a->'maxCostMicros'=h->'maxCostMicros' AND a->'maxAttempts'=h->'maxAttempts'
  AND q->'sourceSha'=h->'sourceSha' AND q->'subjectHash'=h->'subjectHash'
  AND (q->>'expiresAtMs')::numeric<=(h->>'expiresAtMs')::numeric
  AND q->>'schema'='task217-platform-dialogue-measurement-v2' AND q->'languages'='["ar","en"]'::jsonb
  AND jsonb_array_length(q->'cases')=8
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(h->'plans') plan WHERE plan->'provider'=p->'provider'
   AND plan->'grantId'=p->'grantId' AND plan->'planId'=q->'planId' AND plan->>'factsSha256'=private.task217_qualification_plan_facts(p)),false);
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;

-- Serialize direct writes before row locks, in the same order as the RPC.
-- TRUNCATE bypasses row triggers, so both shared ledgers need a statement guard.
CREATE FUNCTION private.lock_task217_qualification_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF TG_OP='TRUNCATE' AND EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_control WHERE qualification_authority IS NOT NULL) THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_HISTORY_IMMUTABLE'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER lock_task217_qualification_grants BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON private.dabra_dialogue_funding_grants FOR EACH STATEMENT EXECUTE FUNCTION private.lock_task217_qualification_ledger();
CREATE TRIGGER lock_task217_qualification_admissions BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON private.dabra_dialogue_admissions FOR EACH STATEMENT EXECUTE FUNCTION private.lock_task217_qualification_ledger();

CREATE FUNCTION private.protect_task217_qualification_history()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 -- Revocation/expiry does not release history or make an old approval reusable.
 IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_control WHERE qualification_authority IS NOT NULL) THEN
  RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_task217_qualification_history BEFORE UPDATE OR DELETE
 ON private.dabra_dialogue_admissions FOR EACH ROW EXECUTE FUNCTION private.protect_task217_qualification_history();

CREATE FUNCTION private.protect_task217_bilingual_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE h jsonb;
BEGIN
 SELECT qualification_authority INTO h FROM private.dabra_dialogue_funding_control WHERE singleton=true;
 IF TG_OP='DELETE' THEN
  IF h IS NOT NULL AND (OLD.reserved_credit_micros>0 OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=OLD.id)) THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_HISTORY_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.proof->'limitedOperation'->>'schema'='task217-profile-qualification-authority-v2' THEN
  -- Initial enablement is INSERT only, with no pre-held credit and a matching
  -- active authority. Once disabled, even an unused v2 grant cannot re-enable.
  IF TG_OP='INSERT' AND (NOT NEW.enabled OR NEW.reserved_credit_micros<>0
   OR private.valid_task217_bilingual_plan(NEW.proof,h,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) IS NOT TRUE) THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_INITIAL_ENABLE_REQUIRED'; END IF;
  IF TG_OP='UPDATE' AND NOT OLD.enabled AND NEW.enabled THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_GRANT_REVOKED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_task217_bilingual_grant BEFORE INSERT OR UPDATE OR DELETE
 ON private.dabra_dialogue_funding_grants FOR EACH ROW EXECUTE FUNCTION private.protect_task217_bilingual_grant();

-- Complete private preflight: all seven exact stored proofs, pinned rates and
-- documented account extras must exist and fit. Missing evidence is never zero.
CREATE FUNCTION private.task217_bilingual_batch(h jsonb,p_now bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE plan jsonb;g private.dabra_dialogue_funding_grants;q jsonb;price jsonb;
 proofs jsonb:='[]'::jsonb;quote numeric;total numeric:=0;per_attempt bigint;cases_available boolean;
BEGIN
 IF private.valid_task217_bilingual_authority(h,p_now) IS NOT TRUE THEN RETURN NULL; END IF;
 SELECT least(max_attempt_cost_micros,(h->>'maxAttemptCostMicros')::bigint) INTO per_attempt
  FROM private.dabra_dialogue_funding_control WHERE singleton AND enabled AND qualification_authority=h;
 IF NOT FOUND THEN RETURN NULL; END IF;
 FOR plan IN SELECT value FROM jsonb_array_elements(h->'plans') LOOP
  SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=(plan->>'grantId')::uuid;
  IF NOT FOUND OR NOT g.enabled OR private.valid_dabra_qualification_grant(g,p_now) IS NOT TRUE
   OR private.valid_task217_bilingual_plan(g.proof,h,p_now) IS NOT TRUE THEN RETURN NULL; END IF;
  q:=g.proof->'limitedOperation'->'permit';
  SELECT value INTO price FROM jsonb_array_elements(private.task217_output_contract_manifest()->'pricing') WHERE value->>'provider'=g.provider;
  IF NOT FOUND OR (price->'tariffBeforeMs'<>'null'::jsonb AND p_now>=(price->>'tariffBeforeMs')::numeric) THEN RETURN NULL; END IF;
  quote:=ceil(((q->>'inputTokenCeiling')::numeric*g.input_rate_micros_per_million
   +(q->>'outputTokenCeiling')::numeric*g.output_rate_micros_per_million)/1000000)
   +(g.proof->'accountTerms'->'allInChargeBound'->>'maxAdditionalMicros')::numeric;
  IF quote IS NULL OR quote NOT BETWEEN 1 AND per_attempt THEN RETURN NULL; END IF;
  total:=total+quote*jsonb_array_length(q->'cases');proofs:=proofs||jsonb_build_array(g.proof);
 END LOOP;
 IF jsonb_array_length(proofs)<>7 OR total<=0 OR total+(h->'baseline'->>'heldCostMicros')::numeric>(h->>'maxCostMicros')::numeric THEN RETURN NULL; END IF;
 -- Every planned request and qualification key must be distinct and unused,
 -- except immutable admissions from this exact plan's anchored original run.
 -- This permits authority re-reads after claims without permitting a replacement.
 WITH cases AS (
  SELECT p.value AS proof,c.value AS item,(c.value->>'requestId')::uuid AS request_id,
   encode(sha256(convert_to(replace(jsonb_build_array(p.value->'limitedOperation'->'taskId',p.value->'provider',
    p.value->'limitedOperation'->'permit'->'caseSetSha',c.value->'caseId')::text,' ',''),'UTF8')),'hex') AS case_key
  FROM jsonb_array_elements(proofs) p CROSS JOIN LATERAL jsonb_array_elements(p.value->'limitedOperation'->'permit'->'cases') c)
 SELECT count(*)=56 AND count(DISTINCT request_id)=56 AND count(DISTINCT case_key)=56
  AND NOT EXISTS(SELECT 1 FROM cases x JOIN private.dabra_public_dialogue_admissions a ON a.request_id=x.request_id)
  AND NOT EXISTS(SELECT 1 FROM cases x JOIN private.dabra_dialogue_admissions a ON a.request_id=x.request_id
   OR (a.execution_pricing->>'schema'='task217-qualification-execution-v1' AND a.execution_pricing->>'qualificationKey'=x.case_key)
   WHERE (a.grant_id=(x.proof->>'grantId')::uuid AND a.request_id=x.request_id AND a.stage=x.item->>'stage'
    AND a.subject_hash=h->>'subjectHash' AND a.execution_pricing->>'schema'='task217-qualification-execution-v1'
    AND a.execution_pricing->>'qualificationKey'=x.case_key AND a.execution_pricing->>'caseId'=x.item->>'caseId'
    AND a.execution_pricing->>'planId'=x.proof->'limitedOperation'->'permit'->>'planId'
    AND a.execution_pricing->>'authorityBindingSha256'=x.proof->'limitedOperation'->>'bindingSha256'
    AND a.execution_pricing->>'inputSha256'=x.item->>'inputSha256' AND a.execution_pricing->>'contractSha256'=x.item->>'contractSha256'
    AND EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions first_call
     WHERE first_call.grant_id=a.grant_id
      AND first_call.request_id=(x.proof->'limitedOperation'->'permit'->'cases'->0->>'requestId')::uuid
      AND first_call.attempt_id::text=a.execution_pricing->>'runId'
      AND first_call.execution_pricing->>'runId'=a.execution_pricing->>'runId'
      AND first_call.execution_pricing->>'planId'=a.execution_pricing->>'planId'
      AND first_call.execution_pricing->>'authorityBindingSha256'=a.execution_pricing->>'authorityBindingSha256')) IS NOT TRUE)
 INTO cases_available FROM cases;
 IF cases_available IS NOT TRUE THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('proofs',proofs,'costMicros',total);
EXCEPTION WHEN data_exception THEN RETURN NULL;
END $$;

-- Both admission paths use all historical rows and outstanding excess holds.
CREATE FUNCTION private.task217_bilingual_room(g private.dabra_dialogue_funding_grants,h jsonb,
 cost bigint,inp integer,outp integer,subject text,day bigint,group_count integer,already_reserved boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE calls bigint;provider_calls bigint;holds numeric;needed integer:=group_count; money numeric;batch jsonb;
 total_calls bigint;user_calls bigint;users bigint;total_input bigint;total_output bigint;user_input bigint;user_output bigint;
BEGIN
 IF group_count NOT IN(1,8) OR cost NOT BETWEEN 1 AND 18432 OR inp NOT BETWEEN 1 AND 4096 OR outp NOT BETWEEN 1 AND 1024 THEN RETURN false; END IF;
 batch:=private.task217_bilingual_batch(h,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 IF batch IS NULL THEN RETURN false; END IF;
 SELECT count(*) INTO calls FROM private.dabra_dialogue_admissions;
 SELECT count(*) INTO provider_calls FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id WHERE pg.provider=g.provider;
 SELECT coalesce(sum(greatest(pg.reserved_credit_micros,coalesce(a.cost,0))),0) INTO holds
 FROM private.dabra_dialogue_funding_grants pg LEFT JOIN LATERAL
  (SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=pg.id) a ON true;
 IF provider_calls+group_count>(h->'baseline'->'providerAttempts'->>g.provider)::bigint+8 THEN RETURN false; END IF;
 money:=cost::numeric*group_count;
 -- Before the very first campaign admission, the complete 56-case window must fit.
 IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id
  WHERE pg.proof->'limitedOperation'->'authoritySha256'=h->'bindingSha256') THEN needed:=56;money:=(batch->>'costMicros')::numeric; END IF;
 IF already_reserved THEN money:=money-cost; END IF;
 IF calls+needed>(h->>'maxAttempts')::bigint OR holds+money>(h->>'maxCostMicros')::numeric THEN RETURN false; END IF;
 SELECT count(*),count(DISTINCT subject_hash),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0),
  count(*) FILTER(WHERE subject_hash=subject),coalesce(sum(input_tokens) FILTER(WHERE subject_hash=subject),0),coalesce(sum(output_tokens) FILTER(WHERE subject_hash=subject),0)
 INTO total_calls,users,total_input,total_output,user_calls,user_input,user_output FROM private.dabra_dialogue_admissions WHERE day_start_ms=day;
 RETURN coalesce(total_calls+needed<=56 AND user_calls+needed<=56 AND (user_calls>0 OR users=0)
  AND total_input+inp::bigint*needed<=229376 AND user_input+inp::bigint*needed<=229376
  AND total_output+outp::bigint*needed<=57344 AND user_output+outp::bigint*needed<=57344,false);
END $$;


ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_check1;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_check1 CHECK(
 (funding_mode='existing-credit' AND authorized_credit_micros>0 AND(
  (provider IN('openai','anthropic') AND NOT(proof ? 'pilotEnvelope')) OR
  (proof ? 'pilotEnvelope' AND proof->'pilotEnvelope'='{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb) OR
  (proof ? 'limitedOperation' AND NOT(proof ? 'pilotEnvelope'))))
 OR(funding_mode='no-new-charge' AND provider NOT IN('openai','anthropic') AND authorized_credit_micros=0 AND NOT(proof ? 'pilotEnvelope'))
 OR(funding_mode='bounded-account-charge' AND authorized_credit_micros=0 AND proof->'limitedOperation'->>'schema'='task217-limited-operation-v2')
 OR(funding_mode='bounded-account-qualification' AND authorized_credit_micros=0 AND proof->'limitedOperation'->>'schema' IN('task217-profile-qualification-authority-v1','task217-profile-qualification-authority-v2')));

CREATE OR REPLACE FUNCTION private.valid_dabra_qualification_proof(p jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE h jsonb; a jsonb;t jsonb;r jsonb;f jsonb;b jsonb;q jsonb;price jsonb;c jsonb;expected jsonb;
 tuple jsonb;case_values jsonb:='[]'::jsonb;idx integer:=0;manifest jsonb:=private.task217_output_contract_manifest(); contract_id text; cases_per_language integer;
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
 IF NOT private.dabra_qualification_exact_keys(a,ARRAY['schema','authorizationId','taskId','dataScope','maxCostMicros','maxAttempts','authorizedAtMs','contractSha256','permit','bindingSha256']||CASE WHEN a->>'schema'='task217-profile-qualification-authority-v2' THEN ARRAY['authoritySha256'] ELSE ARRAY[]::text[] END)
  OR NOT private.dabra_qualification_exact_keys(t,ARRAY['schema','observedAtMs','evidenceSha256','validity','risks','fundingChargeProtection','allInChargeBound'])
  OR NOT private.dabra_qualification_exact_keys(r,ARRAY['autoReload','postpaid','overdraft','concurrentAccountUsage'])
  OR NOT private.dabra_qualification_exact_keys(f,ARRAY['kind','evidenceSha256'])
  OR NOT private.dabra_qualification_exact_keys(b,ARRAY['schema','currency','coverage','maxAdditionalMicros','evidenceSha256'])
  OR NOT private.dabra_qualification_exact_keys(q,ARRAY['schema','purpose','planId','sourceSha','caseSetSha','subjectHash','languages','authorizedAtMs','expiresAtMs','inputTokenCeiling','outputTokenCeiling','cases']) THEN RETURN false; END IF;
 IF coalesce(a->>'schema','') NOT IN('task217-profile-qualification-authority-v1','task217-profile-qualification-authority-v2')
  OR coalesce(a->>'authorizationId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR a->>'taskId' IS DISTINCT FROM 'task217-text-pilot-2026-11-01'
  OR a->>'dataScope' IS DISTINCT FROM 'canonical-synthetic-measurement'
  OR (a->>'schema'='task217-profile-qualification-authority-v1' AND (a->'maxCostMicros' IS DISTINCT FROM '1000000'::jsonb OR a->'maxAttempts' IS DISTINCT FROM '28'::jsonb))
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
 IF a->>'schema'='task217-profile-qualification-authority-v2' THEN
  SELECT qualification_authority INTO h FROM private.dabra_dialogue_funding_control WHERE singleton=true;
  IF NOT FOUND OR jsonb_typeof(a->'authoritySha256') IS DISTINCT FROM 'string'
   OR private.valid_task217_bilingual_plan(p,h,p_now) IS NOT TRUE THEN RETURN false; END IF;
 END IF;
 -- Prevent JSON scalar coercion of every enum/string in the bound tuple.
 IF EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','authorizationId','taskId','dataScope','contractSha256','bindingSha256']) k WHERE jsonb_typeof(a->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','evidenceSha256','validity']) k WHERE jsonb_typeof(t->k) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM jsonb_each(f) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['schema','currency','coverage','evidenceSha256']) k WHERE jsonb_typeof(b->k) IS DISTINCT FROM 'string') THEN RETURN false; END IF;
 -- Explicit recipes only: legacy permits retain two cases per language;
 -- dialogue-v2 requires its own schema and four canonical cases per language.
 CASE q->>'schema'
  WHEN 'task217-platform-units-measurement-v1' THEN contract_id:='platform-units-v1';cases_per_language:=2;
  WHEN 'task217-platform-dialogue-measurement-v2' THEN contract_id:='platform-dialogue-v2';cases_per_language:=4;
  ELSE RETURN false;
 END CASE;
 IF q->>'purpose' IS DISTINCT FROM 'profile-qualification'
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
  OR jsonb_array_length(q->'cases')<>cases_per_language*jsonb_array_length(q->'languages') THEN RETURN false; END IF;
 -- Each declared language must supply the complete recipe under one contract.
 -- Case labels are unique within a permit because execution resolves by caseId.
 IF (SELECT count(DISTINCT chosen->>'caseId') FROM jsonb_array_elements(q->'cases') chosen)<>jsonb_array_length(q->'cases')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'languages') declared(language)
   WHERE (SELECT count(*) FROM jsonb_array_elements(q->'cases') chosen
    WHERE chosen->>'language'=declared.language)<>cases_per_language
    OR (SELECT count(DISTINCT chosen->>'contractSha256') FROM jsonb_array_elements(q->'cases') chosen
     WHERE chosen->>'language'=declared.language)<>1) THEN RETURN false; END IF;
 -- Resolve the full versioned contract, never the first matching id.
 -- A permit selects one contract per language through its bound case digests.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(q->'cases') chosen
  WHERE (SELECT count(*) FROM jsonb_array_elements(manifest->'contracts') contract
   WHERE contract->>'id'=contract_id
    AND contract->'cases'=to_jsonb(cases_per_language)
    AND contract->>'digest'=chosen->>'contractSha256'
    AND contract->>'language'=chosen->>'language'
    AND contract->>'caseSetSha'=q->>'caseSetSha')<>1) THEN RETURN false; END IF;
 -- Registry case labels are disambiguated by the single contract selected
 -- for each language; duplicate labels within this permit were rejected above.
 FOR expected IN SELECT value FROM jsonb_array_elements(manifest->'cases') WITH ORDINALITY e(value,ord)
  WHERE q->'languages' ? (value->>'language')
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(q->'cases') chosen
    WHERE chosen->>'language'=e.value->>'language'
     AND chosen->>'contractSha256'=e.value->>'contractSha256')
  -- Keep the canonical case-label order across languages, even when their
  -- independently bound contracts select different historical/current versions.
  ORDER BY (SELECT min(baseline.ord) FROM jsonb_array_elements(manifest->'cases') WITH ORDINALITY baseline(value,ord)
   WHERE baseline.value->>'caseId'=e.value->>'caseId'),ord LOOP
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
 IF a->>'schema'='task217-profile-qualification-authority-v2' THEN tuple:=tuple||jsonb_build_array(a->'authoritySha256'); END IF;
 RETURN encode(sha256(convert_to(replace(tuple::text,' ',''),'UTF8')),'hex')=a->>'bindingSha256';
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.get_dabra_dialogue_qualification_plan(p_plan_id uuid,p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g private.dabra_dialogue_funding_grants;c private.dabra_dialogue_funding_control;
 now_ms bigint;batch jsonb;q jsonb;quote bigint;history jsonb;
BEGIN
 IF p_plan_id IS NULL OR p_subject_hash IS NULL OR p_subject_hash!~'^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
 IF NOT FOUND OR NOT c.enabled OR c.max_attempt_cost_micros NOT BETWEEN 1 AND 1000000 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE enabled AND funding_mode='bounded-account-qualification'
  AND proof->'limitedOperation'->'permit'->>'planId'=p_plan_id::text
  AND proof->'limitedOperation'->'permit'->>'subjectHash'=p_subject_hash;
 IF NOT FOUND OR private.valid_dabra_qualification_grant(g,now_ms) IS NOT TRUE THEN RETURN NULL; END IF;
 IF g.proof->'limitedOperation'->>'schema'='task217-profile-qualification-authority-v2' THEN
  -- Legacy v1 retains its original non-locking read. V2 must read fresh
  -- control and grant state after acquiring the shared admission lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
  IF NOT FOUND OR NOT c.enabled OR c.max_attempt_cost_micros NOT BETWEEN 1 AND 1000000 THEN RETURN NULL; END IF;
  SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE enabled AND funding_mode='bounded-account-qualification'
   AND proof->'limitedOperation'->'permit'->>'planId'=p_plan_id::text
   AND proof->'limitedOperation'->'permit'->>'subjectHash'=p_subject_hash;
  IF NOT FOUND OR g.proof->'limitedOperation'->>'schema' IS DISTINCT FROM 'task217-profile-qualification-authority-v2'
   OR private.valid_dabra_qualification_grant(g,now_ms) IS NOT TRUE THEN RETURN NULL; END IF;
  batch:=private.task217_bilingual_batch(c.qualification_authority,now_ms);IF batch IS NULL THEN RETURN NULL; END IF;
  history:=private.task217_qualification_history();
  IF (history->>'heldCostMicros')::numeric>(c.qualification_authority->>'maxCostMicros')::numeric
   OR (history->>'attempts')::numeric>(c.qualification_authority->>'maxAttempts')::numeric THEN RETURN NULL; END IF;
  q:=g.proof->'limitedOperation'->'permit';
  quote:=ceil(((q->>'inputTokenCeiling')::numeric*g.input_rate_micros_per_million+(q->>'outputTokenCeiling')::numeric*g.output_rate_micros_per_million)/1000000)::bigint
   +(g.proof->'accountTerms'->'allInChargeBound'->>'maxAdditionalMicros')::bigint;
  -- Before any unstarted provider's first connection, its full group must fit.
  -- The room helper additionally requires all 56 before the campaign starts.
  -- Re-reads after claims must not demand a ninth or 57th reservation.
  IF NOT EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id)
   AND private.task217_bilingual_room(g,c.qualification_authority,quote,(q->>'inputTokenCeiling')::integer,(q->>'outputTokenCeiling')::integer,p_subject_hash,
    floor((now_ms+10800000)::numeric/86400000)::bigint*86400000-10800000,8,false) IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('schema','task217-stored-qualification-plan-v2','proof',g.proof,
   'dailyLimits',c.qualification_authority->'dailyLimits','maxCostMicros',least(c.max_attempt_cost_micros,(c.qualification_authority->>'maxAttemptCostMicros')::bigint),
   'authority',c.qualification_authority,'proofs',batch->'proofs');
 END IF;
 RETURN jsonb_build_object('schema','task217-stored-qualification-plan-v1','proof',g.proof,'dailyLimits',c.daily_limits,'maxCostMicros',c.max_attempt_cost_micros);
END $$;

CREATE OR REPLACE FUNCTION private.reserve_dabra_qualification_attempt(
 p_attempt_id uuid,p_request_id uuid,p_stage text,p_subject_hash text,p_grant_id uuid,p_proof jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_limits jsonb,p_day_start_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g private.dabra_dialogue_funding_grants;c private.dabra_dialogue_funding_control;
 h jsonb;is_v2 boolean; v_proof jsonb;r jsonb;e jsonb;q jsonb;v_case jsonb;v_index bigint;prior jsonb;prior_index bigint;
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
 IF EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  OR (EXISTS(SELECT 1 FROM private.dabra_public_dialogue_control WHERE singleton AND enabled) AND private.dabra_monthly_liability(
    floor(extract(epoch FROM (date_trunc('month',to_timestamp(now_ms::numeric/1000) AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint,
    floor(extract(epoch FROM ((date_trunc('month',to_timestamp(now_ms::numeric/1000) AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint
   )+p_cost_micros>25000000) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 
 v_day:=floor((now_ms+10800000)::numeric/86400000)::bigint*86400000-10800000;
 SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true FOR SHARE;
 is_v2:=coalesce(p_proof->'limitedOperation'->>'schema'='task217-profile-qualification-authority-v2',false);
 h:=c.qualification_authority;
 IF is_v2 THEN
  IF private.valid_task217_bilingual_plan(p_proof,h,now_ms) IS NOT TRUE THEN RETURN jsonb_build_object('decision','denied'); END IF;
  c.daily_limits:=h->'dailyLimits';
  c.max_attempt_cost_micros:=least(c.max_attempt_cost_micros,(h->>'maxAttemptCostMicros')::bigint);
 END IF;
 IF NOT FOUND OR NOT c.enabled OR p_day_start_ms IS DISTINCT FROM v_day OR p_limits IS DISTINCT FROM c.daily_limits
  OR p_cost_micros NOT BETWEEN 1 AND 1000000 OR p_cost_micros>c.max_attempt_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF NOT is_v2 AND ((p_limits->>'uniqueUsers')::integer NOT BETWEEN 1 AND 20 OR (p_limits->>'requestsPerUser')::integer NOT BETWEEN 1 AND 6
  OR (p_limits->>'requestsTotal')::integer NOT BETWEEN 1 AND 60 OR (p_limits->>'inputTokensPerUser')::integer NOT BETWEEN 1 AND 24576
  OR (p_limits->>'outputTokensPerUser')::integer NOT BETWEEN 1 AND 6144 OR (p_limits->>'inputTokensTotal')::integer NOT BETWEEN 1 AND 245760
  OR (p_limits->>'outputTokensTotal')::integer NOT BETWEEN 1 AND 61440) THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
 IF is_v2 THEN
  IF private.task217_bilingual_room(g,h,p_cost_micros,p_input_tokens,p_output_tokens,p_subject_hash,v_day,
    CASE WHEN v_index=0 THEN 8 ELSE 1 END,false) IS NOT TRUE
   OR (v_index=0 AND now_ms+(CASE WHEN g.provider='mistral' THEN 100200 ELSE 96000 END)>=least((q->>'expiresAtMs')::bigint,v_day+86400000)) THEN
   RETURN jsonb_build_object('decision','denied'); END IF;
 ELSE
 -- Do not start an incomplete language profile when its complete selected case
 -- group already cannot fit the remaining original envelope/provider bound.
 IF holds+p_cost_micros>1000000 OR calls+1>28 OR provider_calls+1>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END)
  OR (v_index=0 AND (holds+p_cost_micros::numeric*plan_count>1000000 OR calls+plan_count>28 OR provider_calls+plan_count>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END))) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 END IF;
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
DECLARE h jsonb;c private.dabra_dialogue_funding_control;g private.dabra_dialogue_funding_grants;e jsonb;q jsonb;idx bigint;item jsonb;prior jsonb;prior_idx bigint;
 now_ms bigint;holds numeric;calls bigint;provider_calls bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 -- Read the committed grant only after the shared lock; a queued insert must
 -- observe a disable that committed while it waited, never a stale row copy.
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=NEW.grant_id FOR SHARE;
 IF NOT FOUND OR g.funding_mode<>'bounded-account-qualification' THEN RETURN NEW; END IF;
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
 IF g.proof->'limitedOperation'->>'schema'='task217-profile-qualification-authority-v2' THEN
  SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true FOR SHARE;h:=c.qualification_authority;
  IF NOT FOUND OR NOT c.enabled OR NEW.cost_micros>c.max_attempt_cost_micros
   OR private.valid_task217_bilingual_plan(g.proof,h,now_ms) IS NOT TRUE
   OR private.task217_bilingual_room(g,h,NEW.cost_micros,NEW.input_tokens,NEW.output_tokens,NEW.subject_hash,NEW.day_start_ms,
    CASE WHEN idx=0 THEN 8 ELSE 1 END,true) IS NOT TRUE
   OR (idx=0 AND now_ms+(CASE WHEN g.provider='mistral' THEN 100200 ELSE 96000 END)>=least((q->>'expiresAtMs')::bigint,NEW.day_start_ms+86400000)) THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ENVELOPE'; END IF;
  IF EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=NEW.request_id OR attempt_id=NEW.attempt_id)
   OR (EXISTS(SELECT 1 FROM private.dabra_public_dialogue_control WHERE singleton AND enabled) AND private.dabra_monthly_liability(
    floor(extract(epoch FROM (date_trunc('month',to_timestamp(now_ms::numeric/1000) AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint,
    floor(extract(epoch FROM ((date_trunc('month',to_timestamp(now_ms::numeric/1000) AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint)>25000000) THEN
   RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ENVELOPE'; END IF;
 ELSE
 IF holds>1000000 OR calls+1>28 OR provider_calls+1>(CASE WHEN g.provider IN ('openai','anthropic') THEN 5 ELSE 4 END) THEN RAISE EXCEPTION 'DIALOGUE_QUALIFICATION_ENVELOPE'; END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.task217_bilingual_daily(),private.task217_qualification_history(),private.task217_bilingual_binding(jsonb),
 private.valid_task217_bilingual_authority(jsonb,bigint),private.lock_task217_qualification_control(),private.protect_task217_qualification_control(),
 private.lock_task217_qualification_ledger(),private.protect_task217_qualification_history(),private.protect_task217_bilingual_grant(),
 private.task217_bilingual_batch(jsonb,bigint),
 private.task217_qualification_plan_facts(jsonb),private.valid_task217_bilingual_plan(jsonb,jsonb,bigint),
 private.task217_bilingual_room(private.dabra_dialogue_funding_grants,jsonb,bigint,integer,integer,text,bigint,integer,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
-- Existing function owners/signatures/ACLs are preserved by CREATE OR REPLACE.
-- No authority or enabled row is inserted. Existing daily controls and credentials are untouched.
COMMIT;
