BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.products
SET is_active = COALESCE(status = 'active', false);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS arrival_date date,
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS guests integer,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS special_requests text,
  ADD COLUMN IF NOT EXISTS client_passport text,
  ADD COLUMN IF NOT EXISTS client_nationality text,
  ADD COLUMN IF NOT EXISTS request_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_request_key_unique
  ON public.bookings (user_id, request_key)
  WHERE user_id IS NOT NULL AND request_key IS NOT NULL;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_valid_dates;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_valid_dates
  CHECK (arrival_date IS NULL OR departure_date IS NULL OR departure_date > arrival_date);

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_positive_prices;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_positive_prices
  CHECK ((product_price IS NULL OR product_price >= 0) AND (total_price IS NULL OR total_price >= 0));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users manage own bookings" ON public.bookings;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_read_own_bookings" ON public.bookings;
DROP POLICY IF EXISTS "admins_manage_bookings" ON public.bookings;
DROP POLICY IF EXISTS "public_read_products" ON public.products;
DROP POLICY IF EXISTS "public_read_active_products" ON public.products;

CREATE POLICY "users_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'customer' AND status = 'active');

REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, full_name, email, role, status) ON public.profiles TO authenticated;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, email, phone, avatar_url, updated_at) ON public.profiles TO authenticated;

CREATE POLICY "users_read_own_bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR profile_id = auth.uid());

CREATE POLICY "admins_manage_bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.is_admin_actor())
  WITH CHECK (public.is_admin_actor());

CREATE POLICY "public_read_active_products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND is_active = true);

COMMIT;
