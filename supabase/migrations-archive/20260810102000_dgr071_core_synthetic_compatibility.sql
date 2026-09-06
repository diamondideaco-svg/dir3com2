BEGIN;

-- Core compatibility migration for public API synthetic filters.
-- Additive/backward-compatible only; no synthetic data writes.

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS synthetic boolean;
UPDATE public.products SET synthetic = false WHERE synthetic IS NULL;
ALTER TABLE IF EXISTS public.products
  ALTER COLUMN synthetic SET DEFAULT false,
  ALTER COLUMN synthetic SET NOT NULL;

ALTER TABLE IF EXISTS public.product_categories
  ADD COLUMN IF NOT EXISTS synthetic boolean;
UPDATE public.product_categories SET synthetic = false WHERE synthetic IS NULL;
ALTER TABLE IF EXISTS public.product_categories
  ALTER COLUMN synthetic SET DEFAULT false,
  ALTER COLUMN synthetic SET NOT NULL;

ALTER TABLE IF EXISTS public.product_images
  ADD COLUMN IF NOT EXISTS synthetic boolean;
UPDATE public.product_images SET synthetic = false WHERE synthetic IS NULL;
ALTER TABLE IF EXISTS public.product_images
  ALTER COLUMN synthetic SET DEFAULT false,
  ALTER COLUMN synthetic SET NOT NULL;

ALTER TABLE IF EXISTS public.product_features
  ADD COLUMN IF NOT EXISTS synthetic boolean;
UPDATE public.product_features SET synthetic = false WHERE synthetic IS NULL;
ALTER TABLE IF EXISTS public.product_features
  ALTER COLUMN synthetic SET DEFAULT false,
  ALTER COLUMN synthetic SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_public_status_synthetic
  ON public.products (status, synthetic);
CREATE INDEX IF NOT EXISTS idx_products_public_category_synthetic
  ON public.products (category_id, synthetic);
CREATE INDEX IF NOT EXISTS idx_product_categories_synthetic
  ON public.product_categories (synthetic);
CREATE INDEX IF NOT EXISTS idx_product_images_product_synthetic
  ON public.product_images (product_id, synthetic);
CREATE INDEX IF NOT EXISTS idx_product_features_product_synthetic
  ON public.product_features (product_id, synthetic);

COMMIT;
