BEGIN;

CREATE TABLE IF NOT EXISTS public.team_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS team_access_grants_email_unique
  ON public.team_access_grants (lower(email));
CREATE INDEX IF NOT EXISTS team_access_grants_user_idx
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
      AND p.role = 'admin'
      AND p.status = 'active'
      AND lower(p.email) = 'diamondidea.co@gmail.com'
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
  USING (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    OR invited_user_id = auth.uid()
  );

CREATE POLICY team_access_service_role_all
  ON public.team_access_grants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.team_access_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.team_access_grants TO authenticated, service_role;

COMMIT;
