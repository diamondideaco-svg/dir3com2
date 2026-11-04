-- Task217 LOCAL SOURCE ONLY. production_apply_authorized=false.
-- Existing private Core configuration stores independently reviewed output mapping.
-- No profile, acceptance, subject, key, grant or flag is installed by this forward.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION private.task217_output_contract_manifest()
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $body$
 SELECT $manifest${"schema":"task217-qualification-manifest-v1","contracts":[{"id":"intent-tool-v1","capability":"intent.classify","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"f66051365363d9fdbdceab549ea5cdb11cb78b4162a0a415a5b8630a62a01d00"},{"id":"intent-tool-v1","capability":"intent.classify","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"27ab8f5ee2024284fbe8743f8cadf61ffce92fc975623837c42571ecbd61e676"},{"id":"general-travel-v1","capability":"discover","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"bf44abbe72649d96154d58dc6f87b056c0d634316883a4651185dc9d2d2cb7e5"},{"id":"general-travel-v1","capability":"discover","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"fa3061eb63b349079df0e40375ab8ab01d2596ec0ecd458948521082483045b9"},{"id":"platform-units-v1","capability":"discover","language":"ar","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67"},{"id":"platform-units-v1","capability":"discover","language":"en","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894"}],"cases":[{"caseId":"platform-ar-initial","stage":"discover","language":"ar","inputSha256":"beb308d5928fce04023d5757fb18c0e52b0181ec98c38a223f2421aa905cab5d","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":886},{"caseId":"platform-en-initial","stage":"discover","language":"en","inputSha256":"d0514690e95e8c2909df8702bd1923263240f6ff1bb9ae2c0c14141f3b4cc066","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":797},{"caseId":"platform-ar-followup","stage":"discover","language":"ar","inputSha256":"c0716cee42da9f14b3676dd2360457d335eab7cb06a106b7ed328641e2c75a6f","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":905},{"caseId":"platform-en-followup","stage":"discover","language":"en","inputSha256":"57ff52918e082aa0e72bbf40aa4710cfb35e24881b9b5133be36ff99ca1382b5","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":828}],"pricing":[{"provider":"openai","model":"gpt-6-luna","pricingEvidenceSha256":"f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a","digest":"187f81010403df589d73368809106b52c25e3fe093ae5559d4ba14efeb343ee9","inputMicrosPerMillion":100000,"outputMicrosPerMillion":500000,"tariffBeforeMs":null},{"provider":"gemini","model":"gemini-3.8-flash","pricingEvidenceSha256":"3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f","digest":"098195ab8b022de0499e94a4bd31379c144591556a503d5c6175383e944d54b4","inputMicrosPerMillion":750000,"outputMicrosPerMillion":3750000,"tariffBeforeMs":1798761600000},{"provider":"anthropic","model":"claude-sonnet-5-5","pricingEvidenceSha256":"97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4","digest":"51208c2b11b6d744ae57fcb4316c2b4b38cadcc01152da0ce158cc6a3657615c","inputMicrosPerMillion":2000000,"outputMicrosPerMillion":10000000,"tariffBeforeMs":null},{"provider":"xai","model":"grok-4.20-0309-non-reasoning","pricingEvidenceSha256":"fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb","digest":"95028669dc240f0fe171a719b9f01c982dffcfbc1197a7ecf6f089cadf82cc14","inputMicrosPerMillion":1250000,"outputMicrosPerMillion":2500000,"tariffBeforeMs":null},{"provider":"deepseek","model":"deepseek-flash","pricingEvidenceSha256":"760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927","digest":"1a7e56eed7ab6c7c6e009c18a3d225d7ab8448abbe5b44a0300036b37ae9182e","inputMicrosPerMillion":300000,"outputMicrosPerMillion":1200000,"tariffBeforeMs":null},{"provider":"qwen","model":"qwen3.8-flash","pricingEvidenceSha256":"7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb","digest":"1c6c91f883b20fb56e05f336bc58a85b84fc875e67fb9356971f18ea51477032","inputMicrosPerMillion":150000,"outputMicrosPerMillion":470000,"tariffBeforeMs":null},{"provider":"mistral","model":"mistral-small-2603","pricingEvidenceSha256":"72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3","digest":"369e80769ebb120922a3878d60f8a7ff34c0a1e460bea6f145cfb3a9e46b3f75","inputMicrosPerMillion":150000,"outputMicrosPerMillion":600000,"tariffBeforeMs":null}]}$manifest$::jsonb
