-- Local disabled preparation. production_apply_authorized=false. No seeds or policy values.
-- Original synthetic functions/tables and their guards are not modified.
BEGIN;
CREATE FUNCTION private.dabra_production_task_terms(b jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb:=b->'decisions'->'retention'->'document'; c jsonb:=b->'decisions'->'consent'->'document';
 d jsonb:=b->'decisions'->'deletion'->'document'; a jsonb:=b->'decisions'->'audience'->'document';
 s jsonb:=b->'decisions'->'spending'->'document'; n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; expiry bigint;
BEGIN
 IF NOT private.dabra_qualification_exact_keys(r,ARRAY['schema','answerRetentionMs'])
  OR NOT private.dabra_qualification_exact_keys(c,ARRAY['schema','actorId','revision','noticeVersion','noticeSha256','grantedAtMs','generation'])
  OR NOT private.dabra_qualification_exact_keys(d,ARRAY['schema','policyReference','purgeWithinMs','backupPolicyReference'])
  OR NOT private.dabra_qualification_exact_keys(a,ARRAY['schema','actorId','role','revision'])
  OR NOT private.dabra_qualification_exact_keys(s,ARRAY['schema','currency','timeZone','grantId','maxAttempts','dailySuccesses','monthlySuccesses','accountMonthlyCostMicros','monthlyCostMicros','attemptCostMicros','inputTokenCeiling','outputTokenCeiling','leaseMs'])
  THEN RETURN NULL; END IF;
 IF r->>'schema' IS DISTINCT FROM 'dabra-answer-retention-v1' OR c->>'schema' IS DISTINCT FROM 'dabra-answer-consent-v1'
  OR d->>'schema' IS DISTINCT FROM 'dabra-answer-deletion-v1' OR a->>'schema' IS DISTINCT FROM 'dabra-task-audience-v1'
  OR s->>'schema' IS DISTINCT FROM 'dabra-task-spending-v1' OR s->>'currency' IS DISTINCT FROM 'USD'
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
  'grant_id',s->'grantId','approval_expires_ms',expiry);
