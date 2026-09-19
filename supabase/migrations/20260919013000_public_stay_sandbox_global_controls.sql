-- Public LiteAPI Sandbox Demo: distributed cache, anonymous rate limit,
-- account-wide provider budget and an immediate operational kill switch.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS private.stay_sandbox_runtime_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  requests_per_subject_hour integer NOT NULL DEFAULT 30 CHECK (requests_per_subject_hour BETWEEN 1 AND 1000),
  provider_calls_per_day integer NOT NULL DEFAULT 200 CHECK (provider_calls_per_day BETWEEN 1 AND 10000),
  cache_ttl_seconds integer NOT NULL DEFAULT 60 CHECK (cache_ttl_seconds BETWEEN 30 AND 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.stay_sandbox_runtime_control(singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.stay_sandbox_request_windows (
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY(subject_hash,window_start)
);
CREATE TABLE IF NOT EXISTS private.stay_sandbox_provider_daily_usage (
  usage_day date PRIMARY KEY,
  provider_calls integer NOT NULL CHECK (provider_calls >= 0)
);
CREATE TABLE IF NOT EXISTS private.stay_sandbox_public_cache (
  query_hash text PRIMARY KEY CHECK (query_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text) <= 262144),
  retrieved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > retrieved_at)
);
CREATE TABLE IF NOT EXISTS private.stay_sandbox_query_leases (
  query_hash text PRIMARY KEY CHECK (query_hash ~ '^[a-f0-9]{64}$'),
  lease_until timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS stay_sandbox_request_windows_cleanup_idx ON private.stay_sandbox_request_windows(window_start);
CREATE INDEX IF NOT EXISTS stay_sandbox_public_cache_cleanup_idx ON private.stay_sandbox_public_cache(expires_at);
CREATE INDEX IF NOT EXISTS stay_sandbox_query_leases_cleanup_idx ON private.stay_sandbox_query_leases(lease_until);

REVOKE ALL ON private.stay_sandbox_runtime_control,private.stay_sandbox_request_windows,
  private.stay_sandbox_provider_daily_usage,private.stay_sandbox_public_cache,private.stay_sandbox_query_leases
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.acquire_public_stay_sandbox_slot(p_subject_hash text,p_query_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamptz:=clock_timestamp(); v_window timestamptz:=date_trunc('hour',v_now);
 v_control private.stay_sandbox_runtime_control%ROWTYPE; v_count integer; v_payload jsonb; v_usage integer; v_lease timestamptz;
BEGIN
 IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' OR p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'INVALID_STAY_SANDBOX_GATE_INPUT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_control FROM private.stay_sandbox_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND OR NOT v_control.enabled THEN RETURN jsonb_build_object('decision','disabled'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-subject:'||p_subject_hash||':'||v_window::text,0));
 INSERT INTO private.stay_sandbox_request_windows AS request_window(subject_hash,window_start,request_count) VALUES(p_subject_hash,v_window,1)
 ON CONFLICT(subject_hash,window_start) DO UPDATE SET request_count=request_window.request_count+1
 RETURNING request_count INTO v_count;
 IF v_count>v_control.requests_per_subject_hour THEN RETURN jsonb_build_object('decision','rate_limited'); END IF;
 SELECT payload INTO v_payload FROM private.stay_sandbox_public_cache WHERE query_hash=p_query_hash AND expires_at>v_now;
 IF FOUND THEN RETURN jsonb_build_object('decision','cache','payload',v_payload); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-query:'||p_query_hash,0));
 SELECT lease_until INTO v_lease FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash;
 IF FOUND AND v_lease>v_now THEN RETURN jsonb_build_object('decision','busy'); END IF;
 INSERT INTO private.stay_sandbox_provider_daily_usage AS daily_usage(usage_day,provider_calls) VALUES((v_now AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT(usage_day) DO UPDATE SET provider_calls=daily_usage.provider_calls+1
 WHERE daily_usage.provider_calls<v_control.provider_calls_per_day
 RETURNING provider_calls INTO v_usage;
 IF v_usage IS NULL THEN RETURN jsonb_build_object('decision','daily_limit'); END IF;
 INSERT INTO private.stay_sandbox_query_leases(query_hash,lease_until) VALUES(p_query_hash,v_now+interval '20 seconds')
 ON CONFLICT(query_hash) DO UPDATE SET lease_until=excluded.lease_until;
 DELETE FROM private.stay_sandbox_request_windows WHERE window_start<v_window-interval '2 hours';
 DELETE FROM private.stay_sandbox_provider_daily_usage WHERE usage_day<(v_now AT TIME ZONE 'UTC')::date-30;
 DELETE FROM private.stay_sandbox_public_cache WHERE expires_at<v_now-interval '1 hour';
 DELETE FROM private.stay_sandbox_query_leases WHERE lease_until<v_now AND query_hash<>p_query_hash;
 RETURN jsonb_build_object('decision','provider');
END $$;

CREATE OR REPLACE FUNCTION public.complete_public_stay_sandbox_slot(p_query_hash text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control private.stay_sandbox_runtime_control%ROWTYPE; v_retrieved timestamptz;
BEGIN
 IF p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR octet_length(p_payload::text)>262144 OR coalesce(p_payload->>'status','') NOT IN ('ok','no_results','unavailable')
  OR jsonb_typeof(p_payload->'cards')<>'array' OR jsonb_array_length(p_payload->'cards')>20 THEN
  RAISE EXCEPTION 'INVALID_STAY_SANDBOX_CACHE_PAYLOAD' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_control FROM private.stay_sandbox_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND OR NOT v_control.enabled THEN DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash; RETURN; END IF;
 v_retrieved:=(p_payload->>'retrievedAt')::timestamptz;
 INSERT INTO private.stay_sandbox_public_cache(query_hash,payload,retrieved_at,expires_at)
 VALUES(p_query_hash,p_payload,v_retrieved,clock_timestamp()+make_interval(secs=>v_control.cache_ttl_seconds))
 ON CONFLICT(query_hash) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at,expires_at=excluded.expires_at;
 DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash;
END $$;

CREATE OR REPLACE FUNCTION public.release_public_stay_sandbox_slot(p_query_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_STAY_SANDBOX_QUERY_HASH' USING ERRCODE='22023'; END IF;
 DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash;
END $$;

REVOKE ALL ON FUNCTION public.acquire_public_stay_sandbox_slot(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_public_stay_sandbox_slot(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.release_public_stay_sandbox_slot(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.acquire_public_stay_sandbox_slot(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_public_stay_sandbox_slot(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_public_stay_sandbox_slot(text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
