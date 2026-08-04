BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  country TEXT,
  city TEXT,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  logo_url TEXT,
  description_ar TEXT,
  description_en TEXT,
  commercial_registration TEXT,
  tax_number TEXT,
  iban TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','suspended')),
  shield_level TEXT NOT NULL DEFAULT 'basic' CHECK (shield_level IN ('basic','silver','gold','platinum')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (service_type IN ('DIR3 Stay','DIR3 Drive','DIR3 Airport','DIR3 Concierge','DIR3 Experiences','DIR3 VIP')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_performance (
  partner_id UUID PRIMARY KEY REFERENCES partners(id) ON DELETE CASCADE,
  total_bookings INTEGER NOT NULL DEFAULT 0,
  completed_bookings INTEGER NOT NULL DEFAULT 0,
  cancelled_bookings INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  on_time_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  complaints INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);
CREATE INDEX IF NOT EXISTS idx_partners_company_name ON partners(company_name);
CREATE INDEX IF NOT EXISTS idx_partner_documents_partner_id ON partner_documents(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_services_partner_id ON partner_services(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_coverage_partner_id ON partner_coverage(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_performance_partner_id ON partner_performance(partner_id);

DROP TRIGGER IF EXISTS set_partners_updated_at ON partners;
CREATE TRIGGER set_partners_updated_at
BEFORE UPDATE ON partners
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read partners" ON partners;
CREATE POLICY "Public read partners" ON partners FOR SELECT USING (status IN ('active','pending') AND deleted_at IS NULL);
DROP POLICY IF EXISTS "Service role full access partners" ON partners;
CREATE POLICY "Service role full access partners" ON partners FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access partner_documents" ON partner_documents;
CREATE POLICY "Service role full access partner_documents" ON partner_documents FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access partner_services" ON partner_services;
CREATE POLICY "Service role full access partner_services" ON partner_services FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access partner_coverage" ON partner_coverage;
CREATE POLICY "Service role full access partner_coverage" ON partner_coverage FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access partner_performance" ON partner_performance;
CREATE POLICY "Service role full access partner_performance" ON partner_performance FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMIT;
