-- Task217: authenticated Customer cases on the existing contact workflow.
-- LOCAL reviewed artifact only. production_apply_authorized=false.
-- ACL delta: two new service_role-only RPCs and a non-public trigger function.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

ALTER TABLE public.contact_enquiries
  ADD COLUMN intake_origin text NOT NULL DEFAULT 'legacy',
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT contact_enquiries_intake_origin_check CHECK
    (intake_origin IN ('legacy','anonymous','authenticated') AND
     (intake_origin='authenticated' OR owner_user_id IS NULL));
-- Existing unassigned rows remain legacy. NULL never establishes anonymous origin.
ALTER TABLE public.contact_enquiries ALTER COLUMN intake_origin SET DEFAULT 'anonymous';
CREATE INDEX contact_enquiries_owner_created ON public.contact_enquiries(owner_user_id,created_at DESC)
  WHERE intake_origin='authenticated' AND owner_user_id IS NOT NULL;

CREATE FUNCTION public.protect_customer_contact_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.intake_origin='legacy' OR
       (NEW.intake_origin='authenticated' AND NEW.owner_user_id IS NULL) THEN
      RAISE EXCEPTION 'CONTACT_OWNERSHIP_INVALID' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.intake_origin IS DISTINCT FROM OLD.intake_origin
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    -- Reject structural changes before preparing any Auth lookup.
    IF NEW.intake_origin IS DISTINCT FROM OLD.intake_origin
       OR OLD.intake_origin IS DISTINCT FROM 'authenticated'
       OR OLD.owner_user_id IS NULL OR NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'CONTACT_OWNERSHIP_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    -- Only a stable authenticated origin and an owned -> NULL transition
    -- can be the parent's FK SET NULL. Absence still has to be verified.
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=OLD.owner_user_id) THEN
        RETURN NEW;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      -- Inability to verify never authorizes a direct ownership change.
      RAISE EXCEPTION 'CONTACT_OWNERSHIP_IMMUTABLE' USING ERRCODE='23514';
    END;
    RAISE EXCEPTION 'CONTACT_OWNERSHIP_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_customer_contact_ownership() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER contact_ownership_immutable BEFORE INSERT OR UPDATE ON public.contact_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.protect_customer_contact_ownership();

