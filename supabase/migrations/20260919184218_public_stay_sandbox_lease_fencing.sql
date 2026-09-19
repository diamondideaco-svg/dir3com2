-- Task #155 forward-only correction. Deploy while the operational switch is OFF.
-- Old unfenced RPCs are removed deliberately: old application instances fail closed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE private.stay_sandbox_query_leases
  ADD COLUMN IF NOT EXISTS lease_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION public.acquire_public_stay_sandbox_slot(p_subject_hash text,p_query_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_now timestamptz; v_window timestamptz; v_day date;
 v_control private.stay_sandbox_runtime_control%ROWTYPE;
 v_count integer; v_payload jsonb; v_usage integer; v_lease timestamptz; v_token uuid;
BEGIN
 IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' OR p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'INVALID_STAY_SANDBOX_GATE_INPUT' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_control FROM private.stay_sandbox_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND OR NOT v_control.enabled THEN RETURN jsonb_build_object('decision','disabled'); END IF;
 -- Lock independently of the window; refresh time AFTER contention, including hour rollover.
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-subject:'||p_subject_hash,0));
 v_now:=clock_timestamp();
 v_window:=date_trunc('hour',v_now,'UTC');
 INSERT INTO private.stay_sandbox_request_windows AS request_window(subject_hash,window_start,request_count) VALUES(p_subject_hash,v_window,1)
 ON CONFLICT(subject_hash,window_start) DO UPDATE SET request_count=least(request_window.request_count,v_control.requests_per_subject_hour)+1
 RETURNING request_count INTO v_count;
 IF v_count>v_control.requests_per_subject_hour THEN
  RETURN jsonb_build_object('decision','rate_limited','retry_after_seconds',greatest(1,ceil(extract(epoch FROM v_window+interval '1 hour'-clock_timestamp()))::integer));
 END IF;
 -- The same query lock guards acquire, completion and release. Waiters recheck cache.
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-query:'||p_query_hash,0));
 v_now:=clock_timestamp();
 SELECT payload INTO v_payload FROM private.stay_sandbox_public_cache WHERE query_hash=p_query_hash AND expires_at>v_now;
 IF FOUND THEN RETURN jsonb_build_object('decision','cache','payload',v_payload); END IF;
 SELECT lease_until INTO v_lease FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash;
 IF FOUND AND v_lease>v_now THEN
  RETURN jsonb_build_object('decision','busy','retry_after_seconds',greatest(1,ceil(extract(epoch FROM v_lease-v_now))::integer));
 END IF;
 v_day:=(v_now AT TIME ZONE 'UTC')::date;
 INSERT INTO private.stay_sandbox_provider_daily_usage AS daily_usage(usage_day,provider_calls) VALUES(v_day,1)
 ON CONFLICT(usage_day) DO UPDATE SET provider_calls=daily_usage.provider_calls+1
 WHERE daily_usage.provider_calls<v_control.provider_calls_per_day
 RETURNING provider_calls INTO v_usage;
 IF v_usage IS NULL THEN
  RETURN jsonb_build_object('decision','daily_limit','retry_after_seconds',greatest(1,ceil(extract(epoch FROM ((v_day+1)::timestamp AT TIME ZONE 'UTC')-clock_timestamp()))::integer));
 END IF;
 v_token:=gen_random_uuid();
 INSERT INTO private.stay_sandbox_query_leases(query_hash,lease_until,lease_token)
 VALUES(p_query_hash,clock_timestamp()+interval '20 seconds',v_token)
 ON CONFLICT(query_hash) DO UPDATE SET lease_until=excluded.lease_until,lease_token=excluded.lease_token;
 DELETE FROM private.stay_sandbox_request_windows WHERE window_start<v_window-interval '2 hours';
 DELETE FROM private.stay_sandbox_provider_daily_usage WHERE usage_day<v_day-30;
 DELETE FROM private.stay_sandbox_public_cache WHERE expires_at<v_now-interval '1 hour';
 -- Expiry is reclaimed only by acquire for the locked query, not unrelated cleanup.
 RETURN jsonb_build_object('decision','provider','lease_token',v_token);
END $$;

DROP FUNCTION IF EXISTS public.complete_public_stay_sandbox_slot(text,jsonb);
DROP FUNCTION IF EXISTS public.release_public_stay_sandbox_slot(text);

CREATE OR REPLACE FUNCTION public.complete_public_stay_sandbox_slot(p_query_hash text,p_lease_token uuid,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control private.stay_sandbox_runtime_control%ROWTYPE; v_retrieved timestamptz; v_lease timestamptz;
BEGIN
 IF p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' OR p_lease_token IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR octet_length(p_payload::text)>262144 OR coalesce(p_payload->>'status','') NOT IN ('ok','no_results','unavailable')
  OR jsonb_typeof(p_payload->'cards') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'cards')>20 THEN
  RAISE EXCEPTION 'INVALID_STAY_SANDBOX_CACHE_PAYLOAD' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_control FROM private.stay_sandbox_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-query:'||p_query_hash,0));
 SELECT lease_until INTO v_lease FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash AND lease_token=p_lease_token;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT v_control.enabled OR v_lease<=clock_timestamp() THEN
  DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash AND lease_token=p_lease_token;
  RETURN false;
 END IF;
 v_retrieved:=(p_payload->>'retrievedAt')::timestamptz;
 INSERT INTO private.stay_sandbox_public_cache(query_hash,payload,retrieved_at,expires_at)
 VALUES(p_query_hash,p_payload,v_retrieved,clock_timestamp()+make_interval(secs=>v_control.cache_ttl_seconds))
 ON CONFLICT(query_hash) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at,expires_at=excluded.expires_at;
 DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash AND lease_token=p_lease_token;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.release_public_stay_sandbox_slot(p_query_hash text,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
 IF p_query_hash IS NULL OR p_query_hash !~ '^[a-f0-9]{64}$' OR p_lease_token IS NULL THEN
  RAISE EXCEPTION 'INVALID_STAY_SANDBOX_LEASE' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stay-query:'||p_query_hash,0));
 DELETE FROM private.stay_sandbox_query_leases WHERE query_hash=p_query_hash AND lease_token=p_lease_token;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $$;

REVOKE ALL ON FUNCTION public.acquire_public_stay_sandbox_slot(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.complete_public_stay_sandbox_slot(text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.release_public_stay_sandbox_slot(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.acquire_public_stay_sandbox_slot(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_public_stay_sandbox_slot(text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_public_stay_sandbox_slot(text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
