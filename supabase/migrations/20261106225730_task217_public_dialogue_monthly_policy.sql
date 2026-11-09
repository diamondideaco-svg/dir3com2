-- Task217 source candidate only. production_apply_authorized=false.
-- No live enablement, profile, authority, credit or account is installed.
-- Separate public account quotas; one aggregate DABRA month includes historical pilot holds.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Public dialogue manifest extension; all prior contracts/pricing/cases retained.
CREATE OR REPLACE FUNCTION private.task217_output_contract_manifest()
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $body$
 SELECT $manifest${"schema":"task217-qualification-manifest-v1","contracts":[{"id":"intent-tool-v1","capability":"intent.classify","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"f66051365363d9fdbdceab549ea5cdb11cb78b4162a0a415a5b8630a62a01d00"},{"id":"intent-tool-v1","capability":"intent.classify","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"27ab8f5ee2024284fbe8743f8cadf61ffce92fc975623837c42571ecbd61e676"},{"id":"general-travel-v1","capability":"discover","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"bf44abbe72649d96154d58dc6f87b056c0d634316883a4651185dc9d2d2cb7e5"},{"id":"general-travel-v1","capability":"discover","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"fa3061eb63b349079df0e40375ab8ab01d2596ec0ecd458948521082483045b9"},{"id":"platform-units-v1","capability":"discover","language":"ar","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67"},{"id":"platform-units-v1","capability":"discover","language":"en","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894"},{"id":"platform-dialogue-v2","capability":"discover","language":"ar","caseSetSha":"259651b7882f36b3db2c7160294b6a41512c97fae2bfef1381a04a30ab265439","promptSha256":"6ce500aa40afde8a380dd792b25b5882b7a5ec563a6ead126dfdc22d2505a559","inputVersion":"bounded-question-owned-trip-core-v2","outputVersion":"guidance-plus-complete-core-units-v2","parserSha256":"123587b65729a9868c604896eb84c189013810ad1feef5ce139515bc292c68a6","cases":4,"digest":"d8b0ae77f4924871e7fdafe7541644d39c4856e8a75bab3107bec7e733265da9"},{"id":"platform-dialogue-v2","capability":"discover","language":"en","caseSetSha":"259651b7882f36b3db2c7160294b6a41512c97fae2bfef1381a04a30ab265439","promptSha256":"6ce500aa40afde8a380dd792b25b5882b7a5ec563a6ead126dfdc22d2505a559","inputVersion":"bounded-question-owned-trip-core-v2","outputVersion":"guidance-plus-complete-core-units-v2","parserSha256":"123587b65729a9868c604896eb84c189013810ad1feef5ce139515bc292c68a6","cases":4,"digest":"bce1e0dbc0fbb689f1885ba5700acdde8300e1ec957065bb3f3b56b79c87dbcf"}],"cases":[{"caseId":"platform-ar-initial","stage":"discover","language":"ar","inputSha256":"beb308d5928fce04023d5757fb18c0e52b0181ec98c38a223f2421aa905cab5d","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":886},{"caseId":"platform-en-initial","stage":"discover","language":"en","inputSha256":"d0514690e95e8c2909df8702bd1923263240f6ff1bb9ae2c0c14141f3b4cc066","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":797},{"caseId":"platform-ar-followup","stage":"discover","language":"ar","inputSha256":"c0716cee42da9f14b3676dd2360457d335eab7cb06a106b7ed328641e2c75a6f","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":905},{"caseId":"platform-en-followup","stage":"discover","language":"en","inputSha256":"57ff52918e082aa0e72bbf40aa4710cfb35e24881b9b5133be36ff99ca1382b5","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":828}],"pricing":[{"provider":"openai","model":"gpt-6-luna","pricingEvidenceSha256":"f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a","digest":"187f81010403df589d73368809106b52c25e3fe093ae5559d4ba14efeb343ee9","inputMicrosPerMillion":100000,"outputMicrosPerMillion":500000,"tariffBeforeMs":null},{"provider":"gemini","model":"gemini-3.8-flash","pricingEvidenceSha256":"3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f","digest":"098195ab8b022de0499e94a4bd31379c144591556a503d5c6175383e944d54b4","inputMicrosPerMillion":750000,"outputMicrosPerMillion":3750000,"tariffBeforeMs":1798761600000},{"provider":"anthropic","model":"claude-sonnet-5-5","pricingEvidenceSha256":"97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4","digest":"51208c2b11b6d744ae57fcb4316c2b4b38cadcc01152da0ce158cc6a3657615c","inputMicrosPerMillion":2000000,"outputMicrosPerMillion":10000000,"tariffBeforeMs":null},{"provider":"xai","model":"grok-4.20-0309-non-reasoning","pricingEvidenceSha256":"fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb","digest":"95028669dc240f0fe171a719b9f01c982dffcfbc1197a7ecf6f089cadf82cc14","inputMicrosPerMillion":1250000,"outputMicrosPerMillion":2500000,"tariffBeforeMs":null},{"provider":"deepseek","model":"deepseek-flash","pricingEvidenceSha256":"760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927","digest":"1a7e56eed7ab6c7c6e009c18a3d225d7ab8448abbe5b44a0300036b37ae9182e","inputMicrosPerMillion":300000,"outputMicrosPerMillion":1200000,"tariffBeforeMs":null},{"provider":"qwen","model":"qwen3.8-flash","pricingEvidenceSha256":"7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb","digest":"1c6c91f883b20fb56e05f336bc58a85b84fc875e67fb9356971f18ea51477032","inputMicrosPerMillion":150000,"outputMicrosPerMillion":470000,"tariffBeforeMs":null},{"provider":"mistral","model":"mistral-small-2603","pricingEvidenceSha256":"72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3","digest":"369e80769ebb120922a3878d60f8a7ff34c0a1e460bea6f145cfb3a9e46b3f75","inputMicrosPerMillion":150000,"outputMicrosPerMillion":600000,"tariffBeforeMs":null}]}$manifest$::jsonb
