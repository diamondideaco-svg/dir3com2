BEGIN;

-- Remove sandbox-only marker columns and indexes from staging if rollback is required.
DROP INDEX IF EXISTS public.idx_products_sandbox_flags;
DROP INDEX IF EXISTS public.idx_products_reference_code;
DROP INDEX IF EXISTS public.idx_product_images_product_primary;
DROP INDEX IF EXISTS public.idx_product_prices_date_window;
DROP INDEX IF EXISTS public.ux_product_availability_daily_sandbox;
DROP INDEX IF EXISTS public.idx_product_availability_lookup;
DROP INDEX IF EXISTS public.idx_bookings_sandbox_flags;
DROP INDEX IF EXISTS public.idx_bookings_product_dates;
DROP INDEX IF EXISTS public.idx_bookings_duplicate_chain;

ALTER TABLE IF EXISTS public.payment_transactions
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.booking_status_history
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.partner_coverage
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.partner_services
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.partners
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS city;

ALTER TABLE IF EXISTS public.bookings
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code,
  DROP COLUMN IF EXISTS scenario_code,
  DROP COLUMN IF EXISTS source_channel,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS duplicate_of_booking_id,
  DROP COLUMN IF EXISTS rescheduled_from_booking_id,
  DROP COLUMN IF EXISTS escalated_to_staff,
  DROP COLUMN IF EXISTS escalation_reason;

ALTER TABLE IF EXISTS public.product_availability
  DROP COLUMN IF EXISTS date,
  DROP COLUMN IF EXISTS availability_status,
  DROP COLUMN IF EXISTS capacity,
  DROP COLUMN IF EXISTS booked_count,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS weekend_price,
  DROP COLUMN IF EXISTS seasonal_price,
  DROP COLUMN IF EXISTS discount_percent,
  DROP COLUMN IF EXISTS taxes_percent,
  DROP COLUMN IF EXISTS insurance_amount,
  DROP COLUMN IF EXISTS deposit_amount,
  DROP COLUMN IF EXISTS addons_amount,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.product_features
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.product_prices
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code,
  DROP COLUMN IF EXISTS is_weekend,
  DROP COLUMN IF EXISTS is_seasonal,
  DROP COLUMN IF EXISTS discount_percent,
  DROP COLUMN IF EXISTS taxes_percent,
  DROP COLUMN IF EXISTS insurance_amount,
  DROP COLUMN IF EXISTS deposit_amount,
  DROP COLUMN IF EXISTS addons_amount;

ALTER TABLE IF EXISTS public.product_images
  DROP COLUMN IF EXISTS is_primary,
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.product_categories
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code;

ALTER TABLE IF EXISTS public.products
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS environment,
  DROP COLUMN IF EXISTS reference_code,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS taxes_percent,
  DROP COLUMN IF EXISTS insurance_amount,
  DROP COLUMN IF EXISTS deposit_amount,
  DROP COLUMN IF EXISTS addons_amount,
  DROP COLUMN IF EXISTS max_guests,
  DROP COLUMN IF EXISTS deleted_at;

COMMIT;
