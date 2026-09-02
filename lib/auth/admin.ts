import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { isAdminRole, resolveCanonicalUserRole } from '@/lib/auth/identity';
import { getTeamAccessGrant, hasPermission, type TeamAccessGrant, type TeamPermission } from '@/lib/auth/team-access';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export type AdminScope = {
  mode: 'global' | 'country';
  countries: string[];
  grant: TeamAccessGrant | null;
};

const COUNTRY_ALIASES: Record<string, string> = {
  eg: 'EG',
  egypt: 'EG',
  مصر: 'EG',
  qa: 'QA',
  qatar: 'QA',
  قطر: 'QA',
  sa: 'SA',
  ksa: 'SA',
  'saudi arabia': 'SA',
  السعودية: 'SA',
  sy: 'SY',
  syria: 'SY',
  سوريا: 'SY',
  lb: 'LB',
  lebanon: 'LB',
  لبنان: 'LB',
};

export function normalizeCountryKey(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return COUNTRY_ALIASES[normalized] || normalized.toUpperCase();
}

export function isCountryAllowed(scope: AdminScope, country: unknown) {
  if (scope.mode === 'global') return true;
  const key = normalizeCountryKey(country);
  if (!key) return false;
  return scope.countries.some((candidate) => normalizeCountryKey(candidate) === key);
}

export function assertCountryAllowed(scope: AdminScope, country: unknown) {
  if (!isCountryAllowed(scope, country)) {
    throw new Error('COUNTRY_SCOPE_FORBIDDEN');
  }
}

export function filterRowsByCountryScope<T extends object>(scope: AdminScope, rows: T[], field = 'country') {
  if (scope.mode === 'global') return rows;
  return rows.filter((row) => isCountryAllowed(scope, (row as Record<string, unknown>)[field]));
}

async function resolveAdministrativeAccess(permission?: TeamPermission) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, role: null, scope: null };

  const role = await resolveCanonicalUserRole(supabase, user.id);
  if (!role) return { supabase, user, role: null, scope: null };

  if (isAdminRole(role)) {
    const scope: AdminScope = { mode: 'global', countries: [], grant: null };
    return { supabase, user, role, scope };
  }

  if (role !== 'staff') return { supabase, user, role, scope: null };

  const grant = await getTeamAccessGrant(supabase, user);
  if (!grant || grant.status !== 'active') return { supabase, user, role, scope: null };
  if (permission && !hasPermission(grant, permission)) return { supabase, user, role, scope: null };

  const scope: AdminScope = grant.access_level === 'global_admin' || grant.permissions.includes('admin:full')
    ? { mode: 'global', countries: [], grant }
    : { mode: 'country', countries: grant.country_scope.filter(Boolean), grant };

  if (scope.mode === 'country' && scope.countries.length === 0) {
    return { supabase, user, role, scope: null };
  }

  return { supabase, user, role, scope };
}

export async function requireAdminShellAccess(destination = '/admin') {
  const context = await resolveAdministrativeAccess();
  if (!context.user) redirect(buildLoginTarget(destination));
  if (!context.role || !context.scope) notFound();
  return { user: context.user, role: context.role, scope: context.scope };
}

export async function requireAdminPageAccess(destination = '/admin') {
  const context = await resolveAdministrativeAccess();
  if (!context.user) redirect(buildLoginTarget(destination));
  if (!context.role || !isAdminRole(context.role)) notFound();
  return { user: context.user, role: context.role };
}

export async function requireAdminActionAccess() {
  const context = await resolveAdministrativeAccess();
  if (!context.user) throw new Error('Unauthorized');
  if (!context.role || !isAdminRole(context.role)) throw new Error('Forbidden');
  return { supabase: context.supabase, user: context.user, role: context.role };
}

export async function requireScopedAdminPageAccess(destination: string, permission: TeamPermission) {
  const context = await resolveAdministrativeAccess(permission);
  if (!context.user) redirect(buildLoginTarget(destination));
  if (!context.role || !context.scope) notFound();
  return { user: context.user, role: context.role, scope: context.scope };
}

export async function requireScopedAdminActionAccess(permission: TeamPermission) {
  const context = await resolveAdministrativeAccess(permission);
  if (!context.user) throw new Error('Unauthorized');
  if (!context.role || !context.scope) throw new Error('Forbidden');
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  return { supabase: supabaseAdmin, user: context.user, role: context.role, scope: context.scope };
}

export async function requireAdminPageDataAccess(destination = '/admin') {
  const { user, role } = await requireAdminPageAccess(destination);
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  return { supabase: supabaseAdmin, user, role };
}

export async function requireScopedAdminPageDataAccess(destination: string, permission: TeamPermission) {
  const { user, role, scope } = await requireScopedAdminPageAccess(destination, permission);
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  return { supabase: supabaseAdmin, user, role, scope };
}

export async function requireAdminReadAccess() {
  const { user, role } = await requireAdminActionAccess();
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  return { supabase: supabaseAdmin, user, role };
}

export async function requireScopedAdminReadAccess(permission: TeamPermission) {
  return requireScopedAdminActionAccess(permission);
}
