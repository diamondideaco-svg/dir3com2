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

  -- Non-destructive rollback: clean synthetic rows only.
  DELETE FROM public.payment_transactions WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.booking_status_history WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.bookings WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.product_availability WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.product_features WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.product_prices WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.product_images WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.products WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.partner_coverage WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.partner_services WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.partners WHERE synthetic = true AND environment IN ('local', 'staging');
  DELETE FROM public.product_categories WHERE synthetic = true AND environment IN ('local', 'staging');

  -- Safety: restore canonical default for bookings.currency.
  ALTER TABLE IF EXISTS public.bookings
    ALTER COLUMN currency SET DEFAULT 'SAR';

  DELETE FROM public.sandbox_migration_journal
  WHERE migration_key = '20260810090000_sandbox_synthetic_training_layer';
END $$;

COMMIT;
