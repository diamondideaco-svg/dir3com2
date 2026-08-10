BEGIN;

-- Additive compatibility migration for public services synthetic isolation.
-- Must remain idempotent and safe for repeated execution.

ALTER TABLE IF EXISTS public.services
  ADD COLUMN IF NOT EXISTS synthetic boolean;
UPDATE public.services SET synthetic = false WHERE synthetic IS NULL;
ALTER TABLE IF EXISTS public.services
  ALTER COLUMN synthetic SET DEFAULT false,
  ALTER COLUMN synthetic SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_public_synthetic
  ON public.services (synthetic);

-- The booking page reads its selected product with the authenticated user's
-- token. Limit that read to the same public/bookable contract used by APIs.
DROP POLICY IF EXISTS "Authenticated read bookable products" ON public.products;
CREATE POLICY "Authenticated read bookable products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    synthetic = false
    AND status IN ('published', 'active', 'featured')
  );
COMMIT;
