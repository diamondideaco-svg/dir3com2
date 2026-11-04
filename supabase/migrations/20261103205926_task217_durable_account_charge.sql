-- Task217 SOURCE/LOCAL only. production_apply_authorized=false
-- Permanent v2 authority, genuinely refreshed public pricing, same private ledger/lock.
-- No seed, key, enabled subject, profile, balance, privilege or RPC-signature change.
-- bounded-account-charge is a liability cap, NOT a USD prepaid-credit assertion.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $baseline$ BEGIN
 IF to_regprocedure('public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)') IS NULL
  OR to_regprocedure('private.protect_dabra_dialogue_grant()') IS NULL
  OR to_regprocedure('private.protect_dabra_pilot_admission()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='private' AND indexname='dabra_task217_grant_account_limited')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.dabra_dialogue_funding_grants'::regclass AND conname='dabra_dialogue_funding_grants_check1' AND pg_get_constraintdef(oid) LIKE '%limitedOperation%')
  -- The original two-column CHECK is table-named by PostgreSQL, not column-named.
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.dabra_dialogue_funding_grants'::regclass
    AND conname='dabra_dialogue_funding_grants_check' AND contype='c' AND convalidated
    AND regexp_replace(pg_get_constraintdef(oid),'[[:space:]()]','','g')='CHECKreserved_credit_micros>=0ANDreserved_credit_micros<=authorized_credit_micros') THEN
  RAISE EXCEPTION 'DIALOGUE_LIMITED_BASELINE_REQUIRED'; END IF;
END $baseline$;
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_funding_mode_check;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_funding_mode_check CHECK(funding_mode IN('existing-credit','no-new-charge','bounded-account-charge'));
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_check;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_reserved_credit_micros_check CHECK(
 reserved_credit_micros>=0 AND (CASE WHEN funding_mode='bounded-account-charge' THEN reserved_credit_micros<=1000000 ELSE reserved_credit_micros<=authorized_credit_micros END));
ALTER TABLE private.dabra_dialogue_funding_grants DROP CONSTRAINT dabra_dialogue_funding_grants_check1;
ALTER TABLE private.dabra_dialogue_funding_grants ADD CONSTRAINT dabra_dialogue_funding_grants_check1 CHECK(
 (funding_mode='existing-credit' AND authorized_credit_micros>0 AND(
  (provider IN('openai','anthropic') AND NOT(proof ? 'pilotEnvelope')) OR
  (proof ? 'pilotEnvelope' AND proof->'pilotEnvelope'='{"schema":"task217-seven-provider-pilot-v1","id":"task217-text-pilot-2026-11-01","maxCostMicros":1000000,"maxAttempts":28}'::jsonb) OR
  (proof ? 'limitedOperation' AND NOT(proof ? 'pilotEnvelope'))))
 OR(funding_mode='no-new-charge' AND provider NOT IN('openai','anthropic') AND authorized_credit_micros=0 AND NOT(proof ? 'pilotEnvelope'))
 OR(funding_mode='bounded-account-charge' AND authorized_credit_micros=0 AND proof->'limitedOperation'->>'schema'='task217-limited-operation-v2'));
DROP INDEX private.dabra_task217_grant_account_limited;
CREATE UNIQUE INDEX dabra_task217_grant_account_limited ON private.dabra_dialogue_funding_grants(provider,account_id) WHERE proof ? 'limitedOperation' AND funding_mode<>'bounded-account-charge';
-- A changed contract needs a new explicit authority. Disabled history is retained.
CREATE UNIQUE INDEX dabra_task217_grant_account_durable ON private.dabra_dialogue_funding_grants(provider,account_id) WHERE funding_mode='bounded-account-charge' AND enabled;
ALTER TABLE private.dabra_dialogue_admissions ADD COLUMN execution_pricing jsonb CHECK(execution_pricing IS NULL OR jsonb_typeof(execution_pricing)='object');

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

-- Preserve the existing trigger/OID/ACL; v2 history cannot be edited or deleted.
CREATE OR REPLACE FUNCTION private.protect_dabra_pilot_admission()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=OLD.grant_id AND (proof ? 'pilotEnvelope' OR funding_mode='bounded-account-charge')) THEN
  RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=NEW.grant_id AND (proof ? 'pilotEnvelope' OR funding_mode='bounded-account-charge')) THEN
   RAISE EXCEPTION 'DIALOGUE_PILOT_ADMISSION_IMMUTABLE';
  END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
COMMIT;
