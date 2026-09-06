BEGIN;

-- Canonical profile provisioning from auth.users.
-- Role and status are intentionally left to database defaults on public.profiles.
CREATE OR REPLACE FUNCTION public.provision_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_full_name text;
  v_inserted_count integer := 0;
BEGIN
  v_email := nullif(trim(NEW.email), '');
  IF v_email IS NULL THEN
    v_email := format('user-%s@placeholder.local', NEW.id);
  END IF;

  v_full_name := nullif(
    trim(
      coalesce(
        NEW.raw_user_meta_data ->> 'full_name_ar',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name'
      )
    ),
    ''
  );

  IF v_full_name IS NULL THEN
    v_full_name := split_part(v_email, '@', 1);
    IF v_full_name = '' THEN
      v_full_name := 'user';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, v_email, v_full_name)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count = 0 THEN
    -- Keep email/full_name synchronized for pre-existing backfilled rows.
    UPDATE public.profiles
    SET email = v_email,
        full_name = v_full_name,
        updated_at = now()
    WHERE id = NEW.id
      AND (email IS DISTINCT FROM v_email OR full_name IS DISTINCT FROM v_full_name);
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trg_auth_users_provision_profile'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER trg_auth_users_provision_profile ON auth.users;
  END IF;
END;
$$;

CREATE TRIGGER trg_auth_users_provision_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.provision_profile_for_auth_user();

-- Security hardening for SECURITY DEFINER trigger function.
REVOKE ALL ON FUNCTION public.provision_profile_for_auth_user() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.provision_profile_for_auth_user() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.provision_profile_for_auth_user() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.provision_profile_for_auth_user() TO service_role;
  END IF;
END;
$$;

-- Backfill missing profiles for existing auth users without touching existing profile rows.
WITH missing_users AS (
  SELECT
    u.id,
    nullif(trim(u.email), '') AS email,
    nullif(
      trim(
        coalesce(
          u.raw_user_meta_data ->> 'full_name_ar',
          u.raw_user_meta_data ->> 'full_name',
          u.raw_user_meta_data ->> 'name'
        )
      ),
      ''
    ) AS metadata_full_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
)
INSERT INTO public.profiles (id, email, full_name)
SELECT
  m.id,
  coalesce(m.email, format('user-%s@placeholder.local', m.id)),
  coalesce(m.metadata_full_name, split_part(coalesce(m.email, format('user-%s@placeholder.local', m.id)), '@', 1), 'user')
FROM missing_users m
ON CONFLICT (id) DO NOTHING;

-- Tighten profile self-service policy to current user row only.
DROP POLICY IF EXISTS "Users manage own profiles" ON public.profiles;
CREATE POLICY "Users manage own profiles" ON public.profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMIT;
