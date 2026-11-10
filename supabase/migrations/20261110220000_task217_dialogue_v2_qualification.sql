-- Task217 source-only correction. production_apply_authorized=false.
-- Separate canonical dialogue-v2 measurement; no grant, profile or acceptance is installed.
-- Historical manifests and every authority, accounting, hold and ACL/RLS guard remain.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION private.task217_output_contract_manifest()
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $body$
 SELECT $manifest${"schema":"task217-qualification-manifest-v1","contracts":[{"id":"intent-tool-v1","capability":"intent.classify","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"f66051365363d9fdbdceab549ea5cdb11cb78b4162a0a415a5b8630a62a01d00"},{"id":"intent-tool-v1","capability":"intent.classify","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"a948945b3f927f6408fd501ed6edc50dc4d6f918a81d81cfbb2e554b0cb749e8","inputVersion":"redacted-user-text-v1","outputVersion":"single-known-tool-v1","parserSha256":"12e6db3443ea2896414844de135c068562ea7a43d50a93719e80679b7a70448b","cases":1,"digest":"27ab8f5ee2024284fbe8743f8cadf61ffce92fc975623837c42571ecbd61e676"},{"id":"general-travel-v1","capability":"discover","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"bf44abbe72649d96154d58dc6f87b056c0d634316883a4651185dc9d2d2cb7e5"},{"id":"general-travel-v1","capability":"discover","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v1","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"fa3061eb63b349079df0e40375ab8ab01d2596ec0ecd458948521082483045b9"},{"id":"platform-units-v1","capability":"discover","language":"ar","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67"},{"id":"platform-units-v1","capability":"discover","language":"en","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v1","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894"},{"id":"general-travel-v1","capability":"discover","language":"ar","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v2","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"0ff996845da2ebc34376bfc0cafeb0a647342d00edb5e13fa6a382542162a297"},{"id":"general-travel-v1","capability":"discover","language":"en","caseSetSha":"65555baf2b237b05b2cb40e46250d9667326ec06c23c9079566c6daa882da056","promptSha256":"0e01a09bab5e024d09086aab5a43c56cebfab9d0f65298056e73614dedfbe4ff","inputVersion":"bounded-general-context-v2","outputVersion":"general-travel-advice-v1","parserSha256":"99a2c0d437fa0c81affb0891328854e801020a96b9ffcc72a11fd9636131ed6a","cases":1,"digest":"35d836a8cfc7e1cf9220927824ae14c42d11d9a463e87c765c58027c4632b038"},{"id":"platform-units-v1","capability":"discover","language":"ar","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v2","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"48ff60d3a153c7a8df78c0d9c095eb8efcdff63a86851b079c57b55ecd420552"},{"id":"platform-units-v1","capability":"discover","language":"en","caseSetSha":"6185a0ef667473b44110047a95cf4d9f1dfa92f830fc356c32dfed94a3a1ca67","promptSha256":"6f05b93851a0ed6a26e7fe12f0968d8eed3f7964d031ca7a40bc8cbe11d10dd9","inputVersion":"server-language-numbered-units-v2","outputVersion":"opening-adjacent-complete-indices-v1","parserSha256":"77ddbc414839a06c058f9e03b34f93939ba5d4005c8f5d4100b816d0c094bc87","cases":2,"digest":"586e3567c482256db62e24be1903a3db60271773dbfac261c342db534d971af7"},{"id":"platform-dialogue-v2","capability":"discover","language":"ar","caseSetSha":"259651b7882f36b3db2c7160294b6a41512c97fae2bfef1381a04a30ab265439","promptSha256":"a897774eee55812bb8787a323fde0bfebf5c39b4567b01129a6c0b74766b46b7","inputVersion":"bounded-question-trip-guidance-options-v4","outputVersion":"closed-guidance-with-general-tips-v4","parserSha256":"856a54b6e5b9a21db253f1f706a749455f4edcbc3afbe635e22237130de31745","cases":4,"digest":"3e5a4d2904fd5a32765ac00d60a96df2314e4b6307f0eada2578463d8ee37566"},{"id":"platform-dialogue-v2","capability":"discover","language":"en","caseSetSha":"259651b7882f36b3db2c7160294b6a41512c97fae2bfef1381a04a30ab265439","promptSha256":"a897774eee55812bb8787a323fde0bfebf5c39b4567b01129a6c0b74766b46b7","inputVersion":"bounded-question-trip-guidance-options-v4","outputVersion":"closed-guidance-with-general-tips-v4","parserSha256":"856a54b6e5b9a21db253f1f706a749455f4edcbc3afbe635e22237130de31745","cases":4,"digest":"57d9b01fff22e8cec2064ced977375572e835476b8cf9d94310bd92a5d45f038"}],"cases":[{"caseId":"platform-ar-initial","stage":"discover","language":"ar","inputSha256":"beb308d5928fce04023d5757fb18c0e52b0181ec98c38a223f2421aa905cab5d","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":886},{"caseId":"platform-en-initial","stage":"discover","language":"en","inputSha256":"d0514690e95e8c2909df8702bd1923263240f6ff1bb9ae2c0c14141f3b4cc066","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":797},{"caseId":"platform-ar-followup","stage":"discover","language":"ar","inputSha256":"c0716cee42da9f14b3676dd2360457d335eab7cb06a106b7ed328641e2c75a6f","contractSha256":"df250b87809756694454b2f1152d7d3235ce0290caac8bce7cf0fb0295e29c67","inputBytes":905},{"caseId":"platform-en-followup","stage":"discover","language":"en","inputSha256":"57ff52918e082aa0e72bbf40aa4710cfb35e24881b9b5133be36ff99ca1382b5","contractSha256":"c08d97bc1199d9a9076778b0b4f8a0be1ddf1a9029d331228b29432813aa8894","inputBytes":828},{"caseId":"platform-ar-initial","stage":"discover","language":"ar","inputSha256":"beb308d5928fce04023d5757fb18c0e52b0181ec98c38a223f2421aa905cab5d","contractSha256":"48ff60d3a153c7a8df78c0d9c095eb8efcdff63a86851b079c57b55ecd420552","inputBytes":886},{"caseId":"platform-en-initial","stage":"discover","language":"en","inputSha256":"d0514690e95e8c2909df8702bd1923263240f6ff1bb9ae2c0c14141f3b4cc066","contractSha256":"586e3567c482256db62e24be1903a3db60271773dbfac261c342db534d971af7","inputBytes":797},{"caseId":"platform-ar-followup","stage":"discover","language":"ar","inputSha256":"c0716cee42da9f14b3676dd2360457d335eab7cb06a106b7ed328641e2c75a6f","contractSha256":"48ff60d3a153c7a8df78c0d9c095eb8efcdff63a86851b079c57b55ecd420552","inputBytes":905},{"caseId":"platform-en-followup","stage":"discover","language":"en","inputSha256":"57ff52918e082aa0e72bbf40aa4710cfb35e24881b9b5133be36ff99ca1382b5","contractSha256":"586e3567c482256db62e24be1903a3db60271773dbfac261c342db534d971af7","inputBytes":828},{"caseId":"dialogue-ar-initial","stage":"discover","language":"ar","inputSha256":"b9592dd5ae39d17adaf47cbcafd6ca8293e127c22d764854e0437c92844f519f","contractSha256":"3e5a4d2904fd5a32765ac00d60a96df2314e4b6307f0eada2578463d8ee37566","inputBytes":1467},{"caseId":"dialogue-ar-followup","stage":"discover","language":"ar","inputSha256":"8d1a5f1fc2ae9fdfa0d105049f7ef504d6d4818178bcfeef429e45e511f0961b","contractSha256":"3e5a4d2904fd5a32765ac00d60a96df2314e4b6307f0eada2578463d8ee37566","inputBytes":1594},{"caseId":"dialogue-ar-topic-change","stage":"discover","language":"ar","inputSha256":"56739a46ecf1d7d4773e4e63a8fb966ad41b831967f3b34b140687b6c1c3147f","contractSha256":"3e5a4d2904fd5a32765ac00d60a96df2314e4b6307f0eada2578463d8ee37566","inputBytes":1499},{"caseId":"dialogue-ar-privacy","stage":"discover","language":"ar","inputSha256":"1809b6f7efb4e6d9a68041d695339174160ee94cded3fd5a96dc2a09404015e3","contractSha256":"3e5a4d2904fd5a32765ac00d60a96df2314e4b6307f0eada2578463d8ee37566","inputBytes":1527},{"caseId":"dialogue-en-initial","stage":"discover","language":"en","inputSha256":"85c72cf07d05a09480e0fc5bfd73c83f55edf1fa914cd7f598bd3d14c21c3faa","contractSha256":"57d9b01fff22e8cec2064ced977375572e835476b8cf9d94310bd92a5d45f038","inputBytes":1439},{"caseId":"dialogue-en-followup","stage":"discover","language":"en","inputSha256":"919fa15d975481029b774b95d7d33839cc05e86f6c31e8fac5002c2b024d01bc","contractSha256":"57d9b01fff22e8cec2064ced977375572e835476b8cf9d94310bd92a5d45f038","inputBytes":1592},{"caseId":"dialogue-en-topic-change","stage":"discover","language":"en","inputSha256":"0280f2cb510e0fd0cd7da66864ed8fe4a189532883e80308677396f4fcd49ede","contractSha256":"57d9b01fff22e8cec2064ced977375572e835476b8cf9d94310bd92a5d45f038","inputBytes":1461},{"caseId":"dialogue-en-privacy","stage":"discover","language":"en","inputSha256":"b19d399be340d66795791cc7747bd57804d2776c81ad866fb3f66e35cab4a269","contractSha256":"57d9b01fff22e8cec2064ced977375572e835476b8cf9d94310bd92a5d45f038","inputBytes":1475}],"pricing":[{"provider":"openai","model":"gpt-6-luna","pricingEvidenceSha256":"f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a","digest":"187f81010403df589d73368809106b52c25e3fe093ae5559d4ba14efeb343ee9","inputMicrosPerMillion":100000,"outputMicrosPerMillion":500000,"tariffBeforeMs":null},{"provider":"gemini","model":"gemini-3.8-flash","pricingEvidenceSha256":"3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f","digest":"098195ab8b022de0499e94a4bd31379c144591556a503d5c6175383e944d54b4","inputMicrosPerMillion":750000,"outputMicrosPerMillion":3750000,"tariffBeforeMs":1798761600000},{"provider":"anthropic","model":"claude-sonnet-5-5","pricingEvidenceSha256":"97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4","digest":"51208c2b11b6d744ae57fcb4316c2b4b38cadcc01152da0ce158cc6a3657615c","inputMicrosPerMillion":2000000,"outputMicrosPerMillion":10000000,"tariffBeforeMs":null},{"provider":"xai","model":"grok-4.20-0309-non-reasoning","pricingEvidenceSha256":"fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb","digest":"95028669dc240f0fe171a719b9f01c982dffcfbc1197a7ecf6f089cadf82cc14","inputMicrosPerMillion":1250000,"outputMicrosPerMillion":2500000,"tariffBeforeMs":null},{"provider":"deepseek","model":"deepseek-flash","pricingEvidenceSha256":"760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927","digest":"1a7e56eed7ab6c7c6e009c18a3d225d7ab8448abbe5b44a0300036b37ae9182e","inputMicrosPerMillion":300000,"outputMicrosPerMillion":1200000,"tariffBeforeMs":null},{"provider":"qwen","model":"qwen3.8-flash","pricingEvidenceSha256":"7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb","digest":"1c6c91f883b20fb56e05f336bc58a85b84fc875e67fb9356971f18ea51477032","inputMicrosPerMillion":150000,"outputMicrosPerMillion":470000,"tariffBeforeMs":null},{"provider":"mistral","model":"mistral-small-2603","pricingEvidenceSha256":"72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3","digest":"369e80769ebb120922a3878d60f8a7ff34c0a1e460bea6f145cfb3a9e46b3f75","inputMicrosPerMillion":150000,"outputMicrosPerMillion":600000,"tariffBeforeMs":null}]}$manifest$::jsonb;
$body$;

CREATE OR REPLACE FUNCTION private.valid_dabra_qualification_proof(p jsonb,p_now bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb;t jsonb;r jsonb;f jsonb;b jsonb;q jsonb;price jsonb;c jsonb;expected jsonb;
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
 RETURN encode(sha256(convert_to(replace(tuple::text,' ',''),'UTF8')),'hex')=a->>'bindingSha256';
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;

COMMIT;
