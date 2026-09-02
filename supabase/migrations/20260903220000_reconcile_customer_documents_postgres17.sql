BEGIN;

-- Reconcile environments where the historical customer-management migration
-- did not materialize the canonical customer_documents relation used by the
-- Admin customer detail and document upload paths. This is additive only.
DO $$
DECLARE
  column_contract RECORD;
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'customer documents reconciliation refused: public.customers is missing';
  END IF;

  SELECT data_type, is_nullable
  INTO column_contract
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'customers'
    AND column_name = 'id';

  IF NOT FOUND
    OR column_contract.data_type <> 'uuid'
    OR column_contract.is_nullable <> 'NO'
  THEN
    RAISE EXCEPTION 'customer documents reconciliation refused: customers.id has incompatible shape';
  END IF;

  IF to_regclass('public.customer_documents') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (VALUES
        ('id', 'uuid', 'NO'),
        ('customer_id', 'uuid', 'NO'),
        ('document_type', 'text', 'NO'),
        ('file_url', 'text', 'YES'),
        ('uploaded_at', 'timestamp with time zone', 'NO')
      ) AS expected(column_name, data_type, is_nullable)
      LEFT JOIN information_schema.columns actual
        ON actual.table_schema = 'public'
       AND actual.table_name = 'customer_documents'
       AND actual.column_name = expected.column_name
      WHERE actual.column_name IS NULL
         OR actual.data_type <> expected.data_type
         OR actual.is_nullable <> expected.is_nullable
    ) THEN
      RAISE EXCEPTION 'customer documents reconciliation refused: public.customer_documents has incompatible shape';
    END IF;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.customer_documents'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.customer_documents
      ADD CONSTRAINT customer_documents_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint primary_key
    JOIN pg_attribute primary_column
      ON primary_column.attrelid = primary_key.conrelid
     AND primary_column.attnum = ANY (primary_key.conkey)
    WHERE primary_key.conrelid = 'public.customer_documents'::regclass
      AND primary_key.contype = 'p'
      AND primary_column.attname = 'id'
      AND cardinality(primary_key.conkey) = 1
  ) THEN
    RAISE EXCEPTION 'customer documents reconciliation refused: customer_documents primary key is incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_attribute local_column
      ON local_column.attrelid = constraint_record.conrelid
     AND local_column.attnum = ANY (constraint_record.conkey)
    JOIN pg_attribute referenced_column
      ON referenced_column.attrelid = constraint_record.confrelid
     AND referenced_column.attnum = ANY (constraint_record.confkey)
    WHERE constraint_record.contype = 'f'
      AND constraint_record.conrelid = 'public.customer_documents'::regclass
      AND constraint_record.confrelid = 'public.customers'::regclass
      AND local_column.attname = 'customer_id'
      AND referenced_column.attname = 'id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.customer_documents document
      LEFT JOIN public.customers customer ON customer.id = document.customer_id
      WHERE customer.id IS NULL
    ) THEN
      RAISE EXCEPTION 'customer documents reconciliation refused: orphan customer_documents rows exist';
    END IF;

    ALTER TABLE public.customer_documents
      ADD CONSTRAINT customer_documents_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.customers(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_uploaded_at
  ON public.customer_documents (customer_id, uploaded_at DESC);

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_documents'
      AND policyname NOT IN (
        'admin_full_access',
        'service_role_full_access',
        'customer_documents_admin_all',
        'customer_documents_service_role_all'
      )
  ) THEN
    RAISE EXCEPTION 'customer documents reconciliation refused: unexpected existing RLS policy';
  END IF;
END
$$;

DROP POLICY IF EXISTS admin_full_access ON public.customer_documents;
DROP POLICY IF EXISTS service_role_full_access ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_admin_all ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_service_role_all ON public.customer_documents;

CREATE POLICY customer_documents_admin_all
  ON public.customer_documents
  FOR ALL
  TO authenticated
  USING (public.is_admin_actor())
  WITH CHECK (public.is_admin_actor());

CREATE POLICY customer_documents_service_role_all
  ON public.customer_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.customer_documents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_documents TO service_role;

COMMIT;
