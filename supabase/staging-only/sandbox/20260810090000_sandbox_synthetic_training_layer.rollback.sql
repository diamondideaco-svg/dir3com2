BEGIN;

DO $$
DECLARE
  has_journal boolean;
  has_entry boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sandbox_migration_journal'
  ) INTO has_journal;

  IF NOT has_journal THEN
    RAISE NOTICE 'sandbox_migration_journal not found, nothing to rollback safely.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.sandbox_migration_journal
    WHERE migration_key = '20260810090000_sandbox_synthetic_training_layer'
  ) INTO has_entry;

  IF NOT has_entry THEN
    RAISE NOTICE 'rollback skipped: migration ownership entry missing.';
    RETURN;
  END IF;

  -- Deliberately non-destructive: this compatibility layer is additive and
  -- may predate the journal entry. Data cleanup belongs to the separately
  -- ownership-gated purge command; schema/default changes are retained.
  RAISE NOTICE 'rollback is a no-op; use the ownership-gated purge command for synthetic test rows.';
END $$;

COMMIT;
