BEGIN;

-- Canonical read access for authenticated users; row-level access remains enforced by RLS.
GRANT SELECT ON TABLE public.profiles TO authenticated;

COMMIT;
