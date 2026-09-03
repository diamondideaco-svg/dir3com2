BEGIN;

CREATE TABLE IF NOT EXISTS public.team_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  job_title text NOT NULL,
  access_level text NOT NULL DEFAULT 'scoped_staff' CHECK (access_level IN ('scoped_staff', 'global_admin')),
  country_scope text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  invited_user_id uuid NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One grant per attached Auth identity, even when its contact email changes.
-- This migration is pending/unapplied. Reconcile the legacy NON-UNIQUE index
-- atomically instead of trusting an existing name. Duplicate UUIDs abort the
-- transaction, retaining the original rows/index for explicit reconciliation.
DROP INDEX IF EXISTS public.team_access_grants_user_idx;
CREATE UNIQUE INDEX team_access_grants_user_idx
  ON public.team_access_grants (invited_user_id);

CREATE OR REPLACE FUNCTION public.is_ceo_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
      AND p.role = 'admin'
      AND p.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_ceo_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ceo_actor() TO authenticated, service_role;

ALTER TABLE public.team_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_access_ceo_all ON public.team_access_grants;
DROP POLICY IF EXISTS team_access_self_read ON public.team_access_grants;
DROP POLICY IF EXISTS team_access_service_role_all ON public.team_access_grants;

CREATE POLICY team_access_ceo_all
  ON public.team_access_grants
  FOR ALL
  TO authenticated
  USING (public.is_ceo_actor())
  WITH CHECK (public.is_ceo_actor());

CREATE POLICY team_access_self_read
  ON public.team_access_grants
  FOR SELECT
  TO authenticated
  -- Email is contact data, not ownership. Invitations are attached by the
  -- trusted server action before a grant can authorize an employee.
  USING (invited_user_id = auth.uid());

CREATE POLICY team_access_service_role_all
  ON public.team_access_grants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.team_access_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.team_access_grants TO authenticated, service_role;

-- Match JavaScript trim().toLowerCase() for legacy contact whitespace. Contact
-- matching is provisioning compatibility only; it NEVER authorizes an actor.
CREATE OR REPLACE FUNCTION public.normalize_team_email(value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'));
$$;
REVOKE ALL ON FUNCTION public.normalize_team_email(text) FROM PUBLIC, anon, authenticated, service_role;

-- Authenticated CEO context, not a caller-supplied actor UUID or service key.
-- Definer privileges are confined to atomic Auth lookup/profile provisioning;
-- the canonical active CEO predicate is mandatory before privileged access.
CREATE OR REPLACE FUNCTION public.save_team_access_grant(
  p_user_id uuid, p_email text, p_job_title text, p_access_level text,
  p_country_scope text[], p_permissions text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := public.normalize_team_email(p_email);
  v_auth_email text;
  v_auth_ids uuid[];
  v_name text;
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_result uuid;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR v_email IS NULL OR v_email='' OR position('@' in v_email)=0
    OR p_job_title IS NULL OR btrim(p_job_title)='' OR length(p_job_title)>120
    OR p_access_level IS NULL OR p_access_level NOT IN ('global_admin','scoped_staff')
    OR p_country_scope IS NULL OR cardinality(p_country_scope)>20
    OR array_position(p_country_scope,NULL) IS NOT NULL OR p_permissions IS NULL
    OR array_position(p_permissions,NULL) IS NOT NULL
    OR NOT p_permissions <@ ARRAY['admin:full','operations:read','operations:write','customers:read','customers:write','partners:read','partners:write','products:read','products:write','finance:read','finance:write','verification:read','verification:write']::text[]
  THEN RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023'; END IF;
  IF p_user_id=v_actor AND p_access_level<>'global_admin' THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;
  SELECT public.normalize_team_email(email), coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',split_part(v_email,'@',1))
    INTO v_auth_email,v_name FROM auth.users WHERE id=p_user_id FOR SHARE;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  -- The admin listing is paginated and therefore cannot prove identity
  -- uniqueness. Enforce it over authoritative Auth rows at the write boundary.
  SELECT array_agg(id) INTO v_auth_ids FROM auth.users
    WHERE public.normalize_team_email(email)=v_email;
  IF coalesce(cardinality(v_auth_ids),0)<>1 OR v_auth_ids[1]<>p_user_id THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  -- Also excludes normalized-email phantoms and serializes status changes.
  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
    WHERE invited_user_id=p_user_id OR public.normalize_team_email(email)=v_email;
  IF cardinality(v_ids)>1 THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  IF cardinality(v_ids)=1 THEN
    SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
    IF v_grant.invited_user_id IS NOT NULL AND v_grant.invited_user_id<>p_user_id THEN
      RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
    END IF;
    UPDATE public.team_access_grants SET email=v_email,invited_user_id=p_user_id,
      job_title=p_job_title,access_level=p_access_level,country_scope=p_country_scope,
      permissions=CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,
      status='active',updated_at=now() WHERE id=v_grant.id RETURNING id INTO v_result;
  ELSE
    INSERT INTO public.team_access_grants(email,invited_user_id,job_title,access_level,country_scope,permissions,status,created_by)
      VALUES(v_email,p_user_id,p_job_title,p_access_level,p_country_scope,
        CASE WHEN p_access_level='global_admin' THEN ARRAY['admin:full'] ELSE p_permissions END,'active',v_actor)
      RETURNING id INTO v_result;
  END IF;
  IF p_access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  INSERT INTO public.profiles(id,email,full_name,role,status) VALUES(p_user_id,v_email,v_name,v_role,'active')
    ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,role=EXCLUDED.role,status=EXCLUDED.status;
  RETURN v_result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
END;
$$;
REVOKE ALL ON FUNCTION public.save_team_access_grant(uuid,text,text,text,text[],text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_team_access_grant(uuid,text,text,text,text[],text[]) TO authenticated;

-- Same lock/transaction as attachment: deactivation must never read an
-- unattached row and then skip an identity attached by a concurrent save.
CREATE OR REPLACE FUNCTION public.set_team_access_status(p_email text,p_status text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_ids uuid[];
  v_grant public.team_access_grants%ROWTYPE;
  v_role public.profiles.role%TYPE;
  v_status public.profiles.status%TYPE;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id=v_actor
    AND id='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid
    AND role='admin' AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  LOCK TABLE public.team_access_grants IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(id) INTO v_ids FROM public.team_access_grants
    WHERE public.normalize_team_email(email)=public.normalize_team_email(p_email);
  IF coalesce(cardinality(v_ids),0)=0 THEN
    RAISE EXCEPTION 'TEAM_ACCESS_NOT_FOUND' USING ERRCODE='22023';
  END IF;
  IF cardinality(v_ids)<>1 THEN
    RAISE EXCEPTION 'TEAM_ACCESS_IDENTITY_CONFLICT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_grant FROM public.team_access_grants WHERE id=v_ids[1];
  IF v_grant.invited_user_id=v_actor AND (p_status<>'active' OR v_grant.access_level<>'global_admin') THEN
    RAISE EXCEPTION 'TEAM_ACCESS_CEO_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF v_grant.access_level='global_admin' THEN v_role:='admin'; ELSE v_role:='staff'; END IF;
  IF p_status='active' THEN v_status:='active'; ELSE v_status:='inactive'; END IF;
  UPDATE public.team_access_grants SET status=p_status,updated_at=now() WHERE id=v_grant.id;
  IF v_grant.invited_user_id IS NOT NULL THEN
    UPDATE public.profiles SET status=v_status,role=v_role WHERE id=v_grant.invited_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_PROFILE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN v_grant.id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_team_access_status(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_team_access_status(text,text) TO authenticated;

COMMIT;
