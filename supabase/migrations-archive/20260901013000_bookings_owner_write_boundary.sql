BEGIN;

-- Booking creation and lifecycle changes are server-owned. Customers may read
-- only their own records, but cannot rewrite status, payment, price, or
-- Production-classification fields through direct PostgREST calls.
DROP POLICY IF EXISTS "Users manage own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users read own bookings" ON public.bookings;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users read own bookings"
      ON public.bookings
      FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
    $policy$;
  ELSE
    EXECUTE $policy$
      CREATE POLICY "Users read own bookings"
      ON public.bookings
      FOR SELECT
      TO authenticated
      USING (profile_id = (SELECT auth.uid()))
    $policy$;
  END IF;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.bookings FROM authenticated;
GRANT SELECT ON TABLE public.bookings TO authenticated;

COMMIT;