CREATE OR REPLACE FUNCTION public.receive_contact_enquiry(p_key uuid, p_fingerprint text, p_sender_hash text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.contact_enquiries; new_id uuid;
begin
  -- One database-wide lock bounds aggregate public intake across all instances.
  perform pg_catalog.pg_advisory_xact_lock(174, 1);
  select * into existing from public.contact_enquiries where request_key = p_key;
  if found then
    if existing.intake_origin IS DISTINCT FROM 'anonymous' OR existing.owner_user_id IS NOT NULL then return jsonb_build_object('kind','conflict'); end if;
    if existing.fingerprint <> p_fingerprint then return jsonb_build_object('kind','conflict'); end if;
    return jsonb_build_object('kind','saved','reference',existing.id,'replay',true);
  end if;
  if (select count(*) from public.contact_enquiries where created_at > now() - interval '1 hour') >= 100
     or (select count(*) from public.contact_enquiries where sender_hash = p_sender_hash and created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('kind','limited');
  end if;
  insert into public.contact_enquiries(request_key,fingerprint,sender_hash,name,email,phone,subject,message,country)
  values(p_key,p_fingerprint,p_sender_hash,p_input->>'name',p_input->>'email',coalesce(p_input->>'phone',''),p_input->>'subject',p_input->>'message',p_input->>'country') returning id into new_id;
  insert into public.contact_enquiry_events(enquiry_id,status) values(new_id,'received');
  return jsonb_build_object('kind','saved','reference',new_id,'replay',false);
end $$;
revoke all on function public.receive_contact_enquiry(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.receive_contact_enquiry(uuid,text,text,jsonb) to service_role;



CREATE FUNCTION public.receive_customer_contact_enquiry(p_actor uuid,p_key uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item public.contact_enquiries; v_id uuid; v_fingerprint text; v_sender text;
BEGIN
  IF p_actor IS NULL OR p_key IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
    OR p_input-ARRAY['name','email','phone','subject','message','country']::text[]<>'{}'::jsonb
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['name','email','phone','subject','message','country']) k
      WHERE jsonb_typeof(p_input->k) IS DISTINCT FROM 'string')
    OR length(p_input->>'name') NOT BETWEEN 1 AND 120
    OR length(p_input->>'email') NOT BETWEEN 3 AND 254
    OR length(p_input->>'phone')>32 OR length(p_input->>'message') NOT BETWEEN 1 AND 2000
    OR p_input->>'subject' NOT IN ('booking','service','partnership','other')
    OR p_input->>'country' NOT IN ('EG','SA','AE','OTHER') THEN
    RAISE EXCEPTION 'CONTACT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Same active canonical profile as Core, locked through the actual write.
  PERFORM 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active' AND p.deleted_at IS NULL
    AND lower(btrim(p.role)) IN ('client','customer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(174,1);
  SELECT * INTO item FROM public.contact_enquiries WHERE request_key=p_key FOR UPDATE;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',p_actor,'input',p_input)::text,'UTF8')),'hex');
  IF FOUND THEN
    IF item.intake_origin IS DISTINCT FROM 'authenticated' OR item.owner_user_id IS DISTINCT FROM p_actor
       OR item.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RETURN jsonb_build_object('kind','conflict');
    END IF;
    RETURN jsonb_build_object('kind','saved','reference',item.id,'replay',true);
  END IF;
  IF (SELECT count(*) FROM public.contact_enquiries WHERE created_at>clock_timestamp()-interval '1 hour')>=100
    OR (SELECT count(*) FROM public.contact_enquiries WHERE intake_origin='authenticated'
      AND owner_user_id=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=3 THEN
    RETURN jsonb_build_object('kind','limited');
  END IF;
  v_sender:=encode(sha256(convert_to('task217-customer:'||p_actor::text,'UTF8')),'hex');
  INSERT INTO public.contact_enquiries(request_key,fingerprint,sender_hash,name,email,phone,subject,message,country,intake_origin,owner_user_id)
    VALUES(p_key,v_fingerprint,v_sender,p_input->>'name',p_input->>'email',p_input->>'phone',
      p_input->>'subject',p_input->>'message',p_input->>'country','authenticated',p_actor)
    RETURNING id INTO v_id;
  INSERT INTO public.contact_enquiry_events(enquiry_id,actor_id,status) VALUES(v_id,p_actor,'received');
  RETURN jsonb_build_object('kind','saved','reference',v_id,'replay',false);
END $$;
REVOKE ALL ON FUNCTION public.receive_customer_contact_enquiry(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_customer_contact_enquiry(uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION public.get_customer_contact_cases(p_actor uuid,p_case uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
  PERFORM 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active' AND p.deleted_at IS NULL
    AND lower(btrim(p.role)) IN ('client','customer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501'; END IF;
  WITH candidates AS (
    SELECT c.id,c.status,c.subject,c.country,c.created_at,c.updated_at
    FROM public.contact_enquiries c
    WHERE c.intake_origin='authenticated' AND c.owner_user_id=p_actor AND (p_case IS NULL OR c.id=p_case)
    ORDER BY c.created_at DESC,c.id LIMIT 21
  ), shown AS (SELECT * FROM candidates ORDER BY created_at DESC,id LIMIT 20)
  SELECT jsonb_build_object('kind','ready','truncated',(SELECT count(*)>20 FROM candidates),
    'retrievedAt',clock_timestamp(),'cases',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'reference','CASE-'||s.id::text,'status',s.status,'subject',s.subject,'country',s.country,
      'createdAt',s.created_at,'updatedAt',s.updated_at,
      'events',coalesce((SELECT jsonb_agg(jsonb_build_object('status',e.status,'createdAt',e.created_at) ORDER BY e.created_at,e.id)
        FROM (SELECT ev.id,ev.status,ev.created_at FROM public.contact_enquiry_events ev
          WHERE ev.enquiry_id=s.id ORDER BY ev.created_at DESC,ev.id LIMIT 20) e),'[]'::jsonb))
      ORDER BY s.created_at DESC,s.id) FROM shown s),'[]'::jsonb)) INTO answer;
  RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.get_customer_contact_cases(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_contact_cases(uuid,uuid) TO service_role;

-- Same confirmed operator action/signature, now rechecking authority and country
-- under transaction locks instead of trusting the pre-await web guard alone.
CREATE OR REPLACE FUNCTION public.progress_contact_enquiry(
  p_id uuid,p_actor uuid,p_countries text[],p_expected text,p_status text,p_note text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item public.contact_enquiries; v_profile public.profiles; v_grant public.team_access_grants;
  v_global boolean:=false;
  v_permissions constant text[]:=ARRAY['admin:full','operations:read','operations:write',
    'customers:read','customers:write','partners:read','partners:write','products:read','products:write',
    'finance:read','finance:write','verification:read','verification:write'];
BEGIN
  IF p_id IS NULL OR p_actor IS NULL OR p_expected IS NULL OR p_status IS NULL OR p_note IS NULL
    OR length(p_note)>2000 THEN RAISE EXCEPTION 'CONTACT_INVALID'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=p_actor FOR SHARE;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'active' OR v_profile.deleted_at IS NOT NULL
    OR lower(btrim(v_profile.role)) NOT IN ('admin','super_admin','staff') THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_actor='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid AND lower(btrim(v_profile.role))='admin' THEN
    v_global:=true;
  ELSE
    BEGIN
      SELECT * INTO STRICT v_grant FROM public.team_access_grants WHERE invited_user_id=p_actor FOR SHARE;
    EXCEPTION WHEN no_data_found OR too_many_rows THEN
      RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501';
    END;
    IF v_grant.status IS DISTINCT FROM 'active' OR v_grant.access_level NOT IN ('global_admin','scoped_staff')
      OR v_grant.permissions IS NULL OR cardinality(v_grant.permissions)=0
      OR NOT(v_grant.permissions<@v_permissions) OR array_position(v_grant.permissions,NULL) IS NOT NULL
      OR v_grant.country_scope IS NULL
      OR EXISTS(SELECT 1 FROM unnest(v_grant.country_scope) c WHERE c IS NULL OR btrim(c)='') THEN
      RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501';
    END IF;
    v_global:=v_grant.access_level='global_admin' OR 'admin:full'=ANY(v_grant.permissions);
    IF NOT v_global AND NOT('operations:write'=ANY(v_grant.permissions)) THEN
      RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;
  SELECT * INTO item FROM public.contact_enquiries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR (p_countries IS NOT NULL AND NOT(item.country=ANY(p_countries)))
    OR (NOT v_global AND NOT EXISTS(SELECT 1 FROM unnest(v_grant.country_scope) c
      WHERE public.normalize_admin_country_key(c)=public.normalize_admin_country_key(item.country))) THEN
    RAISE EXCEPTION 'CONTACT_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF item.status=p_status THEN RETURN false; END IF;
  IF item.status<>p_expected THEN RAISE EXCEPTION 'CONTACT_STALE'; END IF;
  IF NOT((item.status='received' AND p_status='in_progress') OR (item.status='in_progress' AND p_status='closed')) THEN
    RAISE EXCEPTION 'CONTACT_TRANSITION';
  END IF;
  UPDATE public.contact_enquiries SET status=p_status,updated_at=clock_timestamp() WHERE id=p_id;
  INSERT INTO public.contact_enquiry_events(enquiry_id,actor_id,status,internal_note) VALUES(p_id,p_actor,p_status,p_note);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.progress_contact_enquiry(uuid,uuid,text[],text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.progress_contact_enquiry(uuid,uuid,text[],text,text,text) TO service_role;
-- Existing table ACL/RLS are unchanged; no anonymous/authenticated table access.
COMMIT;
