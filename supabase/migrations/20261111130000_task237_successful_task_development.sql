-- Task237: DEVELOPMENT candidate only. No Production application authorized.
-- 24 hours is a synthetic-data development assumption, NOT real-answer retention consent.
-- No existing control, authority, historical migration or cost row is changed.
BEGIN;
CREATE TABLE private.dabra_successful_task_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 monthly_cost_micros bigint NOT NULL DEFAULT 25000000 CHECK(monthly_cost_micros=25000000),
 account_monthly_cost_micros bigint NOT NULL DEFAULT 500000 CHECK(account_monthly_cost_micros=500000),
 account_daily_successes integer NOT NULL DEFAULT 10 CHECK(account_daily_successes=10),
 account_monthly_successes integer NOT NULL DEFAULT 50 CHECK(account_monthly_successes=50)
);
-- Empty control table, no install-time enablement. Only isolated synthetic test DBs can use these RPCs.
CREATE FUNCTION private.dabra_successful_task_development_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT current_database() ~ '^task237_synthetic_[a-f0-9]{32}$'
  AND EXISTS(SELECT 1 FROM private.dabra_successful_task_control WHERE singleton AND enabled)
$$;
CREATE TABLE private.dabra_successful_tasks (
 actor_id uuid NOT NULL, request_id uuid NOT NULL, input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
 attempt_id uuid NOT NULL UNIQUE REFERENCES private.dabra_public_dialogue_admissions(attempt_id) ON DELETE RESTRICT,
 day_start_ms bigint NOT NULL, month_start_ms bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','succeeded','failed','unknown')),
 lease_token uuid NOT NULL, lease_expires_ms bigint NOT NULL,
 finished_at_ms bigint, answer_digest text CHECK(answer_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(actor_id,request_id)
);
-- Content is deletable independently of immutable admitted cost and task evidence.
CREATE TABLE private.dabra_successful_task_answers (
 actor_id uuid NOT NULL, request_id uuid NOT NULL, answer text NOT NULL CHECK(length(answer) BETWEEN 1 AND 64000),
 language text NOT NULL CHECK(language IN('ar','en')), expires_at_ms bigint NOT NULL,
 PRIMARY KEY(actor_id,request_id), FOREIGN KEY(actor_id,request_id) REFERENCES private.dabra_successful_tasks(actor_id,request_id) ON DELETE RESTRICT
);
CREATE INDEX dabra_successful_task_period ON private.dabra_successful_tasks(actor_id,month_start_ms,day_start_ms);
ALTER TABLE private.dabra_successful_task_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_task_control FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_task_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_task_answers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_successful_task_control,private.dabra_successful_tasks,private.dabra_successful_task_answers FROM PUBLIC,anon,authenticated,service_role;

-- Private shared eligibility boundary. Call only after nonblocking task/data locks.
CREATE FUNCTION private.dabra_successful_task_actor_locked(p_actor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 LOCK TABLE private.dabra_successful_task_control,auth.users,public.profiles IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM private.dabra_successful_task_control WHERE singleton FOR SHARE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id=p_actor_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.profiles WHERE id=p_actor_id FOR SHARE NOWAIT;
 RETURN private.dabra_successful_task_development_enabled() AND private.dabra_public_actor_active(p_actor_id);
END $$;
REVOKE ALL ON FUNCTION private.dabra_successful_task_actor_locked(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reserve_dabra_successful_task(
 p_attempt_id uuid,p_request_id uuid,p_actor_id uuid,p_authority_id uuid,p_execution jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_input_digest text,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.dabra_public_dialogue_authorities%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 c private.dabra_successful_task_control%ROWTYPE; prior private.dabra_successful_tasks%ROWTYPE; v_now timestamptz; v_ms bigint; v_day bigint; v_month bigint; v_end bigint;
 v_subject text; o jsonb; r jsonb; m jsonb; calls bigint; day_calls bigint; held numeric; v_quote numeric;
BEGIN
 IF current_database() !~ '^task237_synthetic_[a-f0-9]{32}$' OR p_input_digest IS NULL OR p_input_digest !~ '^[a-f0-9]{64}$' OR p_lease_token IS NULL
  OR p_attempt_id IS NULL OR p_request_id IS NULL OR p_actor_id IS NULL OR p_authority_id IS NULL
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096 OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 1 AND 250000 OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object'
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 -- Exclude direct writers before checking unseen keys: INSERT unique checks cannot use NOWAIT.
 -- This also acquires the write mode up front, avoiding a later implicit lock upgrade.
 LOCK TABLE private.dabra_successful_tasks,private.dabra_public_dialogue_admissions IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 LOCK TABLE private.dabra_dialogue_admissions,private.dabra_dialogue_funding_grants,private.dabra_public_dialogue_authorities IN ROW SHARE MODE NOWAIT;
 IF NOT private.dabra_successful_task_actor_locked(p_actor_id) THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO c FROM private.dabra_successful_task_control WHERE singleton FOR SHARE NOWAIT;
 SELECT * INTO prior FROM private.dabra_successful_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF FOUND THEN
  IF NOT private.dabra_public_actor_active(p_actor_id) THEN RETURN jsonb_build_object('decision','denied'); END IF;
  IF prior.input_digest<>p_input_digest THEN RETURN jsonb_build_object('decision','conflict'); END IF;
  -- A duplicate is never a dispatch receipt, including failed or expired tasks.
  RETURN jsonb_build_object('decision','existing','state',prior.state);
 END IF;
 IF c.singleton IS NULL OR NOT c.enabled OR NOT private.dabra_public_actor_active(p_actor_id)
  OR EXISTS(SELECT 1 FROM private.dabra_public_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  OR EXISTS(SELECT 1 FROM private.dabra_dialogue_admissions WHERE request_id=p_request_id OR attempt_id=p_attempt_id)
  THEN RETURN jsonb_build_object('decision','denied'); END IF;
 SELECT * INTO a FROM private.dabra_public_dialogue_authorities WHERE id=p_authority_id FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT a.enabled OR a.model_tier<>'economy' THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
 SELECT count(*),count(*) FILTER(WHERE day_start_ms=v_day) INTO calls,day_calls
  FROM private.dabra_successful_tasks WHERE month_start_ms=v_month AND actor_id=p_actor_id
   AND (state='succeeded' OR (state IN('pending','unknown') AND lease_expires_ms>v_ms));
 SELECT coalesce(sum(cost_micros),0) INTO held FROM private.dabra_public_dialogue_admissions
  WHERE month_start_ms=v_month AND subject_hash=v_subject;
 IF calls>=c.account_monthly_successes OR day_calls>=c.account_daily_successes OR held+p_cost_micros>c.account_monthly_cost_micros
  OR private.dabra_monthly_liability(v_month,v_end)+p_cost_micros>c.monthly_cost_micros THEN RETURN jsonb_build_object('decision','denied'); END IF;
 INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing)
 VALUES(p_attempt_id,p_request_id,v_subject,a.id,g.id,v_day,v_month,p_input_tokens,p_output_tokens,p_cost_micros,p_execution);
 INSERT INTO private.dabra_successful_tasks(actor_id,request_id,input_digest,attempt_id,day_start_ms,month_start_ms,lease_token,lease_expires_ms)
 VALUES(p_actor_id,p_request_id,p_input_digest,p_attempt_id,v_day,v_month,p_lease_token,
  least(v_ms+12000,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint));
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>=least(v_ms+12000,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint,(m->>'expiresAtMs')::bigint) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task admission expired before receipt';
 END IF;
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id,'pricing_expires_at_ms',
  least(v_ms+12000,v_day+86400000,v_end,(o->>'expiresAtMs')::bigint));
EXCEPTION WHEN data_exception OR lock_not_available THEN RETURN jsonb_build_object('decision','denied');
END $$;
CREATE FUNCTION public.get_dabra_successful_task_policy(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.dabra_public_actor_active(p_actor_id) OR NOT private.dabra_successful_task_development_enabled() THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('policyId','dabra-public-monthly-v1','authorities',coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb)) INTO result
 FROM private.dabra_public_dialogue_authorities a JOIN private.dabra_dialogue_funding_grants g ON g.id=a.source_grant_id
 WHERE a.enabled AND a.model_tier='economy' AND a.authorized_at<=clock_timestamp() AND g.enabled AND g.proof=a.source_proof
  AND (a.profile->'measurement'->>'expiresAtMs')::numeric>floor(extract(epoch FROM clock_timestamp())*1000);
 RETURN result;
END $$;


-- No direct function/table grant to browser identities. Authenticated actor is resolved by the server.
CREATE FUNCTION public.finish_dabra_successful_task(p_actor_id uuid,p_request_id uuid,p_input_digest text,p_lease_token uuid,p_outcome text,p_answer text DEFAULT NULL,p_language text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.dabra_successful_tasks%ROWTYPE; n bigint; checked_ms bigint; d text;
BEGIN
 IF current_database() !~ '^task237_synthetic_[a-f0-9]{32}$'
  OR p_outcome IS NULL OR p_outcome NOT IN('succeeded','failed','unknown') THEN RETURN NULL; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 -- Acquire write-table locks before making any time/eligibility decision.
 LOCK TABLE private.dabra_successful_tasks IN ROW EXCLUSIVE MODE NOWAIT;
 -- Exclude direct answer INSERTs before locking their FK parent: otherwise opposite
 -- unique-index/FK acquisition can cycle while holding the shared admission lock.
 LOCK TABLE private.dabra_successful_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 SELECT * INTO t FROM private.dabra_successful_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR t.input_digest IS DISTINCT FROM p_input_digest OR t.lease_token IS DISTINCT FROM p_lease_token THEN RETURN NULL; END IF;
 -- Fixed nonblocking order: shared admission lock, task/data locks, control, user, profile.
 -- Revocation either commits before these locks and is observed, or waits for this transaction.
 IF NOT private.dabra_successful_task_actor_locked(p_actor_id) THEN RETURN NULL; END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF t.state IN('succeeded','failed') THEN RETURN jsonb_build_object('state',t.state); END IF;
 IF t.lease_expires_ms<=n OR t.day_start_ms<>floor((n+10800000)::numeric/86400000)::bigint*86400000-10800000 THEN
  UPDATE private.dabra_successful_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  RETURN jsonb_build_object('state','unknown');
 END IF;
 BEGIN
  IF p_outcome='succeeded' THEN
   IF p_answer IS NULL OR length(btrim(p_answer)) NOT BETWEEN 1 AND 64000 OR p_language IS NULL OR p_language NOT IN('ar','en') THEN RETURN NULL; END IF;
   d:=encode(sha256(convert_to(p_answer,'UTF8')),'hex');
   INSERT INTO private.dabra_successful_task_answers VALUES(p_actor_id,p_request_id,p_answer,p_language,n+86400000);
  END IF;
  UPDATE private.dabra_successful_tasks SET state=p_outcome,answer_digest=d,
   finished_at_ms=CASE WHEN p_outcome='unknown' THEN NULL ELSE n END
   WHERE actor_id=p_actor_id AND request_id=p_request_id;
  -- Fence after all writes too. The subtransaction rolls back answer/state together on expiry.
  checked_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF t.lease_expires_ms<=checked_ms OR t.day_start_ms<>floor((checked_ms+10800000)::numeric/86400000)::bigint*86400000-10800000 THEN
   RAISE EXCEPTION USING ERRCODE='P2371',MESSAGE='Task completion lease expired';
  END IF;
 EXCEPTION WHEN SQLSTATE 'P2371' THEN
  UPDATE private.dabra_successful_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  RETURN jsonb_build_object('state','unknown');
 END;
 -- Cost/admission rows are deliberately never updated or refunded here.
 RETURN jsonb_build_object('state',p_outcome);
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;

CREATE FUNCTION public.read_dabra_successful_task(p_actor_id uuid,p_request_id uuid,p_input_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t private.dabra_successful_tasks%ROWTYPE; a private.dabra_successful_task_answers%ROWTYPE; n bigint;
BEGIN
 IF current_database() !~ '^task237_synthetic_[a-f0-9]{32}$' THEN RETURN NULL; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 LOCK TABLE private.dabra_successful_tasks IN ROW EXCLUSIVE MODE NOWAIT;
 SELECT * INTO t FROM private.dabra_successful_tasks WHERE actor_id=p_actor_id AND request_id=p_request_id FOR UPDATE NOWAIT;
 LOCK TABLE private.dabra_successful_task_answers IN ROW SHARE MODE NOWAIT;
 IF NOT private.dabra_successful_task_actor_locked(p_actor_id) THEN RETURN NULL; END IF;
 IF t.actor_id IS NULL THEN RETURN jsonb_build_object('state','absent'); END IF;
 IF t.input_digest IS DISTINCT FROM p_input_digest THEN RETURN jsonb_build_object('state','conflict'); END IF;
 SELECT * INTO a FROM private.dabra_successful_task_answers WHERE actor_id=p_actor_id AND request_id=p_request_id FOR SHARE NOWAIT;
 -- No account-wide cleanup in a retrieval. Purge remains a separate bounded operation.
 -- Fresh time after every potentially blocking answer lock; retain eligibility locks through return.
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF a.expires_at_ms<=n THEN a.answer:=NULL; a.language:=NULL; a.expires_at_ms:=NULL; END IF;
 IF t.state='pending' AND t.lease_expires_ms<=n THEN
  UPDATE private.dabra_successful_tasks SET state='unknown' WHERE actor_id=p_actor_id AND request_id=p_request_id;
  t.state:='unknown';
 END IF;
 RETURN jsonb_build_object('state',t.state,'pending',t.state IN('pending','unknown') AND t.lease_expires_ms>n,
  'answer',a.answer,'language',a.language,'expiresAtMs',a.expires_at_ms);
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;

CREATE FUNCTION public.get_dabra_successful_task_allowance(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz; n bigint; day_ms bigint; month_ms bigint; end_ms bigint; result jsonb; s text;
BEGIN
 IF current_database() !~ '^task237_synthetic_[a-f0-9]{32}$' THEN RETURN NULL; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 LOCK TABLE private.dabra_successful_tasks,private.dabra_public_dialogue_admissions,private.dabra_dialogue_admissions,private.dabra_dialogue_funding_grants IN ACCESS SHARE MODE NOWAIT;
 IF NOT private.dabra_successful_task_actor_locked(p_actor_id) THEN RETURN NULL; END IF;
 v_now:=clock_timestamp(); n:=floor(extract(epoch FROM v_now)*1000)::bigint;
 day_ms:=floor((n+10800000)::numeric/86400000)::bigint*86400000-10800000;
 month_ms:=floor(extract(epoch FROM (date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 end_ms:=floor(extract(epoch FROM ((date_trunc('month',v_now AT TIME ZONE 'Asia/Riyadh')+interval '1 month') AT TIME ZONE 'Asia/Riyadh'))*1000)::bigint;
 s:=encode(sha256(convert_to('task217-dialogue:'||p_actor_id::text,'UTF8')),'hex');
 SELECT jsonb_build_object('dailySucceeded',count(*) FILTER(WHERE state='succeeded' AND day_start_ms=day_ms),
  'monthlySucceeded',count(*) FILTER(WHERE state='succeeded'),
  'dailyPending',count(*) FILTER(WHERE state IN('pending','unknown') AND lease_expires_ms>n AND day_start_ms=day_ms),
  'monthlyPending',count(*) FILTER(WHERE state IN('pending','unknown') AND lease_expires_ms>n),
  'accountHeldCostMicros',(SELECT coalesce(sum(cost_micros),0) FROM private.dabra_public_dialogue_admissions WHERE month_start_ms=month_ms AND subject_hash=s),
  'totalHeldCostMicros',private.dabra_monthly_liability(month_ms,end_ms)) INTO result
 FROM private.dabra_successful_tasks WHERE actor_id=p_actor_id AND month_start_ms=month_ms;
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;

-- Explicit deletion/revocation and bounded physical expiry purge do not erase accounting history.
CREATE FUNCTION public.purge_dabra_successful_task_answers(p_actor_id uuid DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed bigint;
BEGIN
 IF NOT private.dabra_successful_task_development_enabled() THEN RETURN 0; END IF;
 WITH expired AS (SELECT actor_id,request_id FROM private.dabra_successful_task_answers
  WHERE expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint OR actor_id=p_actor_id
  ORDER BY expires_at_ms LIMIT 1000 FOR UPDATE SKIP LOCKED)
 DELETE FROM private.dabra_successful_task_answers a USING expired e WHERE a.actor_id=e.actor_id AND a.request_id=e.request_id;
 GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed;
END $$;
REVOKE ALL ON FUNCTION private.dabra_successful_task_development_enabled() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_dabra_successful_task_policy(uuid),public.reserve_dabra_successful_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid),public.finish_dabra_successful_task(uuid,uuid,text,uuid,text,text,text),public.read_dabra_successful_task(uuid,uuid,text),public.get_dabra_successful_task_allowance(uuid),public.purge_dabra_successful_task_answers(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_dabra_successful_task_policy(uuid),public.reserve_dabra_successful_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid),public.finish_dabra_successful_task(uuid,uuid,text,uuid,text,text,text),public.read_dabra_successful_task(uuid,uuid,text),public.get_dabra_successful_task_allowance(uuid),public.purge_dabra_successful_task_answers(uuid) TO service_role;
COMMIT;
