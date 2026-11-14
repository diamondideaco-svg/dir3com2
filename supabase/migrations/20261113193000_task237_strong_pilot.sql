-- Task237 local preparation only. production_apply_authorized=false. No records or grants.
-- v1 remains economy; v2 tier is revalidated against the actor/revision decision bundle.
BEGIN;
CREATE OR REPLACE FUNCTION private.dabra_production_task_terms(b jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb:=b->'decisions'->'retention'->'document'; c jsonb:=b->'decisions'->'consent'->'document';
 d jsonb:=b->'decisions'->'deletion'->'document'; a jsonb:=b->'decisions'->'audience'->'document';
 s jsonb:=b->'decisions'->'spending'->'document'; n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; expiry bigint;
BEGIN
 IF NOT private.dabra_qualification_exact_keys(r,ARRAY['schema','answerRetentionMs'])
  OR NOT private.dabra_qualification_exact_keys(c,ARRAY['schema','actorId','revision','noticeVersion','noticeSha256','grantedAtMs','generation'])
  OR NOT private.dabra_qualification_exact_keys(d,ARRAY['schema','policyReference','purgeWithinMs','backupPolicyReference'])
  OR NOT private.dabra_qualification_exact_keys(a,ARRAY['schema','actorId','role','revision'])
  OR NOT private.dabra_qualification_exact_keys(s,ARRAY['schema','currency','timeZone','grantId','maxAttempts','dailySuccesses','monthlySuccesses','accountMonthlyCostMicros','monthlyCostMicros','attemptCostMicros','inputTokenCeiling','outputTokenCeiling','leaseMs'] || CASE WHEN s->>'schema'='dabra-task-spending-v2' THEN ARRAY['modelTier'] ELSE ARRAY[]::text[] END)
  THEN RETURN NULL; END IF;
 IF r->>'schema' IS DISTINCT FROM 'dabra-answer-retention-v1' OR c->>'schema' IS DISTINCT FROM 'dabra-answer-consent-v1'
  OR d->>'schema' IS DISTINCT FROM 'dabra-answer-deletion-v1' OR a->>'schema' IS DISTINCT FROM 'dabra-task-audience-v1'
  OR (s->>'schema' IS DISTINCT FROM 'dabra-task-spending-v1' AND s->>'schema' IS DISTINCT FROM 'dabra-task-spending-v2')
  OR (s->>'schema'='dabra-task-spending-v2' AND (s->'modelTier' IS DISTINCT FROM '"economy"'::jsonb AND s->'modelTier' IS DISTINCT FROM '"strong"'::jsonb)) OR s->>'currency' IS DISTINCT FROM 'USD'
  OR s->>'timeZone' IS DISTINCT FROM 'Asia/Riyadh' OR s->'maxAttempts' IS DISTINCT FROM '1'::jsonb
  OR c->'actorId' IS DISTINCT FROM b->'actorId' OR c->'revision' IS DISTINCT FROM b->'revision'
  OR a->'actorId' IS DISTINCT FROM b->'actorId' OR a->'revision' IS DISTINCT FROM b->'revision' OR a->'role' IS DISTINCT FROM b->'role'
  OR c->'grantedAtMs' IS DISTINCT FROM b->'decisions'->'consent'->'approvedAtMs'
  OR s->'grantId' IS DISTINCT FROM b->'decisions'->'spending'->'fundingGrantId' THEN RETURN NULL; END IF;
 IF jsonb_typeof(c->'noticeVersion') IS DISTINCT FROM 'string' OR coalesce(c->>'noticeVersion','')!~'^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'
  OR c->>'noticeVersion'='task187-v1' OR jsonb_typeof(c->'noticeSha256') IS DISTINCT FROM 'string'
  OR coalesce(c->>'noticeSha256','')!~'^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['policyReference','backupPolicyReference']) k WHERE jsonb_typeof(d->k) IS DISTINCT FROM 'string' OR coalesce(d->>k,'')!~'^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['dailySuccesses','monthlySuccesses','accountMonthlyCostMicros','monthlyCostMicros','attemptCostMicros','inputTokenCeiling','outputTokenCeiling','leaseMs']) k
   WHERE jsonb_typeof(s->k) IS DISTINCT FROM 'number' OR coalesce(s->>k,'')!~'^[0-9]{1,16}$' OR (s->>k)::numeric NOT BETWEEN 1 AND 9007199254740991)
  OR jsonb_typeof(r->'answerRetentionMs') IS DISTINCT FROM 'number' OR coalesce(r->>'answerRetentionMs','')!~'^[0-9]{1,16}$'
  OR (r->>'answerRetentionMs')::numeric NOT BETWEEN 1 AND 9007199254740991-n
  OR jsonb_typeof(d->'purgeWithinMs') IS DISTINCT FROM 'number' OR coalesce(d->>'purgeWithinMs','')!~'^[0-9]{1,16}$' OR (d->>'purgeWithinMs')::numeric NOT BETWEEN 1 AND 9007199254740991
  OR jsonb_typeof(c->'generation') IS DISTINCT FROM 'number' OR coalesce(c->>'generation','')!~'^[0-9]{1,16}$' OR (c->>'generation')::numeric NOT BETWEEN 0 AND 9007199254740991
  OR (c->>'grantedAtMs')::numeric NOT BETWEEN 1 AND n THEN RETURN NULL; END IF;
 IF (s->>'dailySuccesses')::numeric>10 OR (s->>'monthlySuccesses')::numeric>50
  OR (s->>'accountMonthlyCostMicros')::numeric>500000 OR (s->>'monthlyCostMicros')::numeric>25000000
  OR (s->>'dailySuccesses')::numeric>(s->>'monthlySuccesses')::numeric
  OR (s->>'attemptCostMicros')::numeric>(s->>'accountMonthlyCostMicros')::numeric
  OR (s->>'accountMonthlyCostMicros')::numeric>(s->>'monthlyCostMicros')::numeric
  OR (s->>'attemptCostMicros')::numeric>250000 OR (s->>'inputTokenCeiling')::numeric>4096
  OR (s->>'outputTokenCeiling')::numeric>1024 OR (s->>'leaseMs')::numeric>12000 THEN RETURN NULL; END IF;
 SELECT min((value->>'expiresAtMs')::bigint) INTO expiry FROM jsonb_each(b->'decisions');
 IF expiry IS NULL OR expiry<=n THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('account_daily_successes',s->'dailySuccesses','account_monthly_successes',s->'monthlySuccesses',
  'account_monthly_cost_micros',s->'accountMonthlyCostMicros','monthly_cost_micros',s->'monthlyCostMicros','attempt_cost_micros',s->'attemptCostMicros',
  'input_tokens',s->'inputTokenCeiling','output_tokens',s->'outputTokenCeiling','lease_ms',s->'leaseMs','retention_ms',r->'answerRetentionMs',
  'model_tier',CASE WHEN s->>'schema'='dabra-task-spending-v2' THEN s->>'modelTier' ELSE 'economy' END,'grant_id',s->'grantId','approval_expires_ms',expiry);