$body$;

CREATE TABLE private.dabra_public_dialogue_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 policy_id text NOT NULL DEFAULT 'dabra-public-monthly-v1' CHECK(policy_id='dabra-public-monthly-v1'),
 monthly_cost_micros bigint NOT NULL DEFAULT 25000000 CHECK(monthly_cost_micros=25000000),
 account_monthly_cost_micros bigint NOT NULL DEFAULT 250000 CHECK(account_monthly_cost_micros=250000),
 account_monthly_requests integer NOT NULL DEFAULT 100 CHECK(account_monthly_requests=100),
 account_daily_requests integer NOT NULL DEFAULT 10 CHECK(account_daily_requests=10)
);

-- This is new explicit public authority, not reuse of a pilot's spending permission.
-- The source grant supplies unchanged observed financial/key/model facts only.
CREATE TABLE private.dabra_public_dialogue_authorities (
 id uuid PRIMARY KEY,
 source_grant_id uuid NOT NULL REFERENCES private.dabra_dialogue_funding_grants(id) ON DELETE RESTRICT,
 source_proof jsonb NOT NULL CHECK(jsonb_typeof(source_proof)='object'),
 profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
 output_acceptance jsonb NOT NULL CHECK(jsonb_typeof(output_acceptance)='object'),
 model_tier text NOT NULL CHECK(model_tier IN('economy','strong')),
 enabled boolean NOT NULL DEFAULT false,
 authorized_at timestamptz NOT NULL,
 UNIQUE(source_grant_id,output_acceptance)
);
CREATE TABLE private.dabra_public_dialogue_admissions (
 attempt_id uuid PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 subject_hash text NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 authority_id uuid NOT NULL REFERENCES private.dabra_public_dialogue_authorities(id) ON DELETE RESTRICT,
 source_grant_id uuid NOT NULL REFERENCES private.dabra_dialogue_funding_grants(id) ON DELETE RESTRICT,
 day_start_ms bigint NOT NULL,
 month_start_ms bigint NOT NULL,
 input_tokens integer NOT NULL CHECK(input_tokens BETWEEN 1 AND 4096),
 output_tokens integer NOT NULL CHECK(output_tokens BETWEEN 1 AND 1024),
 cost_micros bigint NOT NULL CHECK(cost_micros BETWEEN 1 AND 250000),
 execution_pricing jsonb NOT NULL CHECK(jsonb_typeof(execution_pricing)='object'),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX dabra_public_dialogue_month_subject ON private.dabra_public_dialogue_admissions(month_start_ms,subject_hash);
CREATE INDEX dabra_public_dialogue_day_subject ON private.dabra_public_dialogue_admissions(day_start_ms,subject_hash);
ALTER TABLE private.dabra_public_dialogue_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_public_dialogue_control FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_public_dialogue_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_public_dialogue_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_public_dialogue_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_public_dialogue_admissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_public_dialogue_control,private.dabra_public_dialogue_authorities,private.dabra_public_dialogue_admissions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.protect_dabra_public_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'DABRA_PUBLIC_AUTHORITY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN
  RAISE EXCEPTION 'DABRA_PUBLIC_AUTHORITY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' AND NOT NEW.enabled THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.profile->'measurement') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(NEW.profile))<>2
  OR NEW.profile-ARRAY['provider','measurement']::text[]<>'{}'::jsonb
  OR (SELECT count(*) FROM jsonb_object_keys(NEW.profile->'measurement'))<>14
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['cases','passed','measuredAtMs','expiresAtMs','latencyMs','inputTokenCeiling','outputTokenCeiling']) k
    WHERE jsonb_typeof(NEW.profile->'measurement'->k) IS DISTINCT FROM 'number' OR coalesce(NEW.profile->'measurement'->>k,'')!~'^[0-9]{1,16}$')
  OR jsonb_typeof(NEW.profile->'measurement'->'costCeilingUsd') IS DISTINCT FROM 'number'
  OR (NEW.profile->'measurement'->>'costCeilingUsd')::numeric NOT BETWEEN 0.000001 AND 0.25
  OR (NEW.profile->'measurement'->>'measuredAtMs')::numeric>floor(extract(epoch FROM NEW.authorized_at)*1000)
  OR (NEW.profile->'measurement'->>'expiresAtMs')::numeric<=floor(extract(epoch FROM clock_timestamp())*1000)
  OR (NEW.output_acceptance->>'reviewedAtMs')::numeric>floor(extract(epoch FROM NEW.authorized_at)*1000)
  THEN RAISE EXCEPTION 'DABRA_PUBLIC_PROFILE_REQUIRED'; END IF;
 IF NEW.authorized_at>clock_timestamp() OR NOT EXISTS(
  SELECT 1 FROM private.dabra_dialogue_funding_grants g WHERE g.id=NEW.source_grant_id
   AND g.enabled AND g.funding_mode='bounded-account-charge' AND g.proof=NEW.source_proof
   AND NEW.profile->>'provider'=g.provider AND NEW.profile->'measurement'->>'model'=g.proof->>'model'
   AND NEW.profile->'measurement'->>'environment'='provider-benchmark'
   AND NEW.profile->'measurement'->>'capability'='discover')
  OR NOT private.valid_dabra_output_acceptances(jsonb_build_array(NEW.output_acceptance),jsonb_build_array(NEW.profile))
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.task217_output_contract_manifest()->'contracts') c
    WHERE c->>'id'='platform-dialogue-v2' AND c->>'digest'=NEW.output_acceptance->>'contractSha256')
  THEN RAISE EXCEPTION 'DABRA_PUBLIC_AUTHORITY_EVIDENCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_dabra_public_authority BEFORE INSERT OR UPDATE OR DELETE ON private.dabra_public_dialogue_authorities
 FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_public_authority();
