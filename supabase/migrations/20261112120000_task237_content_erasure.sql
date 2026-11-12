-- Local disabled preparation only. No scheduler, retention value or live apply.
-- Requires the separately accepted Task187 schema; never provisions that backend.
BEGIN;
DO $$
BEGIN
 IF to_regclass('public.dabra_account_continuity') IS NULL OR to_regclass('public.dabra_continuity_policy') IS NULL
  OR to_regprocedure('public.dabra_continuity_mutate(text,bigint,bigint,uuid,jsonb)') IS NULL
  OR to_regprocedure('public.dabra_continuity_purge()') IS NULL THEN
  RAISE EXCEPTION 'Required Task187 contract is absent' USING ERRCODE='55000';END IF;
 LOCK TABLE public.dabra_account_continuity,public.dabra_continuity_policy IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.dabra_continuity_policy','singleton','boolean'),('public.dabra_continuity_policy','enabled','boolean'),
  ('public.dabra_account_continuity','owner_id','uuid'),('public.dabra_account_continuity','revision','bigint'),
  ('public.dabra_account_continuity','generation','bigint'),('public.dabra_account_continuity','consent_enabled','boolean'),
  ('public.dabra_account_continuity','consent_version','text'),('public.dabra_account_continuity','trip','jsonb'),
  ('public.dabra_account_continuity','trip_expires_at','timestamp with time zone')) v(rel,col,typ)
  WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(v.rel) AND a.attname=v.col
   AND NOT a.attisdropped AND a.atttypid=to_regtype(v.typ))) THEN
  RAISE EXCEPTION 'Required Task187 column contract mismatch' USING ERRCODE='55000';END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('public.dabra_account_continuity','owner_id'),('public.dabra_continuity_policy','singleton')) v(rel,col)
  WHERE NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname=v.col
   WHERE i.indrelid=to_regclass(v.rel) AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
    AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum)) THEN
  RAISE EXCEPTION 'Required Task187 unique identity contract mismatch' USING ERRCODE='55000';END IF;
END $$;

CREATE FUNCTION private.dabra_task_continuity_erasure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original jsonb; ids uuid[];
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(OLD.owner_id,OLD.revision,OLD.generation,OLD.consent_enabled,OLD.consent_version,OLD.trip,OLD.trip_expires_at)
   IS NOT DISTINCT FROM ROW(NEW.owner_id,NEW.revision,NEW.generation,NEW.consent_enabled,NEW.consent_version,NEW.trip,NEW.trip_expires_at) THEN RETURN NEW;END IF;
 END IF;
 IF OLD.trip IS NOT NULL AND OLD.trip_expires_at IS NOT NULL THEN
  -- Task187 already holds its owner row here. Never wait for the reverse-order
  -- Task237 locks: contention must roll back the entire source mutation.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN
   RAISE EXCEPTION 'Derived task content busy' USING ERRCODE='55P03';END IF;
  LOCK TABLE private.dabra_production_tasks,private.dabra_production_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  original:=jsonb_build_object('schema','dabra-task-continuity-v1','ownerId',OLD.owner_id,'revision',OLD.revision,
   'generation',OLD.generation,'tripId',OLD.trip->>'id','tripExpiresAtMs',floor(extract(epoch FROM OLD.trip_expires_at)*1000)::bigint,'originalTrip',OLD.trip);
  SELECT array_agg(request_id) INTO ids FROM private.dabra_production_tasks
   WHERE actor_id=OLD.owner_id AND content_removed_at_ms IS NULL AND continuity_binding=original;
  -- Empty selection is not the helper's NULL (all-owner) removal operation.
  IF ids IS NOT NULL THEN PERFORM private.dabra_task_remove_content(OLD.owner_id,ids);END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dabra_task_continuity_erasure() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER task237_erase_continuity_derivatives AFTER UPDATE OR DELETE ON public.dabra_account_continuity
 FOR EACH ROW EXECUTE FUNCTION private.dabra_task_continuity_erasure();

-- Typed stored deadlines only; malformed/absent JSON is not evidence of expiry.
CREATE FUNCTION private.dabra_task_deadline_due(value jsonb,p_now bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(value)='number' AND value::text ~ '^[0-9]{1,16}$'
  THEN value::text::numeric BETWEEN 0 AND least(p_now,9007199254740991) ELSE false END
$$;
REVOKE ALL ON FUNCTION private.dabra_task_deadline_due(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.purge_dabra_production_task_content(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint; item record; removed integer:=0;
BEGIN
 -- Batch capability ceiling, not a retention period. Caller must choose a limit.
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid purge batch' USING ERRCODE='22023';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) THEN
  RAISE EXCEPTION 'Task content busy' USING ERRCODE='55P03';END IF;
 LOCK TABLE private.dabra_production_tasks,private.dabra_production_task_answers IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 n:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 FOR item IN SELECT t.actor_id,t.request_id FROM private.dabra_production_tasks t
  WHERE t.content_removed_at_ms IS NULL AND (
   t.input_valid_until_ms<=n OR private.dabra_task_deadline_due(t.continuity_binding->'tripExpiresAtMs',n)
   OR EXISTS(SELECT 1 FROM private.dabra_production_task_answers a WHERE a.actor_id=t.actor_id AND a.request_id=t.request_id AND a.expires_at_ms<=n)
   OR EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(t.decision_bundle->'decisions')='object' THEN t.decision_bundle->'decisions' ELSE '{}'::jsonb END) d
    WHERE d.key=ANY(ARRAY['retention','consent','deletion','audience','spending']) AND private.dabra_task_deadline_due(d.value->'expiresAtMs',n))
  ) ORDER BY t.actor_id,t.request_id LIMIT p_limit FOR UPDATE OF t NOWAIT
 LOOP
  removed:=removed+private.dabra_task_remove_content(item.actor_id,ARRAY[item.request_id]);
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.purge_dabra_production_task_content(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_dabra_production_task_content(integer) TO service_role;
COMMIT;
