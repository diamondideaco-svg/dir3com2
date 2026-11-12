-- Local preparation only: production_apply_authorized=false.
-- Empty administrative approval records, no seed, enabled policy or runtime defaults.
-- No write API or browser table/RPC grants; no change to synthetic lifecycle guards.
BEGIN;
CREATE TABLE private.dabra_successful_task_decisions (
 reference text PRIMARY KEY CHECK(reference ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 revision text NOT NULL CHECK(revision ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 kind text NOT NULL CHECK(kind IN('retention','consent','deletion','audience','spending')),
 purpose text NOT NULL CHECK(purpose='dabra-successful-task'),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 actor_role text NOT NULL CHECK(actor_role IN('customer','partner','staff','admin')),
 approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 approval_reference text NOT NULL CHECK(approval_reference ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 approved_at_ms bigint NOT NULL CHECK(approved_at_ms BETWEEN 0 AND 9007199254740991),
 expires_at_ms bigint NOT NULL CHECK(expires_at_ms BETWEEN 0 AND 9007199254740991 AND expires_at_ms>approved_at_ms),
 revoked_at_ms bigint CHECK(revoked_at_ms BETWEEN 0 AND 9007199254740991),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND document<>'{}'::jsonb AND octet_length(document::text)<=16384),
 funding_grant_id uuid REFERENCES private.dabra_dialogue_funding_grants(id) ON DELETE RESTRICT,
 funding_proof_sha256 text,
 CHECK((kind='spending' AND funding_grant_id IS NOT NULL AND funding_proof_sha256 IS NOT NULL AND funding_proof_sha256 ~ '^[a-f0-9]{64}$')
   OR (kind<>'spending' AND funding_grant_id IS NULL AND funding_proof_sha256 IS NULL)),
 -- Existing Core CEO owns administrative policy decisions; consent belongs to the actor.
 -- Records need a separate approved evidence/capture workflow before any insertion.
 CHECK((kind='consent' AND approved_by=actor_id)
   OR (kind<>'consent' AND approved_by='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid))
);
ALTER TABLE private.dabra_successful_task_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_successful_task_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_successful_task_decisions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.resolve_dabra_successful_task_decisions(p_actor_id uuid,p_actor_role text,p_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.dabra_successful_task_decisions%ROWTYPE; g private.dabra_dialogue_funding_grants%ROWTYPE;
 k text; refs text[]; result jsonb:='{}'::jsonb; v_now bigint; actual_role text; locked_count bigint; expected_identities integer;
BEGIN
 IF p_actor_id IS NULL OR p_actor_role IS NULL OR p_actor_role NOT IN('customer','partner','staff','admin')
  OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_policy))<>7
  OR p_policy-ARRAY['schema','revision','retentionDecision','consentDecision','deletionDecision','audienceDecision','spendingDecision']::text[]<>'{}'::jsonb
  OR p_policy->>'schema' IS DISTINCT FROM 'dabra-successful-task-production-policy-v1'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['revision','retentionDecision','consentDecision','deletionDecision','audienceDecision','spendingDecision']) key
    WHERE jsonb_typeof(p_policy->key) IS DISTINCT FROM 'string' OR p_policy->>key !~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$') THEN RETURN NULL; END IF;
 refs:=ARRAY[p_policy->>'retentionDecision',p_policy->>'consentDecision',p_policy->>'deletionDecision',p_policy->>'audienceDecision',p_policy->>'spendingDecision'];
 IF (SELECT count(DISTINCT ref) FROM unnest(refs) ref)<>5 THEN RETURN NULL; END IF;
 -- Row NOWAIT does not cover relation locks. Acquire every relation read below,
 -- including auth.users/profiles read by dabra_public_actor_active, before rows.
 LOCK TABLE auth.users,public.profiles,private.dabra_successful_task_decisions,
  private.dabra_dialogue_funding_grants IN ROW SHARE MODE NOWAIT;
 expected_identities:=CASE WHEN p_actor_id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid THEN 1 ELSE 2 END;
 -- Each later identity read must refer to an existing row locked here. Missing
 -- rows cannot become eligible through a later VOLATILE statement snapshot.
 PERFORM 1 FROM auth.users WHERE id IN(p_actor_id,'0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid) FOR SHARE NOWAIT;
 GET DIAGNOSTICS locked_count = ROW_COUNT;
 IF locked_count<>expected_identities THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.profiles WHERE id IN(p_actor_id,'0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid) FOR SHARE NOWAIT;
 GET DIAGNOSTICS locked_count = ROW_COUNT;
 IF locked_count<>expected_identities THEN RETURN NULL; END IF;
 IF NOT private.dabra_public_actor_active(p_actor_id)
  OR NOT private.dabra_public_actor_active('0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid AND role='admin') THEN RETURN NULL; END IF;
 SELECT CASE role WHEN 'client' THEN 'customer' WHEN 'super_admin' THEN 'admin' ELSE role END INTO actual_role
 FROM public.profiles WHERE id=p_actor_id;
 IF actual_role IS DISTINCT FROM p_actor_role THEN RETURN NULL; END IF;
 PERFORM 1 FROM private.dabra_successful_task_decisions WHERE reference=ANY(refs) ORDER BY reference FOR SHARE NOWAIT;
 -- PK uniqueness + five distinct references + exact locked count establish
 -- that every subsequent lookup is already protected against concurrent changes/removal.
 GET DIAGNOSTICS locked_count = ROW_COUNT;
 IF locked_count<>5 THEN RETURN NULL; END IF;
 FOR k IN SELECT unnest(ARRAY['retention','consent','deletion','audience','spending']) LOOP
  SELECT * INTO d FROM private.dabra_successful_task_decisions WHERE reference=p_policy->>(k||'Decision');
  IF NOT FOUND OR d.kind<>k OR d.revision<>p_policy->>'revision' OR d.purpose<>'dabra-successful-task'
    OR d.actor_id<>p_actor_id OR d.actor_role<>p_actor_role OR d.revoked_at_ms IS NOT NULL THEN RETURN NULL; END IF;
  IF k='spending' THEN
   SELECT * INTO g FROM private.dabra_dialogue_funding_grants WHERE id=d.funding_grant_id FOR SHARE NOWAIT;
   IF NOT FOUND OR NOT g.enabled OR g.authorized_at>clock_timestamp()
    OR encode(sha256(convert_to(g.proof::text,'UTF8')),'hex') IS DISTINCT FROM d.funding_proof_sha256 THEN RETURN NULL; END IF;
  END IF;
  result:=result||jsonb_build_object(k,jsonb_build_object('reference',d.reference,'approvedBy',d.approved_by,
    'approvalReference',d.approval_reference,'approvedAtMs',d.approved_at_ms,'expiresAtMs',d.expires_at_ms,
    'revokedAtMs',d.revoked_at_ms,'document',d.document,'fundingGrantId',d.funding_grant_id,'fundingProofSha256',d.funding_proof_sha256));
 END LOOP;
 -- Time sampled after all waits/locks; a response is a snapshot, not a reusable permit.
 v_now:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions WHERE reference=ANY(refs)
  AND (approved_at_ms>v_now OR expires_at_ms<=v_now)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('schema','dabra-successful-task-core-decisions-v1','purpose','dabra-successful-task',
  'actorId',p_actor_id,'role',p_actor_role,'revision',p_policy->>'revision','decisions',result);
EXCEPTION WHEN data_exception OR lock_not_available THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.resolve_dabra_successful_task_decisions(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dabra_successful_task_decisions(uuid,text,jsonb) TO service_role;
COMMIT;
