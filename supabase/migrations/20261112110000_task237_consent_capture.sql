-- Local disabled preparation. No notice, consent, policy or grant is seeded.
BEGIN;
CREATE TABLE private.dabra_task_notices (
 revision text PRIMARY KEY CHECK(revision ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 notice_version text NOT NULL CHECK(notice_version<>'task187-v1' AND notice_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 notice_text text NOT NULL CHECK(octet_length(notice_text) BETWEEN 1 AND 16384),
 notice_sha256 text NOT NULL CHECK(notice_sha256 ~ '^[a-f0-9]{64}$'),
 approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 approval_reference text NOT NULL CHECK(approval_reference ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
 approved_at_ms bigint NOT NULL, expires_at_ms bigint NOT NULL,
 consent_expires_at_ms bigint NOT NULL,
 revoked_at_ms bigint,
 CHECK(approved_by='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid),
 CHECK(approved_at_ms BETWEEN 0 AND 9007199254740991 AND expires_at_ms BETWEEN 1 AND 9007199254740991 AND consent_expires_at_ms BETWEEN 1 AND 9007199254740991),
 CHECK(expires_at_ms>approved_at_ms AND consent_expires_at_ms>approved_at_ms),
 CHECK(notice_sha256=encode(sha256(convert_to(notice_text,'UTF8')),'hex'))
);
ALTER TABLE private.dabra_task_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_task_notices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_task_notices FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.dabra_production_tasks ALTER COLUMN input_digest DROP NOT NULL;
ALTER TABLE private.dabra_production_tasks ALTER COLUMN policy DROP NOT NULL;
ALTER TABLE private.dabra_production_tasks ALTER COLUMN decision_bundle DROP NOT NULL;

-- One criterion shared by selection, display, renewal and grant receipt replay.
CREATE FUNCTION private.dabra_task_consent_effective(d private.dabra_successful_task_decisions,p_actor uuid,p_role text,p_revision text,p_now bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(d.actor_id=p_actor AND d.actor_role=p_role AND d.revision=p_revision
  AND d.purpose='dabra-successful-task' AND d.kind='consent' AND d.approved_by=p_actor
  AND d.revoked_at_ms IS NULL AND d.approved_at_ms>0 AND d.approved_at_ms<=p_now AND d.expires_at_ms>p_now
  AND private.dabra_qualification_exact_keys(d.document,ARRAY['schema','actorId','revision','noticeVersion','noticeSha256','grantedAtMs','generation'])
  AND d.document->>'schema'='dabra-answer-consent-v1' AND d.document->>'actorId'=p_actor::text
  AND d.document->'revision'=to_jsonb(p_revision) AND d.document->'grantedAtMs'=to_jsonb(d.approved_at_ms)
  AND jsonb_typeof(d.document->'noticeVersion')='string' AND d.document->>'noticeVersion'<>'task187-v1'
  AND d.document->>'noticeVersion' ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'
  AND jsonb_typeof(d.document->'noticeSha256')='string' AND d.document->>'noticeSha256' ~ '^[a-f0-9]{64}$'
  AND CASE WHEN jsonb_typeof(d.document->'generation')='number' AND d.document->>'generation' ~ '^[0-9]{1,16}$'
   THEN (d.document->>'generation')::numeric BETWEEN 0 AND 9007199254740991 ELSE false END,false)
$$;
REVOKE ALL ON FUNCTION private.dabra_task_consent_effective(private.dabra_successful_task_decisions,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated,service_role;

-- A single locked selector, including the pre-consent stage. SHARE prevents
-- phantom approvals while selecting by actor/kind rather than a client reference.
CREATE FUNCTION private.dabra_task_select(p_actor uuid,p_role text,p_revision text,p_consent boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; d private.dabra_successful_task_decisions%ROWTYPE; n bigint; count_rows bigint;
 refs jsonb:=jsonb_build_object('schema','dabra-successful-task-production-policy-v1','revision',p_revision); actual_role text;
BEGIN
 IF p_revision IS NULL OR p_revision !~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$' THEN RETURN NULL; END IF;
 LOCK TABLE auth.users,public.profiles IN ROW SHARE MODE NOWAIT;
 LOCK TABLE private.dabra_successful_task_decisions IN SHARE MODE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id IN(p_actor,'0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid) FOR SHARE NOWAIT;
 GET DIAGNOSTICS count_rows=ROW_COUNT;
 IF count_rows<>CASE WHEN p_actor='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid THEN 1 ELSE 2 END THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.profiles WHERE id IN(p_actor,'0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid) FOR SHARE NOWAIT;
 GET DIAGNOSTICS count_rows=ROW_COUNT;
 IF count_rows<>CASE WHEN p_actor='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid THEN 1 ELSE 2 END THEN RETURN NULL; END IF;
 IF NOT private.dabra_public_actor_active(p_actor) OR NOT private.dabra_public_actor_active('0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid AND role='admin') THEN RETURN NULL; END IF;
 SELECT CASE role WHEN 'client' THEN 'customer' WHEN 'super_admin' THEN 'admin' ELSE role END INTO actual_role FROM public.profiles WHERE id=p_actor;
 IF actual_role IS DISTINCT FROM p_role THEN RETURN NULL; END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 FOR k IN SELECT unnest(CASE WHEN p_consent THEN ARRAY['retention','consent','deletion','audience','spending'] ELSE ARRAY['retention','deletion','audience','spending'] END) LOOP
  SELECT count(*) INTO count_rows FROM private.dabra_successful_task_decisions candidate WHERE (k='consent' AND private.dabra_task_consent_effective(candidate,p_actor,p_role,p_revision,n)) OR (k<>'consent' AND candidate.actor_id=p_actor AND candidate.revision=p_revision AND candidate.purpose='dabra-successful-task' AND candidate.kind=k AND candidate.revoked_at_ms IS NULL);
  IF count_rows<>1 THEN RETURN NULL; END IF;
  SELECT candidate.* INTO d FROM private.dabra_successful_task_decisions candidate WHERE (k='consent' AND private.dabra_task_consent_effective(candidate,p_actor,p_role,p_revision,n)) OR (k<>'consent' AND candidate.actor_id=p_actor AND candidate.revision=p_revision AND candidate.purpose='dabra-successful-task' AND candidate.kind=k AND candidate.revoked_at_ms IS NULL) FOR SHARE NOWAIT;
  IF d.actor_role<>p_role OR d.approved_by<>CASE WHEN k='consent' THEN p_actor ELSE '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid END
   OR d.approved_at_ms>n OR d.expires_at_ms<=n THEN RETURN NULL; END IF;
  IF k='audience' AND d.document IS DISTINCT FROM jsonb_build_object('schema','dabra-task-audience-v1','actorId',p_actor,'role',p_role,'revision',p_revision) THEN RETURN NULL; END IF;
  refs:=refs||jsonb_build_object(k||'Decision',d.reference);
 END LOOP;
 RETURN refs;
EXCEPTION WHEN lock_not_available OR data_exception THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.dabra_task_select(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.select_dabra_production_task_policy(p_actor_id uuid,p_actor_role text,p_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb;
BEGIN
 p:=private.dabra_task_select(p_actor_id,p_actor_role,p_revision,true);
 IF p IS NULL OR public.resolve_dabra_successful_task_decisions(p_actor_id,p_actor_role,p) IS NULL THEN RETURN NULL; END IF;
 RETURN p;
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.select_dabra_production_task_policy(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.select_dabra_production_task_policy(uuid,text,text) TO service_role;

-- Metadata only: no notice, answer, trip, approval document or retention default.
CREATE TABLE private.dabra_task_consent_fences (
 actor_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 generation bigint NOT NULL CHECK(generation BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE private.dabra_task_consent_mutations (
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, mutation_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('grant','revoke')), request_generation bigint NOT NULL,
 result_generation bigint NOT NULL, request_sha256 text NOT NULL, PRIMARY KEY(actor_id,mutation_id)
);
ALTER TABLE private.dabra_task_consent_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_task_consent_fences FORCE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_task_consent_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.dabra_task_consent_mutations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.dabra_task_consent_fences,private.dabra_task_consent_mutations FROM PUBLIC,anon,authenticated,service_role;

-- Shared content erasure, independent of consent authority and funding eligibility.
-- Caller must propagate contention: never acknowledge removal after partial work.
CREATE FUNCTION private.dabra_task_remove_content(p_actor uuid,p_requests uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ids uuid[]; removed integer; n bigint;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Task owner required' USING ERRCODE='22023';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN
  RAISE EXCEPTION 'Task content busy' USING ERRCODE='55P03';END IF;
 LOCK TABLE private.dabra_production_tasks,private.dabra_production_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 SELECT array_agg(request_id) INTO ids FROM (
  SELECT request_id FROM private.dabra_production_tasks WHERE actor_id=p_actor AND content_removed_at_ms IS NULL
   AND (p_requests IS NULL OR request_id=ANY(p_requests)) ORDER BY request_id FOR UPDATE NOWAIT
 ) locked;
 IF ids IS NULL THEN RETURN 0;END IF;
 DELETE FROM private.dabra_production_task_answers WHERE actor_id=p_actor AND request_id=ANY(ids);
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 UPDATE private.dabra_production_tasks SET content_removed_at_ms=n,input_digest=NULL,answer_digest=NULL,
  operations_binding=NULL,continuity_binding=NULL,policy=NULL,decision_bundle=NULL WHERE actor_id=p_actor AND request_id=ANY(ids);
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION private.dabra_task_remove_content(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.dabra_task_consent(p_actor_id uuid,p_actor_role text,p_action text,p_revision text DEFAULT NULL,p_notice_version text DEFAULT NULL,p_notice_sha256 text DEFAULT NULL,p_generation bigint DEFAULT NULL,p_mutation uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE notice private.dabra_task_notices%ROWTYPE; refs jsonb; n bigint; gen bigint; receipt private.dabra_task_consent_mutations%ROWTYPE; ref text; fingerprint text;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('status','notice','grant','revoke') THEN RETURN NULL; END IF;
 -- Same nonblocking admission lock serializes removal with reserve/finish/read.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN RETURN NULL; END IF;
 LOCK TABLE private.dabra_production_tasks,private.dabra_production_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 LOCK TABLE auth.users,public.profiles IN ROW SHARE MODE NOWAIT;
 LOCK TABLE private.dabra_successful_task_decisions,private.dabra_task_consent_fences,private.dabra_task_consent_mutations IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id=p_actor_id FOR SHARE NOWAIT;IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_actor_id FOR SHARE NOWAIT;IF NOT FOUND THEN RETURN NULL;END IF;
 IF NOT private.dabra_public_actor_active(p_actor_id) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND CASE role WHEN 'client' THEN 'customer' WHEN 'super_admin' THEN 'admin' ELSE role END=p_actor_role) THEN RETURN NULL; END IF;
 -- Never parse historical approval JSON to authorize owner content removal.
 SELECT generation INTO gen FROM private.dabra_task_consent_fences WHERE actor_id=p_actor_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN gen:=0;END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF p_action='status' THEN RETURN jsonb_build_object('generation',gen,'granted',EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions candidate WHERE private.dabra_task_consent_effective(candidate,p_actor_id,p_actor_role,p_revision,n)),'hasConsent',EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions WHERE actor_id=p_actor_id AND kind='consent' AND revoked_at_ms IS NULL),'hasContent',EXISTS(SELECT 1 FROM private.dabra_production_tasks WHERE actor_id=p_actor_id AND content_removed_at_ms IS NULL));END IF;
 IF p_action IN('grant','revoke') THEN
  IF p_mutation IS NULL OR p_generation IS NULL OR p_generation NOT BETWEEN 0 AND 9007199254740990 THEN RETURN NULL;END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'generation',p_generation,
   'revision',CASE WHEN p_action='grant' THEN p_revision END,'version',CASE WHEN p_action='grant' THEN p_notice_version END,
   'hash',CASE WHEN p_action='grant' THEN p_notice_sha256 END)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM private.dabra_task_consent_mutations WHERE actor_id=p_actor_id AND mutation_id=p_mutation;
  IF FOUND THEN
   IF receipt.action<>p_action OR receipt.request_generation<>p_generation OR receipt.request_sha256<>fingerprint THEN RETURN NULL;END IF;
   -- Old withdrawal replay reports its receipt only; it never touches newer content.
   IF p_action='revoke' THEN RETURN jsonb_build_object('state','revoked','generation',receipt.result_generation);END IF;
   IF receipt.result_generation<>gen OR NOT EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions candidate WHERE reference='consent:'||p_mutation::text AND private.dabra_task_consent_effective(candidate,p_actor_id,p_actor_role,p_revision,n)) THEN RETURN NULL;END IF;
   RETURN jsonb_build_object('state','granted','generation',receipt.result_generation);
  END IF;
  IF p_generation<>gen OR gen>=9007199254740991 THEN RETURN NULL;END IF;
 END IF;
 IF p_action='revoke' THEN
  IF p_generation IS DISTINCT FROM gen THEN RETURN NULL;END IF;
  -- No execution gate, audience, funding or notice expiry dependency for removal.
  UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=coalesce(revoked_at_ms,n) WHERE actor_id=p_actor_id AND kind='consent';
  PERFORM private.dabra_task_remove_content(p_actor_id);
  INSERT INTO private.dabra_task_consent_fences VALUES(p_actor_id,gen+1) ON CONFLICT(actor_id) DO UPDATE SET generation=EXCLUDED.generation;
  INSERT INTO private.dabra_task_consent_mutations VALUES(p_actor_id,p_mutation,p_action,gen,gen+1,fingerprint);
  RETURN jsonb_build_object('state','revoked','generation',gen+1);
 END IF;
 refs:=private.dabra_task_select(p_actor_id,p_actor_role,p_revision,false);IF refs IS NULL THEN RETURN NULL;END IF;
 LOCK TABLE private.dabra_task_notices IN ROW SHARE MODE NOWAIT;
 SELECT * INTO notice FROM private.dabra_task_notices WHERE revision=p_revision FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN NULL;END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF notice.revoked_at_ms IS NOT NULL OR notice.approved_at_ms>n OR notice.expires_at_ms<=n OR notice.consent_expires_at_ms<=n THEN RETURN NULL;END IF;
 IF p_action='notice' THEN RETURN jsonb_build_object('revision',p_revision,'noticeVersion',notice.notice_version,'noticeSha256',notice.notice_sha256,'text',notice.notice_text,'generation',gen,'expiresAtMs',least(notice.expires_at_ms,notice.consent_expires_at_ms));END IF;
 IF p_mutation IS NULL OR p_notice_version IS DISTINCT FROM notice.notice_version OR p_notice_sha256 IS DISTINCT FROM notice.notice_sha256 THEN RETURN NULL;END IF;
 ref:='consent:'||p_mutation::text;
 IF EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions candidate WHERE private.dabra_task_consent_effective(candidate,p_actor_id,p_actor_role,p_revision,n)) THEN RETURN NULL;END IF;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF least(notice.expires_at_ms,notice.consent_expires_at_ms)<=n OR EXISTS(SELECT 1 FROM private.dabra_successful_task_decisions WHERE reference IN(SELECT value FROM jsonb_each_text(refs) WHERE key LIKE '%Decision') AND expires_at_ms<=n) THEN RETURN NULL;END IF;
 -- Explicit renewal retires expired/other-revision approvals, not their saved content.
 UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=n WHERE actor_id=p_actor_id AND kind='consent' AND revoked_at_ms IS NULL;
 INSERT INTO private.dabra_successful_task_decisions(reference,revision,kind,purpose,actor_id,actor_role,approved_by,approval_reference,approved_at_ms,expires_at_ms,document)
 VALUES(ref,p_revision,'consent','dabra-successful-task',p_actor_id,p_actor_role,p_actor_id,'explicit:'||p_mutation::text,n,notice.consent_expires_at_ms,
 jsonb_build_object('schema','dabra-answer-consent-v1','actorId',p_actor_id,'revision',p_revision,'noticeVersion',notice.notice_version,'noticeSha256',notice.notice_sha256,'grantedAtMs',n,'generation',gen+1));
 INSERT INTO private.dabra_task_consent_fences VALUES(p_actor_id,gen+1) ON CONFLICT(actor_id) DO UPDATE SET generation=EXCLUDED.generation;
 INSERT INTO private.dabra_task_consent_mutations VALUES(p_actor_id,p_mutation,p_action,gen,gen+1,fingerprint);
 RETURN jsonb_build_object('state','granted','generation',gen+1);
EXCEPTION WHEN lock_not_available OR data_exception OR unique_violation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.dabra_task_consent(uuid,text,text,text,text,text,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dabra_task_consent(uuid,text,text,text,text,text,bigint,uuid) TO service_role;
COMMIT;
