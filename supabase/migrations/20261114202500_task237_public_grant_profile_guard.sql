-- Task237: preserve the narrower profile authorization of a durable grant.
-- This forward migration creates no grant, consent, authority, decision or flag.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- The existing acceptance validator recomputes the full profile digest and binds
-- it to the reviewed output contract. Membership and the measurement date must
-- also satisfy the original bounded-account-charge grant.
CREATE FUNCTION private.dabra_public_grant_accepts_profile(p_proof jsonb,p_profile jsonb,p_acceptance jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb:=p_proof->'limitedOperation';m jsonb:=p_profile->'measurement';
BEGIN
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR jsonb_typeof(p_profile) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_acceptance) IS DISTINCT FROM 'object' OR jsonb_typeof(a) IS DISTINCT FROM 'object'
  OR jsonb_typeof(m) IS DISTINCT FROM 'object' OR p_proof->>'mode' IS DISTINCT FROM 'bounded-account-charge'
  OR p_profile->>'provider' IS DISTINCT FROM p_proof->>'provider' OR m->>'model' IS DISTINCT FROM p_proof->>'model'
  OR m->>'environment' IS DISTINCT FROM p_proof->>'environment'
  OR jsonb_typeof(a->'acceptedProfileSha256s') IS DISTINCT FROM 'array'
  OR jsonb_typeof(a->'authorizedAtMs') IS DISTINCT FROM 'number' OR coalesce(a->>'authorizedAtMs','')!~'^[0-9]{1,16}$'
  OR jsonb_typeof(m->'measuredAtMs') IS DISTINCT FROM 'number' OR coalesce(m->>'measuredAtMs','')!~'^[0-9]{1,16}$'
  OR coalesce(p_acceptance->>'profileSha256','')!~'^[a-f0-9]{64}$' THEN RETURN false; END IF;
 RETURN ((m->>'measuredAtMs')::numeric<=(a->>'authorizedAtMs')::numeric
  AND coalesce((a->'acceptedProfileSha256s') ? (p_acceptance->>'profileSha256'),false)
  AND private.valid_dabra_output_acceptances(jsonb_build_array(p_acceptance),jsonb_build_array(p_profile))) IS TRUE;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.dabra_public_grant_accepts_profile(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Existing rows are not changed. New or re-enabled authorities must meet the
-- grant's original scope; disabling an authority must always remain possible.
CREATE FUNCTION private.guard_dabra_public_grant_profile_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT NEW.enabled THEN RETURN NEW; END IF;
 IF private.dabra_public_grant_accepts_profile(NEW.source_proof,NEW.profile,NEW.output_acceptance) IS NOT TRUE THEN
  RAISE EXCEPTION 'DABRA_PUBLIC_GRANT_PROFILE_REQUIRED';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_dabra_public_grant_profile_authority() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_dabra_public_grant_profile_authority BEFORE INSERT OR UPDATE ON private.dabra_public_dialogue_authorities
 FOR EACH ROW EXECUTE FUNCTION private.guard_dabra_public_grant_profile_authority();

-- Both existing reservation RPCs take their own locks and validate the active
-- authority/grant before this exact point. Guard the already-locked rows on each
-- request, including authorities created before this migration. Preserve the
-- existing function signatures, owners, ACLs, budgets and exception behavior.
DO $guard$
DECLARE target text;body text;
 anchor text:='v_subject:=encode(sha256(convert_to(''task217-dialogue:''||p_actor_id::text,''UTF8'')),''hex'');';
 insertion text:=$insert$IF private.dabra_public_grant_accepts_profile(g.proof,a.profile,a.output_acceptance) IS NOT TRUE THEN
  RETURN jsonb_build_object('decision','denied'); END IF;
 $insert$;
BEGIN
 FOREACH target IN ARRAY ARRAY[
  'public.reserve_dabra_public_dialogue_attempt(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint)',
  'public.reserve_dabra_production_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid,text,jsonb,jsonb,bigint,jsonb,jsonb)'
 ] LOOP
  SELECT pg_get_functiondef(target::regprocedure) INTO body;
  IF body IS NULL OR (length(body)-length(replace(body,anchor,'')))<>length(anchor) THEN
   RAISE EXCEPTION 'DABRA_PUBLIC_PROFILE_GUARD_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(body,anchor,insertion||anchor);
 END LOOP;
END $guard$;
COMMIT;
