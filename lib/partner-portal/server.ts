import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { normalizeAuthRole, resolvePartnerDomainType, type CanonicalAuthRole, type PartnerDomainType } from '@/lib/partner-portal/domain';

export type PortalActor = {
  userId: string;
  email: string;
  authRole: CanonicalAuthRole;
  partnerDomainType: PartnerDomainType | null;
  fullName: string;
};

const PORTAL_ALLOWED_AUTH_ROLES = new Set<CanonicalAuthRole>(['partner', 'admin', 'staff']);

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toSafeSlug(seed: string) {
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);

  return normalized || `partner-${crypto.randomUUID().slice(0, 8)}`;
}

export async function requirePortalActor(): Promise<PortalActor | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const adminClient = supabaseAdmin ?? supabase;
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, full_name, status, deleted_at')
    .eq('id', user.id)
    .maybeSingle();

  // Authorization roles must come from the server-controlled canonical profile.
  // Auth user_metadata is user-editable and must never grant portal access.
  const authRole = normalizeAuthRole(profile?.role);
  if (!PORTAL_ALLOWED_AUTH_ROLES.has(authRole)) {
    return null;
  }

  if (normalizeText(profile?.status).toLowerCase() === 'banned' || profile?.deleted_at) {
    return null;
  }

  const partnerDomainType = authRole === 'partner' ? await resolvePartnerDomainType(user.id) : null;

  return {
    userId: user.id,
    email: normalizeText(user.email),
    authRole,
    partnerDomainType,
    fullName: normalizeText(profile?.full_name) || normalizeText((user.user_metadata as Record<string, unknown> | null)?.full_name) || normalizeText(user.email).split('@')[0] || 'Partner Account',
  };
}

export async function ensurePartnerRecord(actor: PortalActor) {
  const adminClient = supabaseAdmin;
  if (!adminClient) {
    throw new Error('PARTNER_PORTAL_ADMIN_UNAVAILABLE');
  }

  const { data: existing } = await adminClient
    .from('partners')
    .select('id, company_name, email, status, shield_level')
    .eq('id', actor.userId)
    .maybeSingle();

  if (existing?.id) {
    return existing;
  }

  const fallbackName = actor.fullName || 'Partner Account';
  const slug = toSafeSlug(`${fallbackName}-${actor.userId.slice(0, 8)}`);

  const payload = {
    id: actor.userId,
    name: fallbackName,
    company_name: fallbackName,
    contact_person: fallbackName,
    slug,
    email: actor.email || `${actor.userId.slice(0, 8)}@partner.local`,
    status: 'pending',
    shield_level: 'basic',
  };

  const { data, error } = await adminClient
    .from('partners')
    .upsert(payload, { onConflict: 'id' })
    .select('id, company_name, email, status, shield_level')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
