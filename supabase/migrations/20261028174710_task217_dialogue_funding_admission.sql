-- Task217: LOCAL REVIEW ARTIFACT ONLY. Not applied to any database.
-- No account, credit grant, subject allowlist, profile, key or live enabling data is seeded.
-- Same DIR3COM Core database. Stay and financial-wallet tables are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.dabra_dialogue_funding_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  subject_hashes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(subject_hashes)<=20 AND subject_hashes::text ~ '^[{]([a-f0-9]{64}(,[a-f0-9]{64})*)?[}]$'),
  profiles jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(profiles)='array'),
  max_attempt_cost_micros bigint NOT NULL DEFAULT 0 CHECK (max_attempt_cost_micros BETWEEN 0 AND 9007199254740991),
  daily_limits jsonb NOT NULL DEFAULT '{"uniqueUsers":10,"requestsPerUser":6,"requestsTotal":60,"inputTokensPerUser":24576,"outputTokensPerUser":6144,"inputTokensTotal":245760,"outputTokensTotal":61440}'::jsonb
);
INSERT INTO private.dabra_dialogue_funding_control(singleton) VALUES(true);

CREATE TABLE private.dabra_dialogue_funding_grants (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','gemini','xai','deepseek','qwen','mistral')),
  account_id text NOT NULL CHECK (account_id ~ '^[a-zA-Z0-9:_-]{1,100}$'),
  project_id text NOT NULL CHECK (project_id ~ '^[a-zA-Z0-9:_-]{1,100}$'),
  funding_mode text NOT NULL CHECK (funding_mode IN ('existing-credit','no-new-charge')),
  authorized_credit_micros bigint NOT NULL CHECK (authorized_credit_micros BETWEEN 0 AND 9007199254740991),
  reserved_credit_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_credit_micros BETWEEN 0 AND authorized_credit_micros),
  input_rate_micros_per_million bigint CHECK (input_rate_micros_per_million BETWEEN 0 AND 9007199254740991),
  output_rate_micros_per_million bigint CHECK (output_rate_micros_per_million BETWEEN 0 AND 9007199254740991),
  pricing_expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  proof jsonb NOT NULL CHECK (jsonb_typeof(proof)='object'),
  authorized_at timestamptz NOT NULL,
  UNIQUE(provider,account_id),
  CHECK ((funding_mode='existing-credit' AND provider IN ('openai','anthropic') AND authorized_credit_micros>0)
    OR (funding_mode='no-new-charge' AND provider NOT IN ('openai','anthropic') AND authorized_credit_micros=0))
);

