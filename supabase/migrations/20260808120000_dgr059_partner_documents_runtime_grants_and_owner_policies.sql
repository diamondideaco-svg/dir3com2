BEGIN;

DO $$
BEGIN
  IF to_regclass('public.partner_documents') IS NULL THEN
    RAISE EXCEPTION 'DGR059 FAIL: public.partner_documents table is missing';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_documents TO service_role;
GRANT SELECT ON TABLE public.partner_documents TO authenticated;
GRANT INSERT (id, partner_id, document_type, file_url, status, verified, verified_at, created_at, updated_at)
  ON TABLE public.partner_documents TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_documents'
      AND policyname = 'partner_documents_owner_read'
  ) THEN
    DROP POLICY partner_documents_owner_read ON public.partner_documents;
  END IF;

  CREATE POLICY partner_documents_owner_read
    ON public.partner_documents
    FOR SELECT
    TO authenticated
    USING (partner_id = auth.uid());
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_documents'
      AND policyname = 'partner_documents_owner_insert'
  ) THEN
    DROP POLICY partner_documents_owner_insert ON public.partner_documents;
  END IF;

  CREATE POLICY partner_documents_owner_insert
    ON public.partner_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (partner_id = auth.uid());
END
$$;

COMMIT;
