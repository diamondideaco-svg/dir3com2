BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id::text = auth.uid()::text
      AND lower(p.role) IN ('admin', 'staff')
  );
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'booking_status_history',
    'partner_assignments',
    'booking_reviews',
    'partner_settlements',
    'assignment_rules',
    'assignment_logs',
    'partner_availability',
    'product_categories',
    'products',
    'product_images',
    'product_prices',
    'product_features',
    'product_availability',
    'customers',
    'customer_documents',
    'customer_preferences',
    'customer_addresses',
    'customer_companions',
    'customer_notes',
    'customer_activity',
    'customer_wallet',
    'wallets',
    'wallet_transactions',
    'escrow_accounts',
    'payment_transactions',
    'refund_requests',
    'commission_rules',
    'invoices',
    'invoice_items',
    'payment_methods',
    'financial_audit_logs',
    'notification_templates',
    'notifications',
    'notification_logs',
    'audit_logs',
    'activity_timeline',
    'system_events',
    'verification_requests',
    'verification_documents',
    'verification_reviews',
    'verification_status_history',
    'identity_profiles',
    'company_profiles',
    'document_templates',
    'document_expiry_tracking'
  ]
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'booking_status_history',
    'partner_assignments',
    'booking_reviews',
    'partner_settlements',
    'assignment_rules',
    'assignment_logs',
    'partner_availability',
    'product_categories',
    'products',
    'product_images',
    'product_prices',
    'product_features',
    'product_availability',
    'customers',
    'customer_documents',
    'customer_preferences',
    'customer_addresses',
    'customer_companions',
    'customer_notes',
    'customer_activity',
    'customer_wallet',
    'wallets',
    'wallet_transactions',
    'escrow_accounts',
    'payment_transactions',
    'refund_requests',
    'commission_rules',
    'invoices',
    'invoice_items',
    'payment_methods',
    'financial_audit_logs',
    'notification_templates',
    'notifications',
    'notification_logs',
    'audit_logs',
    'activity_timeline',
    'system_events',
    'verification_requests',
    'verification_documents',
    'verification_reviews',
    'verification_status_history',
    'identity_profiles',
    'company_profiles',
    'document_templates',
    'document_expiry_tracking'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR ALL USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor())',
      'admin_full_access',
      table_name
    );

    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      'service_role_full_access',
      table_name
    );
  END LOOP;
END;
$$;

CREATE POLICY IF NOT EXISTS "customer_read_own_booking_status_history" ON public.booking_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_status_history.booking_id
        AND b.profile_id::text = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_partner_assignments" ON public.partner_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = partner_assignments.booking_id
        AND b.profile_id::text = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_partner_settlements" ON public.partner_settlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = partner_settlements.booking_id
        AND b.profile_id::text = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "customer_manage_own_booking_reviews" ON public.booking_reviews
  FOR ALL USING (
    customer_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_reviews.booking_id
        AND b.profile_id::text = auth.uid()::text
    )
  ) WITH CHECK (
    customer_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_reviews.booking_id
        AND b.profile_id::text = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "public_read_active_products" ON public.products
  FOR SELECT USING (lower(coalesce(status, '')) IN ('active', 'featured'));

CREATE POLICY IF NOT EXISTS "public_read_product_categories" ON public.product_categories
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "public_read_product_images" ON public.product_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_images.product_id
        AND lower(coalesce(p.status, '')) IN ('active', 'featured')
    )
  );

CREATE POLICY IF NOT EXISTS "public_read_product_prices" ON public.product_prices
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_prices.product_id
        AND lower(coalesce(p.status, '')) IN ('active', 'featured')
    )
  );

CREATE POLICY IF NOT EXISTS "public_read_product_features" ON public.product_features
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_features.product_id
        AND lower(coalesce(p.status, '')) IN ('active', 'featured')
    )
  );

CREATE POLICY IF NOT EXISTS "public_read_product_availability" ON public.product_availability
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_availability.product_id
        AND lower(coalesce(p.status, '')) IN ('active', 'featured')
    )
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_wallets" ON public.wallets
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_wallet_transactions" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.wallets w
      WHERE w.id = wallet_transactions.wallet_id
        AND w.owner_type = 'customer'
        AND w.owner_id::text = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_payment_transactions" ON public.payment_transactions
  FOR SELECT USING (
    customer_id::text = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_invoices" ON public.invoices
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_payment_methods" ON public.payment_methods
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_verification_requests" ON public.verification_requests
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_verification_documents" ON public.verification_documents
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "customer_read_own_identity_profiles" ON public.identity_profiles
  FOR SELECT USING (
    owner_type = 'customer'
    AND owner_id = auth.uid()::text
  );

COMMIT;
