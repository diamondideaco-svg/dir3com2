BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'GO-LIVE-INC-006 FAIL: public.profiles table is missing';
  END IF;

  IF to_regclass('public.partner_documents') IS NULL THEN
    RAISE EXCEPTION 'GO-LIVE-INC-006 FAIL: public.partner_documents table is missing';
  END IF;
END
$$;

-- Ensure authenticated runtime can read and self-maintain profile rows under RLS owner policy.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT INSERT (id, email, full_name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (email, full_name, updated_at) ON TABLE public.profiles TO authenticated;

-- Keep service role operational parity for backend paths.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

-- Ensure partner portal document APIs can read/insert as authenticated owner under RLS.
GRANT SELECT ON TABLE public.partner_documents TO authenticated;
GRANT INSERT (id, partner_id, document_type, file_url, status, verified, verified_at, created_at, updated_at)
  ON TABLE public.partner_documents TO authenticated;

-- Keep service role operational parity for backend and maintenance paths.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_documents TO service_role;

COMMIT;
