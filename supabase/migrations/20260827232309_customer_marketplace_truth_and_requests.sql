-- Customer Marketplace Foundation: additive, fail-closed inventory truth and request lifecycle.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS marketplace_family text,
  ADD COLUMN IF NOT EXISTS fulfilment_state text NOT NULL DEFAULT 'catalog_only',
  ADD COLUMN IF NOT EXISTS transaction_method text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS marketplace_environment text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS supply_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_summary text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_marketplace_family_check;
ALTER TABLE public.products ADD CONSTRAINT products_marketplace_family_check
  CHECK (marketplace_family IS NULL OR marketplace_family IN ('drive', 'stay', 'fly', 'concierge', 'vip'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_fulfilment_state_check;
ALTER TABLE public.products ADD CONSTRAINT products_fulfilment_state_check
  CHECK (fulfilment_state IN ('catalog_only', 'verified_requestable', 'verified_quote', 'live_bookable', 'unavailable', 'availability_unknown', 'test_sandbox'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_transaction_method_check;
ALTER TABLE public.products ADD CONSTRAINT products_transaction_method_check
  CHECK (transaction_method IN ('none', 'instant_booking', 'request_to_confirm', 'request_quote'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_marketplace_environment_check;
ALTER TABLE public.products ADD CONSTRAINT products_marketplace_environment_check
  CHECK (marketplace_environment IN ('production', 'sandbox', 'test', 'synthetic', 'fallback'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_supply_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_supply_type_check
  CHECK (supply_type IN ('verified_local_partner', 'global_travel_partner', 'dir3com_managed', 'unknown'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_truth_consistency_check;
ALTER TABLE public.products ADD CONSTRAINT products_truth_consistency_check CHECK (
  (fulfilment_state = 'live_bookable' AND transaction_method = 'instant_booking' AND marketplace_environment = 'production') OR
  (fulfilment_state = 'verified_requestable' AND transaction_method = 'request_to_confirm' AND marketplace_environment = 'production') OR
  (fulfilment_state = 'verified_quote' AND transaction_method = 'request_quote' AND marketplace_environment = 'production') OR
  (fulfilment_state NOT IN ('live_bookable', 'verified_requestable', 'verified_quote') AND transaction_method = 'none')
);

CREATE INDEX IF NOT EXISTS idx_products_marketplace_truth
  ON public.products (marketplace_environment, fulfilment_state, marketplace_family)
  WHERE synthetic = false;

CREATE TABLE IF NOT EXISTS public.marketplace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  request_type text NOT NULL CHECK (request_type IN ('request_to_confirm', 'request_quote')),
  status text NOT NULL DEFAULT 'request_submitted' CHECK (status IN (
    'request_submitted', 'awaiting_availability', 'available_action_required',
    'awaiting_customer_acceptance', 'awaiting_payment', 'payment_verification',
    'confirmed', 'changed', 'cancellation_requested', 'cancelled',
    'refund_pending', 'refunded', 'completed'
  )),
  requested_for timestamptz,
  traveller_count integer NOT NULL DEFAULT 1 CHECK (traveller_count BETWEEN 1 AND 99),
  customer_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  quote_amount numeric(12,2),
  quote_currency text,
  quote_expires_at timestamptz,
  payment_status text NOT NULL DEFAULT 'awaiting_payment' CHECK (payment_status IN (
    'awaiting_payment', 'bank_transfer_instructed', 'transfer_submitted',
    'verification_in_progress', 'payment_verified', 'payment_failed', 'payment_rejected'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_requests_owner_created
  ON public.marketplace_requests (user_id, created_at DESC);

ALTER TABLE public.marketplace_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_requests TO authenticated;
GRANT ALL ON TABLE public.marketplace_requests TO service_role;

DROP POLICY IF EXISTS marketplace_requests_owner_read ON public.marketplace_requests;
CREATE POLICY marketplace_requests_owner_read ON public.marketplace_requests
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS marketplace_requests_owner_create ON public.marketplace_requests;

-- Creation, lifecycle, quote, payment and cancellation mutations remain server-authoritative.