CREATE FUNCTION private.protect_dabra_public_admission()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'DABRA_PUBLIC_HOLD_IMMUTABLE'; END $$;
CREATE TRIGGER protect_dabra_public_admission BEFORE UPDATE OR DELETE ON private.dabra_public_dialogue_admissions
 FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_public_admission();

-- The caller holds the same transaction lock as the original pilot RPC.
-- Include unmatched conservative grant counters, even if their month is unknown.
CREATE FUNCTION private.dabra_monthly_liability(p_month_start_ms bigint,p_month_end_ms bigint)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT sum(cost_micros) FROM private.dabra_public_dialogue_admissions WHERE month_start_ms=p_month_start_ms),0)
  +coalesce((SELECT sum(cost_micros) FROM private.dabra_dialogue_admissions
    WHERE reserved_at>=to_timestamp(p_month_start_ms::numeric/1000) AND reserved_at<to_timestamp(p_month_end_ms::numeric/1000)),0)
  +coalesce((SELECT sum(greatest(g.reserved_credit_micros-coalesce(a.cost,0),0))
    FROM private.dabra_dialogue_funding_grants g LEFT JOIN
      (SELECT grant_id,sum(cost_micros) cost FROM private.dabra_dialogue_admissions GROUP BY grant_id) a ON a.grant_id=g.id),0)