EXCEPTION WHEN data_exception THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.dabra_production_task_terms(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Exact ECMAScript trim WhiteSpace + LineTerminator code points, not POSIX space.
CREATE FUNCTION private.dabra_task_trim(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT btrim(p,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
REVOKE ALL ON FUNCTION private.dabra_task_trim(text) FROM PUBLIC,anon,authenticated,service_role;
-- Authenticated server binding only. No new grants, policy rows or permission rules.
CREATE FUNCTION private.dabra_task_operations_current(p_actor uuid,p_binding jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.team_access_grants%ROWTYPE; source_role text; actual jsonb;
BEGIN
 IF p_binding IS NULL THEN RETURN true; END IF;
 IF NOT private.dabra_qualification_exact_keys(p_binding,ARRAY['schema','actorId','country','kind','grant'])
  OR p_binding->>'schema' IS DISTINCT FROM 'dabra-operations-binding-v1'
  OR p_binding->>'actorId' IS DISTINCT FROM p_actor::text OR p_binding->>'country' IS DISTINCT FROM 'EG' THEN RETURN false; END IF;
 -- SHARE prevents grant insertion/replacement between selection and proof; all
 -- table acquisition is NOWAIT before row reads. No waiting lock upgrade.
 LOCK TABLE auth.users,public.profiles IN ROW SHARE MODE NOWAIT;
 LOCK TABLE public.team_access_grants IN SHARE MODE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id=p_actor FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT role INTO source_role FROM public.profiles WHERE id=p_actor FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT private.dabra_public_actor_active(p_actor) THEN RETURN false; END IF;
 IF p_binding->>'kind'='ceo' THEN
  RETURN p_actor='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid AND source_role='admin' AND p_binding->'grant'='null'::jsonb;
 END IF;
 IF p_binding->>'kind' IS DISTINCT FROM 'grant' OR source_role NOT IN('staff','admin','super_admin') THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.team_access_grants WHERE invited_user_id=p_actor)<>1 THEN RETURN false; END IF;
 SELECT * INTO g FROM public.team_access_grants WHERE invited_user_id=p_actor FOR SHARE NOWAIT;
 IF NOT FOUND OR g.status<>'active' OR g.access_level NOT IN('scoped_staff','global_admin')
  OR cardinality(g.permissions)=0 OR NOT g.permissions <@ ARRAY['admin:full','operations:read','operations:write','customers:read','customers:write','partners:read','partners:write','products:read','products:write','finance:read','finance:write','verification:read','verification:write']::text[]
  OR EXISTS(SELECT 1 FROM unnest(g.country_scope) c WHERE c IS NULL OR private.dabra_task_trim(c)='')
  OR EXISTS(SELECT 1 FROM unnest(g.permissions) p WHERE p IS NULL)
  OR NOT (g.access_level='global_admin' OR 'admin:full'=ANY(g.permissions) OR 'operations:read'=ANY(g.permissions))
  OR NOT (g.access_level='global_admin' OR 'admin:full'=ANY(g.permissions)
   OR EXISTS(SELECT 1 FROM unnest(g.country_scope) c WHERE public.normalize_admin_country_key(private.dabra_task_trim(c))='EG')) THEN RETURN false; END IF;
 actual:=jsonb_build_object('id',g.id,'invited_user_id',g.invited_user_id,'access_level',g.access_level,
  'status',g.status,'country_scope',g.country_scope,'permissions',g.permissions);
 RETURN actual=p_binding->'grant';
EXCEPTION WHEN lock_not_available THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.dabra_task_operations_current(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Existing Task187 contract only; absent/mismatched dependency fails closed.
CREATE FUNCTION private.dabra_task_continuity_current(p_actor uuid,p_binding jsonb,p_allow_expired boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p record; r record; locked_count bigint; valid boolean;
BEGIN
 IF p_binding IS NULL THEN RETURN true; END IF;
 IF NOT private.dabra_qualification_exact_keys(p_binding,ARRAY['schema','ownerId','revision','generation','tripId','tripExpiresAtMs','originalTrip'])
  OR p_binding->>'schema' IS DISTINCT FROM 'dabra-task-continuity-v1' OR p_binding->>'ownerId' IS DISTINCT FROM p_actor::text
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['revision','generation','tripExpiresAtMs']) k WHERE jsonb_typeof(p_binding->k) IS DISTINCT FROM 'number'
   OR coalesce(p_binding->>k,'')!~'^[0-9]{1,16}$' OR (p_binding->>k)::numeric NOT BETWEEN 0 AND 9007199254740991)
  OR p_binding->>'tripId' IS DISTINCT FROM p_binding->'originalTrip'->>'id' THEN RETURN false; END IF;
 IF to_regclass('public.dabra_continuity_policy') IS NULL OR to_regclass('public.dabra_account_continuity') IS NULL THEN RETURN false; END IF;
 LOCK TABLE auth.users,public.profiles IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id=p_actor FOR SHARE NOWAIT;IF NOT FOUND THEN RETURN false;END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_actor AND role IN('customer','client') AND status='active' AND deleted_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT private.dabra_public_actor_active(p_actor) THEN RETURN false; END IF;
 EXECUTE 'LOCK TABLE public.dabra_continuity_policy,public.dabra_account_continuity IN ROW SHARE MODE NOWAIT';
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.dabra_continuity_policy','singleton','boolean'),('public.dabra_continuity_policy','enabled','boolean'),
  ('public.dabra_account_continuity','owner_id','uuid'),('public.dabra_account_continuity','revision','bigint'),('public.dabra_account_continuity','generation','bigint'),
  ('public.dabra_account_continuity','consent_enabled','boolean'),('public.dabra_account_continuity','consent_version','text'),
  ('public.dabra_account_continuity','trip','jsonb'),('public.dabra_account_continuity','trip_expires_at','timestamp with time zone')) v(rel,col,typ)
  WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(v.rel) AND a.attname=v.col AND NOT a.attisdropped AND a.atttypid=to_regtype(v.typ))) THEN RETURN false; END IF;
 -- Preserve the source contract's unique owner/singleton keys against phantom rows.
 IF EXISTS(SELECT 1 FROM (VALUES ('public.dabra_continuity_policy','singleton'),('public.dabra_account_continuity','owner_id')) v(rel,col)
  WHERE NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname=v.col
   WHERE i.indrelid=to_regclass(v.rel) AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum)) THEN RETURN false; END IF;
 EXECUTE 'SELECT singleton,enabled FROM public.dabra_continuity_policy WHERE singleton=true FOR SHARE NOWAIT' INTO p;
 GET DIAGNOSTICS locked_count=ROW_COUNT;IF locked_count<>1 OR p.enabled IS DISTINCT FROM true THEN RETURN false;END IF;
 EXECUTE 'SELECT owner_id,revision,generation,consent_enabled,consent_version,trip,trip_expires_at FROM public.dabra_account_continuity WHERE owner_id=$1 FOR SHARE NOWAIT' INTO r USING p_actor;
 GET DIAGNOSTICS locked_count=ROW_COUNT;IF locked_count<>1 THEN RETURN false;END IF;
 IF r.owner_id IS DISTINCT FROM p_actor OR r.revision::text IS DISTINCT FROM p_binding->>'revision'
  OR r.generation::text IS DISTINCT FROM p_binding->>'generation' OR r.consent_enabled IS DISTINCT FROM true
  OR r.consent_version IS DISTINCT FROM 'task187-v1' OR r.trip IS DISTINCT FROM p_binding->'originalTrip'
  OR r.trip->>'id' IS DISTINCT FROM p_binding->>'tripId' OR r.trip_expires_at IS NULL
  OR floor(extract(epoch FROM r.trip_expires_at)*1000)::bigint IS DISTINCT FROM (p_binding->>'tripExpiresAtMs')::bigint THEN RETURN false; END IF;
 EXECUTE 'SELECT public.dabra_continuity_trip_valid($1)' INTO valid USING r.trip;
 -- Only read settlement may accept elapsed time; identity/consent/content locks remain mandatory.
 RETURN valid IS TRUE AND (p_allow_expired IS TRUE OR (p_binding->>'tripExpiresAtMs')::bigint>floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function OR wrong_object_type OR datatype_mismatch OR data_exception OR lock_not_available THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.dabra_task_continuity_current(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.dabra_production_tasks (
 actor_id uuid NOT NULL,request_id uuid NOT NULL,input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
 attempt_id uuid NOT NULL UNIQUE REFERENCES private.dabra_public_dialogue_admissions(attempt_id) ON DELETE RESTRICT,
 day_start_ms bigint NOT NULL,month_start_ms bigint NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','succeeded','failed','unknown')),
 lease_token uuid NOT NULL,lease_expires_ms bigint NOT NULL,finished_at_ms bigint,read_verified_at_ms bigint,input_valid_until_ms bigint CHECK(input_valid_until_ms BETWEEN 1 AND 9007199254740991),answer_digest text CHECK(answer_digest ~ '^[a-f0-9]{64}$'),
 content_removed_at_ms bigint,actor_role text NOT NULL,operations_binding jsonb,continuity_binding jsonb,policy jsonb NOT NULL,decision_bundle jsonb NOT NULL,retention_ms bigint NOT NULL CHECK(retention_ms>0),PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE private.dabra_production_task_answers (
 actor_id uuid NOT NULL,request_id uuid NOT NULL,answer text NOT NULL CHECK(length(answer) BETWEEN 1 AND 64000),
 language text NOT NULL CHECK(language IN('ar','en')),expires_at_ms bigint NOT NULL,
 PRIMARY KEY(actor_id,request_id),FOREIGN KEY(actor_id,request_id) REFERENCES private.dabra_production_tasks(actor_id,request_id) ON DELETE RESTRICT
);
CREATE INDEX dabra_production_task_period ON private.dabra_production_tasks(actor_id,month_start_ms,day_start_ms);
ALTER TABLE private.dabra_production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_production_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_production_task_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_production_task_answers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_production_tasks,private.dabra_production_task_answers FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_dabra_production_task(
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
 IF NOT FOUND OR NOT a.enabled OR a.source_grant_id<>c.grant_id OR a.model_tier<>'economy' THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
CREATE FUNCTION public.finish_dabra_production_task(p_actor_id uuid,p_request_id uuid,p_input_digest text,p_lease_token uuid,p_outcome text,p_answer text DEFAULT NULL,p_language text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.dabra_production_tasks%ROWTYPE; n bigint; checked_ms bigint; d text;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN('succeeded','failed','unknown') THEN RETURN NULL; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 -- Acquire write-table locks before making any time/eligibility decision.
 LOCK TABLE private.dabra_production_tasks IN ROW EXCLUSIVE MODE NOWAIT;
 -- Exclude direct answer INSERTs before locking their FK parent: otherwise opposite
 -- unique-index/FK acquisition can cycle while holding the shared admission lock.
 LOCK TABLE private.dabra_production_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 SELECT * INTO t FROM private.dabra_production_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR t.content_removed_at_ms IS NOT NULL OR t.input_digest IS DISTINCT FROM p_input_digest OR t.lease_token IS DISTINCT FROM p_lease_token THEN RETURN NULL; END IF;
 -- Fixed nonblocking order: shared admission lock, task/data locks, control, user, profile.
 -- Revocation either commits before these locks and is observed, or waits for this transaction.
 IF public.resolve_dabra_successful_task_decisions(p_actor_id,t.actor_role,t.policy) IS DISTINCT FROM t.decision_bundle OR NOT private.dabra_task_operations_current(p_actor_id,t.operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,t.continuity_binding) THEN RETURN NULL; END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF t.state IN('succeeded','failed') THEN RETURN jsonb_build_object('state',t.state); END IF;
 IF t.lease_expires_ms<=n OR t.day_start_ms<>floor((n+10800000)::numeric/86400000)::bigint*86400000-10800000 THEN
  UPDATE private.dabra_production_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  RETURN jsonb_build_object('state','unknown');
 END IF;
 BEGIN
  IF p_outcome='succeeded' THEN
   IF t.retention_ms>9007199254740991-n THEN RETURN NULL; END IF;
   IF p_answer IS NULL OR length(btrim(p_answer)) NOT BETWEEN 1 AND 64000 OR p_language IS NULL OR p_language NOT IN('ar','en') THEN RETURN NULL; END IF;
   d:=encode(sha256(convert_to(p_answer,'UTF8')),'hex');
   INSERT INTO private.dabra_production_task_answers VALUES(p_actor_id,p_request_id,p_answer,p_language,n+t.retention_ms);
  END IF;
  UPDATE private.dabra_production_tasks SET state=p_outcome,answer_digest=d,
   finished_at_ms=CASE WHEN p_outcome='unknown' THEN NULL ELSE n END
   WHERE actor_id=p_actor_id AND request_id=p_request_id;
  -- Fence after all writes too. The subtransaction rolls back answer/state together on expiry.
  checked_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF (p_outcome='succeeded' AND (n+t.retention_ms<=checked_ms OR t.input_valid_until_ms<=checked_ms OR (t.continuity_binding->>'tripExpiresAtMs')::bigint<=checked_ms)) OR t.lease_expires_ms<=checked_ms OR t.day_start_ms<>floor((checked_ms+10800000)::numeric/86400000)::bigint*86400000-10800000 THEN
   RAISE EXCEPTION USING ERRCODE='P2371',MESSAGE='Task completion lease expired';
  END IF;
 EXCEPTION WHEN SQLSTATE 'P2371' THEN
  UPDATE private.dabra_production_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  RETURN jsonb_build_object('state','unknown');
 END;
 -- Cost/admission rows are deliberately never updated or refunded here.
 RETURN jsonb_build_object('state',p_outcome);
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;

CREATE FUNCTION public.read_dabra_production_task(p_actor_id uuid,p_request_id uuid,p_input_digest text,p_actor_role text,p_policy jsonb,p_expected_decisions jsonb,p_confirm_read boolean DEFAULT false,p_operations_binding jsonb DEFAULT NULL,p_continuity_binding jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.dabra_production_tasks%ROWTYPE; a private.dabra_production_task_answers%ROWTYPE; n bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 LOCK TABLE private.dabra_production_tasks IN ROW EXCLUSIVE MODE NOWAIT;
 SELECT * INTO t FROM private.dabra_production_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE NOWAIT;
 LOCK TABLE private.dabra_production_task_answers IN ROW SHARE MODE NOWAIT;
 IF p_expected_decisions IS NULL OR public.resolve_dabra_successful_task_decisions(p_actor_id,p_actor_role,p_policy) IS DISTINCT FROM p_expected_decisions THEN RETURN NULL; END IF;
 IF NOT private.dabra_task_operations_current(p_actor_id,p_operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,p_continuity_binding,true) THEN RETURN NULL; END IF;
 IF t.actor_id IS NULL THEN RETURN jsonb_build_object('state','absent'); END IF;
 IF NOT private.dabra_task_operations_current(p_actor_id,t.operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,t.continuity_binding,true) THEN RETURN NULL; END IF;
 IF t.content_removed_at_ms IS NOT NULL THEN RETURN jsonb_build_object('state','failed');END IF;
 IF t.continuity_binding IS DISTINCT FROM p_continuity_binding OR t.operations_binding IS DISTINCT FROM p_operations_binding OR t.decision_bundle IS DISTINCT FROM p_expected_decisions OR t.input_digest IS DISTINCT FROM p_input_digest THEN RETURN jsonb_build_object('state','conflict'); END IF;
 SELECT * INTO a FROM private.dabra_production_task_answers WHERE actor_id=p_actor_id AND request_id=p_request_id FOR SHARE NOWAIT;
 -- No account-wide cleanup in a retrieval. Purge remains a separate bounded operation.
 -- Fresh time after every potentially blocking answer lock; retain eligibility locks through return.
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF a.expires_at_ms<=n OR t.input_valid_until_ms<=n OR (t.continuity_binding->>'tripExpiresAtMs')::bigint<=n THEN
  a.answer:=NULL; a.language:=NULL; a.expires_at_ms:=NULL;
  -- No owner-read proof before expiry: release success capacity, never cost or UUID.
  IF t.state='succeeded' AND t.read_verified_at_ms IS NULL THEN
   UPDATE private.dabra_production_tasks SET state='failed' WHERE actor_id=p_actor_id AND request_id=p_request_id;
   t.state:='failed';
  END IF;
 END IF;
 IF p_confirm_read AND t.state='succeeded' AND a.answer IS NOT NULL THEN
  UPDATE private.dabra_production_tasks SET read_verified_at_ms=coalesce(read_verified_at_ms,n)
   WHERE actor_id=p_actor_id AND request_id=p_request_id;
 END IF;
 IF t.state='pending' AND t.lease_expires_ms<=n THEN
  UPDATE private.dabra_production_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  t.state:='unknown';
 END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF EXISTS(SELECT 1 FROM jsonb_each(t.decision_bundle->'decisions') d WHERE (d.value->>'expiresAtMs')::bigint<=n) THEN
  IF t.read_verified_at_ms IS NULL THEN
   UPDATE private.dabra_production_tasks SET read_verified_at_ms=NULL WHERE actor_id=p_actor_id AND request_id=p_request_id;
  END IF;
  RETURN NULL;
 END IF;
 IF a.expires_at_ms<=n OR t.input_valid_until_ms<=n OR (t.continuity_binding->>'tripExpiresAtMs')::bigint<=n THEN
  a.answer:=NULL;a.language:=NULL;a.expires_at_ms:=NULL;
  IF t.state='succeeded' AND t.read_verified_at_ms IS NULL THEN
   UPDATE private.dabra_production_tasks SET state='failed',read_verified_at_ms=NULL WHERE actor_id=p_actor_id AND request_id=p_request_id;
   t.state:='failed';
  END IF;
 END IF;
 RETURN jsonb_build_object('state',t.state,'pending',t.state IN('pending','unknown') AND t.lease_expires_ms>n,
  'answer',a.answer,'language',a.language,'expiresAtMs',a.expires_at_ms,'inputValidUntilMs',t.input_valid_until_ms,'tripValidUntilMs',(t.continuity_binding->>'tripExpiresAtMs')::bigint);
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;

-- Owner-only UUID lookup. All original answer/input bindings stay inside Core.
CREATE FUNCTION public.retrieve_dabra_production_task(p_actor_id uuid,p_request_id uuid,p_actor_role text,p_policy jsonb,p_expected_decisions jsonb,p_operations_binding jsonb DEFAULT NULL,p_continuity_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original_digest text; original_continuity jsonb;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 LOCK TABLE private.dabra_production_tasks IN ROW EXCLUSIVE MODE NOWAIT;
 SELECT input_digest,continuity_binding INTO original_digest,original_continuity FROM private.dabra_production_tasks
  WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE NOWAIT;
 -- Application switch is supplied only by the server, never the UUID request body.
 IF original_continuity IS NOT NULL AND p_continuity_enabled IS DISTINCT FROM true THEN RETURN NULL; END IF;
 -- Missing/foreign UUIDs still pass the same identity/decision/grant fences.
 RETURN public.read_dabra_production_task(p_actor_id,p_request_id,original_digest,p_actor_role,p_policy,p_expected_decisions,true,p_operations_binding,original_continuity);
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.retrieve_dabra_production_task(uuid,uuid,text,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.retrieve_dabra_production_task(uuid,uuid,text,jsonb,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION public.get_dabra_production_task_policy(p_actor_id uuid,p_actor_role text,p_policy jsonb,p_expected_decisions jsonb,p_operations_binding jsonb DEFAULT NULL,p_continuity_binding jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;t jsonb;r jsonb;
BEGIN
 LOCK TABLE private.dabra_public_dialogue_authorities,private.dabra_dialogue_funding_grants IN ROW SHARE MODE NOWAIT;
 b:=public.resolve_dabra_successful_task_decisions(p_actor_id,p_actor_role,p_policy);
 IF b IS NULL OR b IS DISTINCT FROM p_expected_decisions OR NOT private.dabra_task_operations_current(p_actor_id,p_operations_binding) OR NOT private.dabra_task_continuity_current(p_actor_id,p_continuity_binding) THEN RETURN NULL; END IF;
 t:=private.dabra_production_task_terms(b);IF t IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('policyId','dabra-public-monthly-v1','authorities',coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)) INTO r
 FROM private.dabra_public_dialogue_authorities a JOIN private.dabra_dialogue_funding_grants g ON g.id=a.source_grant_id
 WHERE a.enabled AND a.model_tier='economy' AND a.authorized_at<=clock_timestamp() AND g.enabled AND g.proof=a.source_proof
 AND g.id=(t->>'grant_id')::uuid AND (a.profile->'measurement'->>'expiresAtMs')::numeric>floor(extract(epoch FROM clock_timestamp())*1000);
 RETURN r;
EXCEPTION WHEN data_exception OR lock_not_available THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.get_dabra_production_task_policy(uuid,text,jsonb,jsonb,jsonb,jsonb),
 public.reserve_dabra_production_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid,text,jsonb,jsonb,bigint,jsonb,jsonb),
 public.finish_dabra_production_task(uuid,uuid,text,uuid,text,text,text),
 public.read_dabra_production_task(uuid,uuid,text,text,jsonb,jsonb,boolean,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_dabra_production_task_policy(uuid,text,jsonb,jsonb,jsonb,jsonb),
 public.reserve_dabra_production_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid,text,jsonb,jsonb,bigint,jsonb,jsonb),
 public.finish_dabra_production_task(uuid,uuid,text,uuid,text,text,text),
 public.read_dabra_production_task(uuid,uuid,text,text,jsonb,jsonb,boolean,jsonb,jsonb) TO service_role;
COMMIT;