EXCEPTION WHEN data_exception THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_dabra_production_task(
 p_attempt_id uuid,p_request_id uuid,p_actor_id uuid,p_authority_id uuid,p_execution jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_input_digest text,p_lease_token uuid,p_actor_role text,p_policy jsonb,p_expected_decisions jsonb,p_input_valid_until_ms bigint DEFAULT NULL,p_operations_binding jsonb DEFAULT NULL,p_continuity_binding jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.dabra_public_dialogue_authorities%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 c record; bundle jsonb; terms jsonb; prior private.dabra_production_tasks%ROWTYPE; v_now timestamptz; v_ms bigint; v_day bigint; v_month bigint; v_end bigint;
 v_subject text; o jsonb; r jsonb; m jsonb; calls bigint; day_calls bigint; held numeric; v_quote numeric;
BEGIN
 IF (p_input_valid_until_ms IS NOT NULL AND (p_input_valid_until_ms NOT BETWEEN 1 AND 9007199254740991 OR p_input_valid_until_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint)) OR p_input_digest IS NULL OR p_input_digest !~ '^[a-f0-9]{64}$' OR p_lease_token IS NULL
  OR p_attempt_id IS NULL OR p_request_id IS NULL OR p_actor_id IS NULL OR p_authority_id IS NULL
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096 OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 1 AND 250000 OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object'
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 -- Exclude direct writers before checking unseen keys: INSERT unique checks cannot use NOWAIT.
 -- This also acquires the write mode up front, avoiding a later implicit lock upgrade.
 LOCK TABLE private.dabra_production_tasks,private.dabra_public_dialogue_admissions IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 LOCK TABLE private.dabra_dialogue_admissions,private.dabra_dialogue_funding_grants,private.dabra_public_dialogue_authorities IN ROW SHARE MODE NOWAIT;
 bundle:=public.resolve_dabra_successful_task_decisions(p_actor_id,p_actor_role,p_policy);
 IF bundle IS NULL OR bundle IS DISTINCT FROM p_expected_decisions OR NOT private.dabra_task_operations_current(p_actor_id,p_operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,p_continuity_binding) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 terms:=private.dabra_production_task_terms(bundle);
 IF terms IS NULL THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO c FROM jsonb_to_record(terms) AS x(account_daily_successes bigint,account_monthly_successes bigint,
 account_monthly_cost_micros bigint,monthly_cost_micros bigint,attempt_cost_micros bigint,input_tokens integer,output_tokens integer,lease_ms bigint,retention_ms bigint,grant_id uuid,approval_expires_ms bigint);
 IF p_input_tokens>c.input_tokens OR p_output_tokens>c.output_tokens OR p_cost_micros>c.attempt_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO prior FROM private.dabra_production_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF FOUND THEN
  IF NOT private.dabra_public_actor_active(p_actor_id) THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF prior.input_digest<>p_input_digest OR prior.decision_bundle IS DISTINCT FROM bundle OR prior.operations_binding IS DISTINCT FROM p_operations_binding OR prior.continuity_binding IS DISTINCT FROM p_continuity_binding THEN RETURN jsonb_build_object('decision','conflict'); END IF;
  -- A duplicate is never a dispatch receipt, including failed or expired tasks.
  RETURN jsonb_build_object('decision','existing','state',prior.state);
 END IF;
 IF NOT private.dabra_public_actor_active(p_actor_id)
  OR EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO a FROM private.dabra_public_dialogue_authorities WHERE id=p_authority_id FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT a.enabled OR a.source_grant_id<>c.grant_id OR a.model_tier IS DISTINCT FROM terms->>'model_tier' THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=a.source_grant_id FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT g.enabled OR g.funding_mode<>'bounded-account-charge' OR g.proof IS DISTINCT FROM a.source_proof
  OR NOT private.valid_dabra_output_acceptances(jsonb_build_array(a.output_acceptance),jsonb_build_array(a.profile)) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 v_now:=clock_timestamp();v_ms:=floor(extract(epoch FROM v_now)*1000)::bigint;
 v_day:=floor((v_ms+10800000)::numeric/86400000)::bigint*86400000-10800000;
 v_month:=floor(extract(epoch FROM (date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 v_end:=floor(extract(epoch FROM ((date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 IF a.authorized_at>v_now THEN RETURN jsonb_build_object('decision','denied'); END IF;
 v_subject:=encode(sha256(convert_to('task217-dialogue:'||p_actor_id::text,'UTF8')),'hex');
 m:=a.profile->'measurement';o:=p_execution->'observation';
 IF (SELECT count(*) FROM jsonb_object_keys(p_execution))<>6
  OR p_execution-ARRAY['schema','authorityId','profileSha256','attemptId','requestId','observation']::text[]<>'{}'::jsonb
  OR p_execution->>'schema' IS DISTINCT FROM 'dabra-public-execution-v1' OR p_execution->>'authorityId' IS DISTINCT FROM a.id::text
  OR p_execution->>'profileSha256' IS DISTINCT FROM a.output_acceptance->>'profileSha256'
  OR p_execution->>'attemptId' IS DISTINCT FROM p_attempt_id::text OR p_execution->>'requestId' IS DISTINCT FROM p_request_id::text
  OR m->'inputTokenCeiling' IS DISTINCT FROM to_jsonb(p_input_tokens) OR m->'outputTokenCeiling' IS DISTINCT FROM to_jsonb(p_output_tokens)
  OR (m->>'latencyMs')::numeric>c.lease_ms OR (m->>'expiresAtMs')::numeric<=v_ms
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
 LOCK TABLE private.dabra_production_task_answers IN ACCESS SHARE MODE NOWAIT;
 SELECT count(*),count(*) FILTER(WHERE day_start_ms=v_day) INTO calls,day_calls
  FROM private.dabra_production_tasks WHERE month_start_ms=v_month AND actor_id=p_actor_id
   AND ((state='succeeded' AND (read_verified_at_ms IS NOT NULL OR EXISTS (
    SELECT 1 FROM private.dabra_production_task_answers x WHERE x.actor_id=dabra_production_tasks.actor_id
     AND x.request_id=dabra_production_tasks.request_id AND x.expires_at_ms>v_ms AND (input_valid_until_ms IS NULL OR input_valid_until_ms>v_ms) AND (continuity_binding IS NULL OR (continuity_binding->>'tripExpiresAtMs')::bigint>v_ms))))
    OR (state IN('pending','unknown') AND lease_expires_ms>v_ms));
 SELECT coalesce(sum(cost_micros),0) INTO held FROM private.dabra_public_dialogue_admissions
  WHERE month_start_ms=v_month AND subject_hash=v_subject;
 IF calls>=c.account_monthly_successes OR day_calls>=c.account_daily_successes OR held+p_cost_micros>c.account_monthly_cost_micros
  OR private.dabra_monthly_liability(v_month,v_end)+p_cost_micros>c.monthly_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing)
 VALUES(p_attempt_id,p_request_id,v_subject,a.id,g.id,v_day,v_month,p_input_tokens,p_output_tokens,p_cost_micros,p_execution);
 INSERT INTO private.dabra_production_tasks(actor_id,request_id,input_digest,attempt_id,day_start_ms,month_start_ms,lease_token,lease_expires_ms,actor_role,operations_binding,continuity_binding,policy,decision_bundle,retention_ms,input_valid_until_ms)
 VALUES(p_actor_id,p_request_id,p_input_digest,p_attempt_id,v_day,v_month,p_lease_token,
  least(v_ms+c.lease_ms,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint,c.approval_expires_ms),p_actor_role,p_operations_binding,p_continuity_binding,p_policy,bundle,c.retention_ms,p_input_valid_until_ms);
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=least((p_continuity_binding->>'tripExpiresAtMs')::bigint,p_input_valid_until_ms,v_ms+c.lease_ms,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint,(m->>'expiresAtMs')::bigint,c.approval_expires_ms) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task admission expired before receipt';
 END IF;
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,'pricing_expires_at_ms',
  least((p_continuity_binding->>'tripExpiresAtMs')::bigint,p_input_valid_until_ms,v_ms+c.lease_ms,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint,c.approval_expires_ms));
EXCEPTION WHEN data_exception OR lock_not_available THEN RETURN jsonb_build_object('decision','denied');
END $$;

CREATE OR REPLACE FUNCTION public.get_dabra_production_task_policy(p_actor_id uuid,p_actor_role text,p_policy jsonb,p_expected_decisions jsonb,p_operations_binding jsonb DEFAULT NULL,p_continuity_binding jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;t jsonb;r jsonb;
BEGIN
 LOCK TABLE private.dabra_public_dialogue_authorities,private.dabra_dialogue_funding_grants IN ROW SHARE MODE NOWAIT;
 b:=public.resolve_dabra_successful_task_decisions(p_actor_id,p_actor_role,p_policy);
 IF b IS NULL OR b IS DISTINCT FROM p_expected_decisions OR NOT private.dabra_task_operations_current(p_actor_id,p_operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,p_continuity_binding) THEN RETURN NULL; END IF;
 t:=private.dabra_production_task_terms(b);IF t IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('policyId','dabra-public-monthly-v1','authorities',coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)) INTO r
 FROM private.dabra_public_dialogue_authorities a JOIN private.dabra_dialogue_funding_grants g ON g.id=a.source_grant_id
 WHERE a.enabled AND a.model_tier=t->>'model_tier' AND a.authorized_at<=clock_timestamp() AND g.enabled AND g.proof=a.source_proof
 AND g.id=(t->>'grant_id')::uuid AND (a.profile->'measurement'->>'expiresAtMs')::numeric>floor(extract(epoch FROM clock_timestamp())*1000);
 RETURN r;
EXCEPTION WHEN data_exception OR lock_not_available THEN RETURN NULL;
END $$;
COMMIT;
