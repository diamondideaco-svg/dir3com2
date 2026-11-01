-- Task217 forward local review artifact. No enabling data, new tables, public signatures or privileges.
-- Fixed synthetic seven-provider experiment only. Never apply without separate exact-SHA live authorization.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regprocedure('public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)') IS NULL
  OR to_regprocedure('private.protect_dabra_dialogue_grant()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='dabra_dialogue_funding_grants_check1'
    AND conrelid='private.dabra_dialogue_funding_grants'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%funding_mode%') THEN
  RAISE EXCEPTION 'DIALOGUE_FUNDING_BASELINE_REQUIRED';
 END IF;
END $$;
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_check1;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_check1 CHECK (
 (funding_mode='existing-credit' AND authorized_credit_micros>0 AND (
  (provider IN ('openai','anthropic') AND NOT(proof ? 'pilotEnvelope')) OR
  (proof ? 'pilotEnvelope' AND proof->'pilotEnvelope' = '{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb)))
 OR (funding_mode='no-new-charge' AND provider NOT IN ('openai','anthropic') AND authorized_credit_micros=0 AND NOT(proof ? 'pilotEnvelope'))
);
-- One permanent grant/plan per provider. A new account, grant ID or refreshed proof cannot mint four more cases.
CREATE UNIQUE INDEX dabra_task217_pilot_provider ON private.dabra_dialogue_funding_grants(provider) WHERE proof ? 'pilotEnvelope';
CREATE OR REPLACE FUNCTION private.protect_dabra_dialogue_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF TG_OP='DELETE' THEN
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
 RETURN NEW;
END $$;
DROP TRIGGER protect_dabra_dialogue_grant ON private.dabra_dialogue_funding_grants;
CREATE TRIGGER protect_dabra_dialogue_grant BEFORE INSERT OR UPDATE OR DELETE ON private.dabra_dialogue_funding_grants
 FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_dialogue_grant();
CREATE FUNCTION private.protect_dabra_pilot_admission()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=OLD.grant_id AND proof ? 'pilotEnvelope') THEN
  RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=NEW.grant_id AND proof ? 'pilotEnvelope') THEN
   RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
  END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.protect_dabra_pilot_admission() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_dabra_pilot_admission BEFORE UPDATE OR DELETE ON private.dabra_dialogue_admissions
 FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_pilot_admission();

CREATE OR REPLACE FUNCTION public.reserve_dabra_dialogue_attempt(
 p_attempt_id uuid,p_request_id uuid,p_stage text,p_subject_hash text,p_grant_id uuid,p_proof jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_limits jsonb,p_day_start_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 c private.dabra_dialogue_funding_control%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 v_now timestamptz; v_now_ms bigint; v_day bigint; q_start bigint; q_end bigint; v_quote bigint;
 total_calls bigint; user_calls bigint; users bigint; total_input bigint; total_output bigint; user_input bigint; user_output bigint;
 v_pilot boolean; pilot_holds numeric; pilot_cost numeric; pilot_calls bigint; v_bound jsonb; v_extra bigint;
 quota_calls bigint; quota_input bigint; quota_output bigint;
 v_proof jsonb; v_measurement boolean; v_request jsonb; v_permit jsonb; v_case jsonb; v_case_match jsonb;
BEGIN
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_measurement:=p_proof ? 'measurementRequest';
 v_proof:=p_proof;
 IF v_measurement THEN
  v_request:=p_proof->'measurementRequest';
  IF jsonb_typeof(v_request) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_request))<>2
   OR coalesce(v_request->>'planId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR coalesce(v_request->>'caseId','') NOT IN ('intent-ar','intent-en','discover-ar','discover-en') THEN
   RETURN jsonb_build_object('decision','denied');
  END IF;
  v_proof:=p_proof-'measurementRequest';
 END IF;
 IF p_attempt_id IS NULL OR p_request_id IS NULL OR p_grant_id IS NULL
  OR p_stage IS NULL OR p_stage NOT IN ('discover','intent.classify')
  OR p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$'
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096
  OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 0 AND 9007199254740991 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF jsonb_typeof(v_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(p_limits) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['uniqueUsers','requestsPerUser','requestsTotal','inputTokensPerUser','outputTokensPerUser','inputTokensTotal','outputTokensTotal']) k WHERE coalesce(p_limits->>k,'') !~ '^[1-9][0-9]{0,8}$')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['verifiedAtMs','expiresAtMs','quotaWindowStartMs','quotaWindowEndMs','remainingRequests','remainingInputTokens','remainingOutputTokens']) k WHERE coalesce(v_proof->>k,'') !~ '^[0-9]{1,16}$')
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
 IF NOT FOUND OR NOT g.enabled OR g.authorized_at>v_now OR v_proof IS DISTINCT FROM g.proof
  OR v_proof->>'grantId' IS DISTINCT FROM g.id::text
  OR v_proof->>'provider' IS DISTINCT FROM g.provider OR v_proof->>'accountId' IS DISTINCT FROM g.account_id
  OR v_proof->>'projectId' IS DISTINCT FROM g.project_id OR v_proof->>'mode' IS DISTINCT FROM g.funding_mode
  OR v_proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
  OR v_proof->>'autoReload' IS DISTINCT FROM 'off' OR v_proof->>'postpaid' IS DISTINCT FROM 'blocked'
  OR v_proof->>'overdraft' IS DISTINCT FROM 'blocked' OR v_proof->>'concurrentAccountUsage' IS DISTINCT FROM 'bounded'
  OR (v_proof->>'evidenceSha256') !~ '^[a-f0-9]{64}$' OR (v_proof->>'credentialSha256') !~ '^[a-f0-9]{64}$'
  OR (v_proof->>'verifiedAtMs')::bigint>v_now_ms OR (v_proof->>'expiresAtMs')::bigint<=v_now_ms
  OR (v_proof->>'expiresAtMs')::bigint-(v_proof->>'verifiedAtMs')::bigint NOT BETWEEN 1 AND 3600000 THEN
  RETURN jsonb_build_object('decision','denied'); END IF;

 -- Every marked reservation shares one permanent envelope, not a daily or per-grant budget.
 v_pilot:=g.proof ? 'pilotEnvelope';
 IF v_measurement AND NOT v_pilot THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF g.funding_mode='existing-credit' AND g.provider NOT IN ('openai','anthropic') AND NOT v_pilot THEN
  RETURN jsonb_build_object('decision','denied');
 END IF;
 IF v_pilot THEN
  IF NOT v_measurement OR g.funding_mode<>'existing-credit'
   OR g.proof->'pilotEnvelope' IS DISTINCT FROM '{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb THEN
   RETURN jsonb_build_object('decision','denied');
  END IF;
  SELECT coalesce(sum(reserved_credit_micros),0) INTO pilot_holds FROM private.dabra_dialogue_funding_grants WHERE proof ? 'pilotEnvelope';
  SELECT count(*),coalesce(sum(a.cost_micros),0) INTO pilot_calls,pilot_cost
   FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id WHERE pg.proof ? 'pilotEnvelope';
  IF greatest(pilot_holds,pilot_cost)+p_cost_micros>1000000 OR pilot_calls+1>28
   OR (SELECT count(*) FROM private.dabra_dialogue_admissions a JOIN private.dabra_dialogue_funding_grants pg ON pg.id=a.grant_id
     WHERE pg.proof ? 'pilotEnvelope' AND pg.provider=g.provider)>=4 THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
   OR (v_permit->>'expiresAtMs')::bigint>(v_proof->>'expiresAtMs')::bigint
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
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(
   CASE WHEN jsonb_typeof(g.proof->'measurementPermit'->'cases')='array' THEN g.proof->'measurementPermit'->'cases' ELSE '[]'::jsonb END) v
   WHERE v->>'requestId'=p_request_id::text) THEN
  -- A qualified ordinary caller cannot replay an approved measurement request without its envelope.
  RETURN jsonb_build_object('decision','denied');
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.profiles) profile WHERE profile->>'provider'=g.provider
   AND profile->'measurement'->>'model'=v_proof->>'model' AND profile->'measurement'->>'capability'=p_stage) THEN
  RETURN jsonb_build_object('decision','denied');
 END IF;
 q_start:=(v_proof->>'quotaWindowStartMs')::bigint; q_end:=(v_proof->>'quotaWindowEndMs')::bigint;
 IF q_start>v_now_ms OR q_end<=v_now_ms THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF g.funding_mode='existing-credit' THEN
  IF coalesce(v_proof->>'authorizedCreditMicros','') !~ '^[0-9]{1,16}$' OR coalesce(v_proof->>'remainingCreditMicros','') !~ '^[0-9]{1,16}$'
   OR v_proof->>'currency' IS DISTINCT FROM 'USD' OR v_proof->>'serviceTier' IS DISTINCT FROM 'standard'
   OR v_proof->>'pricing' IS DISTINCT FROM 'standard-2026-10-28'
   OR (v_proof->>'authorizedCreditMicros')::bigint IS DISTINCT FROM g.authorized_credit_micros
   OR g.input_rate_micros_per_million IS NULL OR g.output_rate_micros_per_million IS NULL
   OR g.pricing_expires_at IS NULL OR g.pricing_expires_at<=v_now THEN RETURN jsonb_build_object('decision','denied'); END IF;
  v_quote:=ceil((p_input_tokens::numeric*g.input_rate_micros_per_million+p_output_tokens::numeric*g.output_rate_micros_per_million)/1000000)::bigint;
  IF v_pilot THEN
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
   IF v_extra>1000000 OR (v_bound->>'observedAtMs')::bigint>(v_proof->>'verifiedAtMs')::bigint
    OR (v_proof->>'expiresAtMs')::bigint-(v_bound->>'observedAtMs')::bigint>3600000 THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
    OR (v_proof->'pricingVerification'->>'observedAtMs')::bigint>(v_proof->>'verifiedAtMs')::bigint
    OR (v_proof->>'expiresAtMs')::bigint-(v_proof->'pricingVerification'->>'observedAtMs')::bigint>3600000 THEN
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
 SELECT count(*),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0) INTO quota_calls,quota_input,quota_output
 FROM private.dabra_dialogue_admissions WHERE grant_id=g.id AND quota_start_ms=q_start AND quota_end_ms=q_end;
 IF quota_calls+1>(v_proof->>'remainingRequests')::bigint OR quota_input+p_input_tokens>(v_proof->>'remainingInputTokens')::bigint
  OR quota_output+p_output_tokens>(v_proof->>'remainingOutputTokens')::bigint THEN RETURN jsonb_build_object('decision','denied'); END IF;
 UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+p_cost_micros WHERE id=g.id;
 INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros)
 VALUES(p_attempt_id,p_request_id,p_stage,p_subject_hash,g.id,v_day,q_start,q_end,p_input_tokens,p_output_tokens,p_cost_micros);
 -- Holds never expire/refund/reset automatically, including cancellations, failed/unknown provider results and new application days.
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id);
END $$;
COMMIT;