$body$;
REVOKE ALL ON FUNCTION private.task217_output_contract_manifest() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.valid_dabra_output_acceptances(p_value jsonb,p_profiles jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE acceptance jsonb; receipt jsonb; candidate jsonb; m jsonb; contract jsonb; profile_hash text;
 found_profiles integer; now_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'array' OR jsonb_typeof(p_profiles) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_value)>28 OR
  (SELECT count(DISTINCT value->>'profileSha256') FROM jsonb_array_elements(p_value))<>jsonb_array_length(p_value) THEN RETURN false; END IF;
 FOR acceptance IN SELECT value FROM jsonb_array_elements(p_value) LOOP
  IF jsonb_typeof(acceptance) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(acceptance))<>12 OR
   acceptance-ARRAY['schema','profileSha256','contractSha256','sourceSha','provider','model','environment','capability','language','caseSetSha','reviewedAtMs','receipt']::text[]<>'{}'::jsonb THEN RETURN false; END IF;
  -- Exact key count is twelve: the independent receipt is one nested value.
  IF acceptance->>'schema' IS DISTINCT FROM 'task217-profile-output-acceptance-v1'
   OR coalesce(acceptance->>'profileSha256','')!~'^[a-f0-9]{64}$'
   OR coalesce(acceptance->>'contractSha256','')!~'^[a-f0-9]{64}$'
   OR coalesce(acceptance->>'sourceSha','')!~'^[a-f0-9]{40}$'
   OR jsonb_typeof(acceptance->'reviewedAtMs') IS DISTINCT FROM 'number'
   OR coalesce(acceptance->>'reviewedAtMs','')!~'^[0-9]{1,16}$'
   OR (acceptance->>'reviewedAtMs')::numeric>now_ms THEN RETURN false; END IF;
  receipt:=acceptance->'receipt';
  IF jsonb_typeof(receipt) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(receipt))<>6
   OR receipt-ARRAY['implementationSession','reviewerSession','reference','artifactSha256','verdict','authorship']::text[]<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['implementationSession','reviewerSession','reference','artifactSha256','verdict','authorship']) k WHERE jsonb_typeof(receipt->k) IS DISTINCT FROM 'string')
   OR coalesce(receipt->>'implementationSession','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR coalesce(receipt->>'reviewerSession','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR lower(receipt->>'implementationSession')=lower(receipt->>'reviewerSession')
   OR receipt->>'verdict' IS DISTINCT FROM 'PASS' OR receipt->>'authorship' IS DISTINCT FROM 'none'
   OR coalesce(receipt->>'reference','')!~'^https://github[.]com/diamondideaco-svg/dir3com2/issues/217#issuecomment-[1-9][0-9]*$'
   OR coalesce(receipt->>'artifactSha256','')!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
  SELECT value INTO contract FROM jsonb_array_elements(private.task217_output_contract_manifest()->'contracts')
   WHERE value->>'digest'=acceptance->>'contractSha256';
  IF NOT FOUND THEN RETURN false; END IF;
  found_profiles:=0;
  FOR candidate IN SELECT value FROM jsonb_array_elements(p_profiles) LOOP
   IF jsonb_typeof(candidate) IS DISTINCT FROM 'object' OR jsonb_typeof(candidate->'measurement') IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
   m:=candidate->'measurement';
   IF m->>'capability' IS DISTINCT FROM contract->>'capability' OR m->>'language' IS DISTINCT FROM contract->>'language'
    OR m->>'caseSetSha' IS DISTINCT FROM contract->>'caseSetSha' OR m->'cases' IS DISTINCT FROM contract->'cases'
    OR m->'passed' IS DISTINCT FROM m->'cases' OR coalesce(m->>'sourceSha','')!~'^[a-f0-9]{40}$'
    OR coalesce(m->>'measuredAtMs','')!~'^[0-9]{1,16}$' OR jsonb_typeof(m->'measuredAtMs') IS DISTINCT FROM 'number'
    OR (m->>'measuredAtMs')::numeric>(acceptance->>'reviewedAtMs')::numeric THEN CONTINUE; END IF;
   profile_hash:=encode(sha256(convert_to(replace(jsonb_build_array(candidate->'provider',m->'capability',m->'language',m->'model',m->'environment',
    m->'caseSetSha',m->'sourceSha',m->'cases',m->'passed',m->'measuredAtMs',m->'expiresAtMs',m->'latencyMs',
    m->'inputTokenCeiling',m->'outputTokenCeiling',m->'costCeilingUsd')::text,' ',''),'UTF8')),'hex');
   IF profile_hash=acceptance->>'profileSha256'
    AND acceptance->>'sourceSha'=m->>'sourceSha' AND acceptance->>'provider'=candidate->>'provider'
    AND acceptance->>'model'=m->>'model' AND acceptance->>'environment'=m->>'environment'
    AND acceptance->>'capability'=m->>'capability' AND acceptance->>'language'=m->>'language'
    AND acceptance->>'caseSetSha'=m->>'caseSetSha' THEN found_profiles:=found_profiles+1; END IF;
  END LOOP;
  IF found_profiles<>1 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_dabra_output_acceptances(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.dabra_dialogue_funding_control ADD COLUMN output_acceptances jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE private.dabra_dialogue_funding_control ADD CONSTRAINT dabra_output_acceptance_bound CHECK
 (private.valid_dabra_output_acceptances(output_acceptances,profiles));

CREATE OR REPLACE FUNCTION public.get_dabra_dialogue_funding_policy(p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.dabra_dialogue_funding_control%ROWTYPE; proofs jsonb;
BEGIN
  IF p_subject_hash IS NULL THEN
    SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('credentialBindings',coalesce(c.credential_bindings,'{}'::jsonb));
  END IF;
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
  IF NOT FOUND OR NOT c.enabled OR (p_subject_hash=ANY(c.subject_hashes)) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(g.proof),'[]'::jsonb) INTO proofs FROM private.dabra_dialogue_funding_grants g WHERE g.enabled;
  RETURN jsonb_build_object('enabled',true,'profiles',c.profiles,'proofs',proofs,'maxCostMicros',c.max_attempt_cost_micros,'dailyLimits',c.daily_limits,'outputAcceptances',c.output_acceptances);
END $$;
-- Existing table owner/ACL and forced RLS stay unchanged. Only the existing
-- authorized operator configuration path may install profile+receipt atomically,
-- after fetching and verifying the real independent semantic review artifact.
COMMIT;
