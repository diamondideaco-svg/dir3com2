BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_coverage TO service_role;

COMMIT;