$$;

CREATE FUNCTION private.dabra_public_actor_active(p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
  WHERE u.id=p_actor_id AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
   AND p.status='active' AND p.deleted_at IS NULL
   AND p.role IN('client','customer','partner','staff','admin','super_admin'))
$$;

CREATE FUNCTION public.get_dabra_public_dialogue_policy(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.dabra_public_actor_active(p_actor_id) OR NOT EXISTS(
  SELECT 1 FROM private.dabra_public_dialogue_control WHERE singleton AND enabled) THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('policyId','dabra-public-monthly-v1','authorities',coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)) INTO result
 FROM private.dabra_public_dialogue_authorities a JOIN private.dabra_dialogue_funding_grants g ON g.id=a.source_grant_id
 WHERE a.enabled AND a.authorized_at<=clock_timestamp() AND g.enabled AND g.proof=a.source_proof
  AND (a.profile->'measurement'->>'expiresAtMs')::numeric>floor(extract(epoch FROM clock_timestamp())*1000);
 RETURN result;
END $$;

CREATE FUNCTION public.reserve_dabra_public_dialogue_attempt(
 p_attempt_id uuid,p_request_id uuid,p_actor_id uuid,p_authority_id uuid,p_execution jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.dabra_public_dialogue_authorities%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 c private.dabra_public_dialogue_control%ROWTYPE; v_now timestamptz; v_ms bigint; v_day bigint; v_month bigint; v_end bigint;
 v_subject text; o jsonb; r jsonb; m jsonb; calls bigint; day_calls bigint; held numeric; v_quote numeric;
BEGIN
 IF p_attempt_id IS NULL OR p_request_id IS NULL OR p_actor_id IS NULL OR p_authority_id IS NULL
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096 OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 1 AND 250000 OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object'
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0));
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 v_day:=floor((v_ms+10800000)::numeric/86400000)::bigint*86400000-10800000;
 v_month:=floor(extract(epoch FROM (date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 v_end:=floor(extract(epoch FROM ((date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 SELECT * INTO c FROM private.dabra_public_dialogue_control WHERE singleton FOR SHARE;
 IF NOT FOUND OR NOT c.enabled OR NOT private.dabra_public_actor_active(p_actor_id)
  OR EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO a FROM private.dabra_public_dialogue_authorities WHERE id=p_authority_id FOR SHARE;
 IF NOT FOUND OR NOT a.enabled OR a.authorized_at>v_now THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=a.source_grant_id FOR SHARE;
 IF NOT FOUND OR NOT g.enabled OR g.funding_mode<>'bounded-account-charge' OR g.proof IS DISTINCT FROM a.source_proof
  OR NOT private.valid_dabra_output_acceptances(jsonb_build_array(a.output_acceptance),jsonb_build_array(a.profile)) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 v_subject:=encode(sha256(convert_to('task217-dialogue:'||p_actor_id::text,'UTF8')),'hex');
 m:=a.profile->'measurement';o:=p_execution->'observation';
 IF (SELECT count(*) FROM jsonb_object_keys(p_execution))<>6
  OR p_execution-ARRAY['schema','authorityId','profileSha256','attemptId','requestId','observation']::text[]<>'{}'::jsonb
  OR p_execution->>'schema' IS DISTINCT FROM 'dabra-public-execution-v1' OR p_execution->>'authorityId' IS DISTINCT FROM a.id::text
  OR p_execution->>'profileSha256' IS DISTINCT FROM a.output_acceptance->>'profileSha256'
  OR p_execution->>'attemptId' IS DISTINCT FROM p_attempt_id::text OR p_execution->>'requestId' IS DISTINCT FROM p_request_id::text
  OR m->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input_tokens) OR m->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output_tokens)
  OR (m->>'latencyMs')::numeric>12000 OR (m->>'expiresAtMs')::numeric<=v_ms
  OR jsonb_typeof(o) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT value INTO r FROM jsonb_array_elements(private.task217_output_contract_manifest()->'pricing')
  WHERE value->>'provider'=g.provider AND value->>'model'=g.proof->>'model' AND value->>'pricingEvidenceSha256'=g.proof->>'pricingEvidenceSha256';
 IF NOT FOUND OR (SELECT count(*) FROM jsonb_object_keys(o))<>12
  OR o-ARRAY['schema','provider','model','approvedPricingDigest','approvedContractDigest','currency','unitTokens','inputMicrosPerMillion','outputMicrosPerMillion','observedAtMs','expiresAtMs','bodySha256']::text[]<>'{}'::jsonb
  OR o->>'schema' IS DISTINCT FROM 'task217-public-pricing-observation-v1' OR o->>'provider' IS DISTINCT FROM g.provider
  OR o->>'model' IS DISTINCT FROM g.proof->>'model' OR o->>'approvedPricingDigest' IS DISTINCT FROM r->>'pricingEvidenceSha256'
  OR o->>'approvedContractDigest' IS DISTINCT FROM r->>'digest' OR o->>'currency' IS DISTINCT FROM 'USD'
  OR o->'unitTokens' IS DISTINCT FROM '1000000'::jsonb OR o->'inputMicrosPerMillion' IS DISTINCT FROM r->'inputMicrosPerMillion'
  OR o->'outputMicrosPerMillion' IS DISTINCT FROM r->'outputMicrosPerMillion' OR coalesce(o->>'bodySha256','')!~'^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['observedAtMs','expiresAtMs']) k WHERE jsonb_typeof(o->k) IS DISTINCT FROM 'number' OR coalesce(o->>k,'')!~'^[0-9]{1,16}$')
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF (o->>'observedAtMs')::numeric>v_ms OR (o->>'expiresAtMs')::numeric<=v_ms
  OR (o->>'expiresAtMs')::numeric-(o->>'observedAtMs')::numeric NOT BETWEEN 1 AND 900000
  OR (r->>'tariffBeforeMs' IS NOT NULL AND (o->>'expiresAtMs')::numeric>(r->>'tariffBeforeMs')::numeric)
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_quote:=ceil((p_input_tokens::numeric*(r->>'inputMicrosPerMillion')::numeric+p_output_tokens::numeric*(r->>'outputMicrosPerMillion')::numeric)/1000000)
  +(g.proof->'accountTerms'->'allInChargeBound'->>'maxAdditionalMicros')::numeric;
 IF v_quote IS NULL OR v_quote<>p_cost_micros OR p_cost_micros::numeric/1000000>(m->>'costCeilingUsd')::numeric THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT count(*),count(*) FILTER(WHERE day_start_ms=v_day),coalesce(sum(cost_micros),0) INTO calls,day_calls,held
  FROM private.dabra_public_dialogue_admissions WHERE month_start_ms=v_month AND subject_hash=v_subject;
 IF calls>=c.account_monthly_requests OR day_calls>=c.account_daily_requests OR held+p_cost_micros>c.account_monthly_cost_micros
  OR private.dabra_monthly_liability(v_month,v_end)+p_cost_micros>c.monthly_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing)
 VALUES(p_attempt_id,p_request_id,v_subject,a.id,g.id,v_day,v_month,p_input_tokens,p_output_tokens,p_cost_micros,p_execution);
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,'pricing_expires_at_ms',(o->>'expiresAtMs')::bigint);
EXCEPTION WHEN data_exception THEN RETURN jsonb_build_object('decision','denied');
END $$;

-- Preserve the original pilot body/signature/ACL and add only the common monthly
-- aggregate guard at its existing locked DB-clock point. No pilot allowance reset.
DO $guard$
DECLARE body text; anchor text:='v_now:=clock_timestamp(); v_now_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;';
BEGIN
 SELECT pg_get_functiondef('public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'DABRA_PILOT_CLOCK_BASELINE_MISMATCH'; END IF;
 body:=replace(body,anchor,anchor||$insert$
 IF EXISTS(SELECT 1 FROM private.dabra_public_dialogue_control WHERE singleton AND enabled) AND (
  EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  OR private.dabra_monthly_liability(
    floor(extract(epoch FROM (date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint,
    floor(extract(epoch FROM ((date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint
   )+p_cost_micros>25000000) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 $insert$);
 EXECUTE body;
END $guard$;

REVOKE ALL ON FUNCTION private.protect_dabra_public_authority(),private.protect_dabra_public_admission(),private.dabra_monthly_liability(bigint,bigint),private.dabra_public_actor_active(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_dabra_public_dialogue_policy(uuid),public.reserve_dabra_public_dialogue_attempt(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_dabra_public_dialogue_policy(uuid),public.reserve_dabra_public_dialogue_attempt(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint) TO service_role;
COMMIT;
