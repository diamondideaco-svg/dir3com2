-- DIR-118: durable revenue-launch request and handoff traceability.
ALTER TABLE public.marketplace_requests
  ADD COLUMN IF NOT EXISTS marketplace_family text,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS fulfilment_method text NOT NULL DEFAULT 'request_to_confirm',
  ADD COLUMN IF NOT EXISTS transaction_method text NOT NULL DEFAULT 'request_to_confirm',
  ADD COLUMN IF NOT EXISTS handoff_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS handoff_reference text,
  ADD COLUMN IF NOT EXISTS handoff_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action text;

UPDATE public.marketplace_requests
SET marketplace_family = COALESCE(marketplace_requests.marketplace_family, products.marketplace_family),
    supplier_name = COALESCE(marketplace_requests.supplier_name, products.supplier_name),
    service_name = COALESCE(marketplace_requests.service_name, products.name_ar, products.name_en),
    fulfilment_method = marketplace_requests.request_type,
    transaction_method = COALESCE(products.transaction_method, marketplace_requests.request_type),
    next_action = COALESCE(marketplace_requests.next_action, 'operations_review')
FROM public.products
WHERE products.id = marketplace_requests.product_id
  AND marketplace_requests.handoff_type = 'none'
  AND marketplace_requests.request_type IN ('request_to_confirm', 'request_quote');

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS marketplace_requests_family_check;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT marketplace_requests_family_check
  CHECK (marketplace_family IS NULL OR marketplace_family IN ('drive', 'stay', 'fly', 'concierge', 'vip'));

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS marketplace_requests_fulfilment_method_check;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT marketplace_requests_fulfilment_method_check
  CHECK (fulfilment_method IN ('instant_booking', 'request_to_confirm', 'request_quote', 'provider_checkout', 'whatsapp_handoff'));

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS marketplace_requests_transaction_method_check;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT marketplace_requests_transaction_method_check
  CHECK (transaction_method IN ('instant_booking', 'request_to_confirm', 'request_quote', 'provider_checkout', 'whatsapp_handoff'));

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS marketplace_requests_handoff_type_check;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT marketplace_requests_handoff_type_check
  CHECK (handoff_type IN ('none', 'provider_checkout', 'whatsapp'));

ALTER TABLE public.marketplace_requests DROP CONSTRAINT IF EXISTS marketplace_requests_status_check;
ALTER TABLE public.marketplace_requests ADD CONSTRAINT marketplace_requests_status_check CHECK (status IN (
  'request_submitted', 'under_review', 'awaiting_supplier', 'awaiting_availability',
  'available_action_required', 'awaiting_customer_acceptance', 'awaiting_payment',
  'payment_verification', 'confirmed', 'declined', 'changed',
  'cancellation_requested', 'cancelled', 'refund_pending', 'refunded', 'completed'
));

CREATE INDEX IF NOT EXISTS idx_marketplace_requests_operations
  ON public.marketplace_requests (status, marketplace_family, created_at DESC);

-- Customer reads remain owner-scoped; all lifecycle mutations remain service-role only.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.marketplace_requests FROM anon, authenticated;
