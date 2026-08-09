BEGIN;

-- Canonical sandbox markers across inventory and bookings.
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS taxes_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addons_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_guests integer,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE IF EXISTS public.products
  DROP CONSTRAINT IF EXISTS products_environment_check;
ALTER TABLE IF EXISTS public.products
  ADD CONSTRAINT products_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

CREATE INDEX IF NOT EXISTS idx_products_sandbox_flags
  ON public.products (synthetic, environment);
CREATE INDEX IF NOT EXISTS idx_products_reference_code
  ON public.products (reference_code);

ALTER TABLE IF EXISTS public.product_categories
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.product_categories
  DROP CONSTRAINT IF EXISTS product_categories_environment_check;
ALTER TABLE IF EXISTS public.product_categories
  ADD CONSTRAINT product_categories_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.product_images
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.product_images
  DROP CONSTRAINT IF EXISTS product_images_environment_check;
ALTER TABLE IF EXISTS public.product_images
  ADD CONSTRAINT product_images_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

CREATE INDEX IF NOT EXISTS idx_product_images_product_primary
  ON public.product_images (product_id, is_primary DESC, sort_order ASC);

ALTER TABLE IF EXISTS public.product_prices
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS is_weekend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_seasonal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addons_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.product_prices
  DROP CONSTRAINT IF EXISTS product_prices_environment_check;
ALTER TABLE IF EXISTS public.product_prices
  ADD CONSTRAINT product_prices_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

CREATE INDEX IF NOT EXISTS idx_product_prices_date_window
  ON public.product_prices (product_id, valid_from, valid_to);

ALTER TABLE IF EXISTS public.product_features
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.product_features
  DROP CONSTRAINT IF EXISTS product_features_environment_check;
ALTER TABLE IF EXISTS public.product_features
  ADD CONSTRAINT product_features_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.product_availability
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS availability_status text,
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booked_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS weekend_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS seasonal_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addons_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.product_availability
  ALTER COLUMN date SET DEFAULT CURRENT_DATE;
ALTER TABLE IF EXISTS public.product_availability
  ALTER COLUMN availability_status SET DEFAULT 'available';
ALTER TABLE IF EXISTS public.product_availability
  ALTER COLUMN currency SET DEFAULT 'EGP';

ALTER TABLE IF EXISTS public.product_availability
  DROP CONSTRAINT IF EXISTS product_availability_status_check;
ALTER TABLE IF EXISTS public.product_availability
  ADD CONSTRAINT product_availability_status_check
  CHECK (availability_status IS NULL OR availability_status IN ('available', 'partially_booked', 'full', 'maintenance', 'blackout'));

ALTER TABLE IF EXISTS public.product_availability
  DROP CONSTRAINT IF EXISTS product_availability_environment_check;
ALTER TABLE IF EXISTS public.product_availability
  ADD CONSTRAINT product_availability_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_availability_daily_sandbox
  ON public.product_availability (product_id, date, COALESCE(environment, ''), synthetic, COALESCE(reference_code, ''));

CREATE INDEX IF NOT EXISTS idx_product_availability_lookup
  ON public.product_availability (product_id, date, availability_status);

ALTER TABLE IF EXISTS public.bookings
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS arrival_date date,
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS guests integer,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS total_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS special_requests text,
  ADD COLUMN IF NOT EXISTS client_passport text,
  ADD COLUMN IF NOT EXISTS client_nationality text,
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS scenario_code text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_of_booking_id uuid,
  ADD COLUMN IF NOT EXISTS rescheduled_from_booking_id uuid,
  ADD COLUMN IF NOT EXISTS escalated_to_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

ALTER TABLE IF EXISTS public.bookings
  ALTER COLUMN currency SET DEFAULT 'EGP';

ALTER TABLE IF EXISTS public.bookings
  DROP CONSTRAINT IF EXISTS bookings_environment_check;
ALTER TABLE IF EXISTS public.bookings
  ADD CONSTRAINT bookings_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE IF EXISTS public.bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'failed', 'refunded', 'voided'));

CREATE INDEX IF NOT EXISTS idx_bookings_sandbox_flags
  ON public.bookings (synthetic, environment, reference_code);
CREATE INDEX IF NOT EXISTS idx_bookings_product_dates
  ON public.bookings (product_id, arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_bookings_duplicate_chain
  ON public.bookings (duplicate_of_booking_id, rescheduled_from_booking_id);

ALTER TABLE IF EXISTS public.partners
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.partners
  DROP CONSTRAINT IF EXISTS partners_environment_check;
ALTER TABLE IF EXISTS public.partners
  ADD CONSTRAINT partners_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.partner_services
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.partner_services
  DROP CONSTRAINT IF EXISTS partner_services_environment_check;
ALTER TABLE IF EXISTS public.partner_services
  ADD CONSTRAINT partner_services_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.partner_coverage
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.partner_coverage
  DROP CONSTRAINT IF EXISTS partner_coverage_environment_check;
ALTER TABLE IF EXISTS public.partner_coverage
  ADD CONSTRAINT partner_coverage_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.payment_transactions
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.booking_status_history
  ADD COLUMN IF NOT EXISTS synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS reference_code text;

ALTER TABLE IF EXISTS public.booking_status_history
  DROP CONSTRAINT IF EXISTS booking_status_history_environment_check;
ALTER TABLE IF EXISTS public.booking_status_history
  ADD CONSTRAINT booking_status_history_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

ALTER TABLE IF EXISTS public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_environment_check;
ALTER TABLE IF EXISTS public.payment_transactions
  ADD CONSTRAINT payment_transactions_environment_check
  CHECK (environment IS NULL OR environment IN ('local', 'staging'));

COMMIT;
