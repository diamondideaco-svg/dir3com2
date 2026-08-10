-- Read-only infrastructure checks before allowing code deployment.
-- Run against target database after applying core migration.

-- 1) Table sizes for lock/backfill planning.
SELECT relname AS table_name, n_live_tup AS estimated_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('products', 'product_categories', 'product_images', 'product_features')
ORDER BY relname;

-- 2) Column shape and default state.
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'synthetic'
  AND c.table_name IN ('products', 'product_categories', 'product_images', 'product_features')
ORDER BY c.table_name;

-- 3) Null count verification after backfill.
SELECT 'products' AS table_name, COUNT(*) FILTER (WHERE synthetic IS NULL) AS null_synthetic_rows FROM public.products
UNION ALL
SELECT 'product_categories', COUNT(*) FILTER (WHERE synthetic IS NULL) FROM public.product_categories
UNION ALL
SELECT 'product_images', COUNT(*) FILTER (WHERE synthetic IS NULL) FROM public.product_images
UNION ALL
SELECT 'product_features', COUNT(*) FILTER (WHERE synthetic IS NULL) FROM public.product_features;

-- 4) Index readiness for public query paths.
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_products_public_status_synthetic',
    'idx_products_public_category_synthetic',
    'idx_product_categories_synthetic',
    'idx_product_images_product_synthetic',
    'idx_product_features_product_synthetic'
  )
ORDER BY indexname;
