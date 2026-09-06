BEGIN;
CREATE TABLE IF NOT EXISTS public.vip_partner_configs (
  partner_id text PRIMARY KEY,
  config jsonb NOT NULL,
  source text NOT NULL CHECK (source = 'synthetic_test_placeholder'),
  verification_status text NOT NULL CHECK (verification_status = 'UNVERIFIED'),
  environment text NOT NULL CHECK (environment = 'local_test'),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (config->>'status' IN ('ACTIVE_TEST_ONLY', 'INACTIVE')),
  CHECK (config->>'country' = 'EG')
);
CREATE TABLE IF NOT EXISTS public.vip_partner_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id text NOT NULL,
  event text NOT NULL, entity_id text NOT NULL, source text NOT NULL CHECK (source = 'synthetic_test_placeholder'),
  environment text NOT NULL CHECK (environment = 'local_test'), actor_id uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vip_partner_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_partner_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages isolated VIP test config" ON public.vip_partner_configs FOR ALL USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
CREATE POLICY "Admin reads isolated VIP test audit" ON public.vip_partner_audit FOR SELECT USING (public.is_admin_actor());
CREATE POLICY "Admin appends isolated VIP test audit" ON public.vip_partner_audit FOR INSERT WITH CHECK (public.is_admin_actor());
COMMIT;
