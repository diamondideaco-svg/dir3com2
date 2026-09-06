BEGIN;

-- Reconcile environments where the canonical assignment-engine migration was
-- recorded without these tables being present. They are active dependencies
-- of the Admin assignment routes and the shared assignment engine.
CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  priority_weight INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  partner_id UUID,
  score NUMERIC(5, 2),
  decision_reason TEXT,
  assigned_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_rules_enabled
  ON public.assignment_rules (enabled);
CREATE INDEX IF NOT EXISTS idx_assignment_logs_booking_id
  ON public.assignment_logs (booking_id);

ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON public.assignment_rules;
CREATE POLICY admin_full_access ON public.assignment_rules
  FOR ALL TO authenticated
  USING (public.is_admin_actor())
  WITH CHECK (public.is_admin_actor());

DROP POLICY IF EXISTS service_role_full_access ON public.assignment_rules;
CREATE POLICY service_role_full_access ON public.assignment_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_full_access ON public.assignment_logs;
CREATE POLICY admin_full_access ON public.assignment_logs
  FOR ALL TO authenticated
  USING (public.is_admin_actor())
  WITH CHECK (public.is_admin_actor());

DROP POLICY IF EXISTS service_role_full_access ON public.assignment_logs;
CREATE POLICY service_role_full_access ON public.assignment_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.assignment_rules, public.assignment_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assignment_rules, public.assignment_logs TO authenticated;
GRANT ALL ON TABLE public.assignment_rules, public.assignment_logs TO service_role;

COMMIT;