CREATE TABLE private.dabra_dialogue_admissions (
  attempt_id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('intent.classify','discover')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  grant_id uuid NOT NULL REFERENCES private.dabra_dialogue_funding_grants(id) ON DELETE RESTRICT,
  day_start_ms bigint NOT NULL,
  quota_start_ms bigint NOT NULL,
  quota_end_ms bigint NOT NULL CHECK (quota_end_ms>quota_start_ms),
  input_tokens integer NOT NULL CHECK (input_tokens BETWEEN 1 AND 4096),
  output_tokens integer NOT NULL CHECK (output_tokens BETWEEN 1 AND 1024),
  cost_micros bigint NOT NULL CHECK (cost_micros BETWEEN 0 AND 9007199254740991),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX dabra_dialogue_admissions_day_subject ON private.dabra_dialogue_admissions(day_start_ms,subject_hash);
CREATE INDEX dabra_dialogue_admissions_grant_quota ON private.dabra_dialogue_admissions(grant_id,quota_start_ms,quota_end_ms);

ALTER TABLE private.dabra_dialogue_funding_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_dialogue_funding_control FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_dialogue_funding_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_dialogue_funding_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_dialogue_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_dialogue_admissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_dialogue_funding_control,private.dabra_dialogue_funding_grants,private.dabra_dialogue_admissions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.protect_dabra_dialogue_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.funding_mode IS DISTINCT FROM OLD.funding_mode
    OR NEW.authorized_credit_micros IS DISTINCT FROM OLD.authorized_credit_micros
    OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
    OR NEW.reserved_credit_micros<OLD.reserved_credit_micros THEN
    RAISE EXCEPTION 'DIALOGUE_GRANT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_dabra_dialogue_grant() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_dabra_dialogue_grant BEFORE UPDATE ON private.dabra_dialogue_funding_grants
FOR EACH ROW EXECUTE FUNCTION private.protect_dabra_dialogue_grant();

CREATE FUNCTION public.get_dabra_dialogue_funding_policy(p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.dabra_dialogue_funding_control%ROWTYPE; proofs jsonb;
BEGIN
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
  IF NOT FOUND OR NOT c.enabled OR (p_subject_hash=ANY(c.subject_hashes)) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(g.proof),'[]'::jsonb) INTO proofs FROM private.dabra_dialogue_funding_grants g WHERE g.enabled;
  RETURN jsonb_build_object('enabled',true,'profiles',c.profiles,'proofs',proofs,'maxCostMicros',c.max_attempt_cost_micros,'dailyLimits',c.daily_limits);
END $$;

CREATE FUNCTION public.reserve_dabra_dialogue_attempt(
 p_attempt_id uuid,p_request_id uuid,p_stage text,p_subject_hash text,p_grant_id uuid,p_proof jsonb,
 p_input_tokens integer,p_output_tokens integer,p_cost_micros bigint,p_limits jsonb,p_day_start_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 c private.dabra_dialogue_funding_control%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 v_now timestamptz; v_now_ms bigint; v_day bigint; q_start bigint; q_end bigint; v_quote bigint;
 total_calls bigint; user_calls bigint; users bigint; total_input bigint; total_output bigint; user_input bigint; user_output bigint;
 quota_calls bigint; quota_input bigint; quota_output bigint;
BEGIN
 IF p_attempt_id IS NULL OR p_request_id IS NULL OR p_grant_id IS NULL
  OR p_stage IS NULL OR p_stage NOT IN ('discover','intent.classify')
  OR p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$'
  OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 1 AND 4096
  OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 1 AND 1024
  OR p_cost_micros IS NULL OR p_cost_micros NOT BETWEEN 0 AND 9007199254740991 THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(p_limits) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['uniqueUsers','requestsPerUser','requestsTotal','inputTokensPerUser','outputTokensPerUser','inputTokensTotal','outputTokensTotal']) k WHERE coalesce(p_limits->>k,'') !~ '^[1-9][0-9]{0,8}$')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['verifiedAtMs','expiresAtMs','quotaWindowStartMs','quotaWindowEndMs','remainingRequests','remainingInputTokens','remainingOutputTokens']) k WHERE coalesce(p_proof->>k,'') !~ '^[0-9]{1,16}$')
  OR coalesce(p_proof->>'evidenceSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(p_proof->>'credentialSha256','') !~ '^[a-f0-9]{64}$' THEN
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
 IF NOT FOUND OR NOT g.enabled OR g.authorized_at>v_now OR p_proof IS DISTINCT FROM g.proof
  OR p_proof->>'grantId' IS DISTINCT FROM g.id::text
  OR p_proof->>'provider' IS DISTINCT FROM g.provider OR p_proof->>'accountId' IS DISTINCT FROM g.account_id
  OR p_proof->>'projectId' IS DISTINCT FROM g.project_id OR p_proof->>'mode' IS DISTINCT FROM g.funding_mode
  OR p_proof->>'environment' IS DISTINCT FROM 'provider-benchmark'
  OR p_proof->>'autoReload' IS DISTINCT FROM 'off' OR p_proof->>'postpaid' IS DISTINCT FROM 'blocked'
  OR p_proof->>'overdraft' IS DISTINCT FROM 'blocked' OR p_proof->>'concurrentAccountUsage' IS DISTINCT FROM 'bounded'
  OR (p_proof->>'evidenceSha256') !~ '^[a-f0-9]{64}$' OR (p_proof->>'credentialSha256') !~ '^[a-f0-9]{64}$'
  OR (p_proof->>'verifiedAtMs')::bigint>v_now_ms OR (p_proof->>'expiresAtMs')::bigint<=v_now_ms
  OR (p_proof->>'expiresAtMs')::bigint-(p_proof->>'verifiedAtMs')::bigint NOT BETWEEN 1 AND 3600000
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.profiles) profile WHERE profile->>'provider'=g.provider
    AND profile->'measurement'->>'model'=p_proof->>'model' AND profile->'measurement'->>'capability'=p_stage) THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 q_start:=(p_proof->>'quotaWindowStartMs')::bigint; q_end:=(p_proof->>'quotaWindowEndMs')::bigint;
 IF q_start>v_now_ms OR q_end<=v_now_ms THEN RETURN jsonb_build_object('decision','denied'); END IF;
 IF g.funding_mode='existing-credit' THEN
  IF coalesce(p_proof->>'authorizedCreditMicros','') !~ '^[0-9]{1,16}$' OR coalesce(p_proof->>'remainingCreditMicros','') !~ '^[0-9]{1,16}$'
   OR p_proof->>'currency' IS DISTINCT FROM 'USD' OR p_proof->>'serviceTier' IS DISTINCT FROM 'standard'
   OR p_proof->>'pricing' IS DISTINCT FROM 'standard-2026-10-28'
   OR (p_proof->>'authorizedCreditMicros')::bigint IS DISTINCT FROM g.authorized_credit_micros
   OR g.input_rate_micros_per_million IS NULL OR g.output_rate_micros_per_million IS NULL
   OR g.pricing_expires_at IS NULL OR g.pricing_expires_at<=v_now THEN RETURN jsonb_build_object('decision','denied'); END IF;
  v_quote:=ceil((p_input_tokens::numeric*g.input_rate_micros_per_million+p_output_tokens::numeric*g.output_rate_micros_per_million)/1000000)::bigint;
  IF p_cost_micros<>v_quote OR v_quote<=0 OR g.reserved_credit_micros+v_quote>g.authorized_credit_micros
   OR g.reserved_credit_micros+v_quote>(p_proof->>'remainingCreditMicros')::bigint THEN RETURN jsonb_build_object('decision','denied'); END IF;
 ELSE
  IF p_proof->>'enforcement' IS DISTINCT FROM 'provider-hard-no-new-charge' OR p_cost_micros<>0 THEN RETURN jsonb_build_object('decision','denied'); END IF;
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
 IF quota_calls+1>(p_proof->>'remainingRequests')::bigint OR quota_input+p_input_tokens>(p_proof->>'remainingInputTokens')::bigint
  OR quota_output+p_output_tokens>(p_proof->>'remainingOutputTokens')::bigint THEN RETURN jsonb_build_object('decision','denied'); END IF;
 UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+p_cost_micros WHERE id=g.id;
 INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros)
 VALUES(p_attempt_id,p_request_id,p_stage,p_subject_hash,g.id,v_day,q_start,q_end,p_input_tokens,p_output_tokens,p_cost_micros);
 -- Holds never expire/refund/reset automatically, including cancellations, failed/unknown provider results and new application days.
 RETURN jsonb_build_object('decision','admitted','attempt_id',p_attempt_id);
END $$;
REVOKE ALL ON FUNCTION public.get_dabra_dialogue_funding_policy(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_dabra_dialogue_funding_policy(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint) TO service_role;
COMMIT;
