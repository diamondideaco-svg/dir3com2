BEGIN;
-- Canonical customer self-service documents are verification_documents, owned by
-- profiles.id (not the unlinked CRM customers table). Legacy rows are untouched.
DO $$
BEGIN
  IF to_regclass('public.verification_documents') IS NULL OR to_regclass('storage.objects') IS NULL
     OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_DOCUMENT_SCHEMA_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('id','uuid'),('owner_id','text'),('owner_type','text'),
      ('file_url','text'),('verification_status','text'),('document_type','text'),
      ('verification_request_id','uuid'),('issue_date','date'),('expiry_date','date'),
      ('verified_by','text'),('review_notes','text'),('created_at','timestamp with time zone'),
      ('updated_at','timestamp with time zone')) e(name,typ)
    LEFT JOIN information_schema.columns c ON c.table_schema='public'
      AND c.table_name='verification_documents' AND c.column_name=e.name
    WHERE c.data_type IS DISTINCT FROM e.typ
  ) THEN RAISE EXCEPTION 'CUSTOMER_DOCUMENT_SCHEMA_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a
    ON a.attrelid=c.conrelid AND a.attname='id'
    WHERE c.conrelid='public.verification_documents'::regclass AND c.contype='p'
      AND c.conkey=ARRAY[a.attnum]::smallint[]) THEN
    RAISE EXCEPTION 'CUSTOMER_DOCUMENT_PRIMARY_KEY_CONFLICT';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='verification_documents'
      AND policyname NOT IN ('verification_documents_admin_all','verification_documents_customer_select_own','customer_document_insert_own'))
    OR has_table_privilege('authenticated','public.verification_documents','TRUNCATE') THEN
    RAISE EXCEPTION 'CUSTOMER_DOCUMENT_SECURITY_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='customer-documents'
    AND (public OR file_size_limit IS DISTINCT FROM 4194304 OR allowed_mime_types IS DISTINCT FROM
      ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[])) THEN
    RAISE EXCEPTION 'CUSTOMER_DOCUMENT_BUCKET_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='verification_documents' AND column_name IN ('upload_sha256','storage_bucket')
    AND (data_type<>'text' OR is_nullable<>'YES' OR column_default IS NOT NULL)) THEN
    RAISE EXCEPTION 'CUSTOMER_DOCUMENT_UPLOAD_COLUMN_CONFLICT';
  END IF;
END $$;

ALTER TABLE public.verification_documents ADD COLUMN IF NOT EXISTS upload_sha256 text;
ALTER TABLE public.verification_documents ADD COLUMN IF NOT EXISTS storage_bucket text;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('customer-documents','customer-documents',false,4194304,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
-- Existing explicit Admin policy is preserved; no new Admin storage access.
DROP POLICY IF EXISTS verification_documents_customer_select_own ON public.verification_documents;
CREATE POLICY verification_documents_customer_select_own ON public.verification_documents
FOR SELECT TO authenticated USING (
  owner_type='customer' AND owner_id=(SELECT auth.uid())::text
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.role='customer' AND p.status='active' AND p.deleted_at IS NULL)
);
DROP POLICY IF EXISTS customer_document_insert_own ON public.verification_documents;
CREATE POLICY customer_document_insert_own ON public.verification_documents
FOR INSERT TO authenticated WITH CHECK (
  owner_type='customer' AND owner_id=(SELECT auth.uid())::text
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.role='customer' AND p.status='active' AND p.deleted_at IS NULL)
  AND storage_bucket='customer-documents'
  AND upload_sha256 ~ '^[0-9a-f]{64}$'
  AND file_url ~ ('^' || owner_id || '/' || id::text || '\.(pdf|jpg|png|webp)$')
  AND document_type IN ('passport','visa','id_card','driving_license','insurance','other')
  AND verification_status='Pending' AND verified_by IS NULL AND review_notes IS NULL
  AND verification_request_id IS NULL
  AND (issue_date IS NULL OR expiry_date IS NULL OR expiry_date>=issue_date)
  AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='customer-documents' AND o.name=file_url)
);
GRANT SELECT, INSERT ON public.verification_documents TO authenticated;
REVOKE ALL ON public.verification_documents FROM anon;

-- Server validates bytes before a service client uploads. Customers cannot bypass
-- file validation by writing directly to Storage or overwrite/delete any object.
DROP POLICY IF EXISTS customer_documents_storage_boundary ON storage.objects;
CREATE POLICY customer_documents_storage_boundary ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING (bucket_id <> 'customer-documents' OR (
  (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.role='customer' AND p.status='active' AND p.deleted_at IS NULL)
))
WITH CHECK (bucket_id <> 'customer-documents');
DROP POLICY IF EXISTS customer_documents_storage_read ON storage.objects;
CREATE POLICY customer_documents_storage_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='customer-documents'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid())
    AND p.role='customer' AND p.status='active' AND p.deleted_at IS NULL));
-- Restrictive DELETE policy prevents an unrelated broad permissive policy from
-- turning owner read permission into deletion. No customer replacement endpoint.
DROP POLICY IF EXISTS customer_documents_storage_no_delete ON storage.objects;
CREATE POLICY customer_documents_storage_no_delete ON storage.objects AS RESTRICTIVE
FOR DELETE TO anon,authenticated USING(bucket_id <> 'customer-documents');
COMMIT;
