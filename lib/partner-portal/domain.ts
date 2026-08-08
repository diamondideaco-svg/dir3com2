import { supabaseAdmin } from '@/lib/supabase/server';

export type CanonicalAuthRole = 'customer' | 'partner' | 'staff' | 'admin';
export type PartnerDomainType = 'partner' | 'service_provider' | 'supplier';

const AUTH_ROLE_ALIASES: Record<string, CanonicalAuthRole> = {
  customer: 'customer',
  client: 'customer',
  partner: 'partner',
  provider: 'partner',
  supplier: 'partner',
  staff: 'staff',
  admin: 'admin',
  super_admin: 'admin',
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeAuthRole(role: unknown): CanonicalAuthRole {
  return AUTH_ROLE_ALIASES[normalizeText(role)] ?? 'customer';
}

export function classifyPartnerDomainFromServiceTypes(serviceTypes: string[]): PartnerDomainType {
  const normalized = serviceTypes
    .map((entry) => normalizeText(entry))
    .filter(Boolean);

  if (normalized.length === 0) {
    return 'partner';
  }

  const hasDrive = normalized.includes('dir3 drive');
  const hasStay = normalized.includes('dir3 stay');
  const hasNonDrive = normalized.some((entry) => entry !== 'dir3 drive');

  if (hasDrive && !hasNonDrive) {
    return 'partner';
  }

  if (normalized.includes('dir3 vip')) {
    return 'supplier';
  }

  if (hasStay && !hasDrive) {
    return 'supplier';
  }

  return 'service_provider';
}

export async function resolvePartnerDomainType(partnerId: string): Promise<PartnerDomainType> {
  if (!supabaseAdmin) {
    return 'partner';
  }

  const { data } = await supabaseAdmin
    .from('partner_services')
    .select('service_type')
    .eq('partner_id', partnerId);

  const serviceTypes = Array.isArray(data) ? data.map((row) => String(row.service_type || '')) : [];
  return classifyPartnerDomainFromServiceTypes(serviceTypes);
}