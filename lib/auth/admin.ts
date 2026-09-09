import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { isAdminRole, resolveCanonicalUserRole } from '@/lib/auth/identity';
import { getTeamAccessGrant, hasPermission, isCeoActor, type TeamAccessGrant, type TeamPermission } from '@/lib/auth/team-access';

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

// Constrain privileged reads in the database, before rows leave it. Values are
// passed through PostgREST's parameterized IN filter, never interpolated SQL/OR.
export function scopeCountryQuery<Query>(query: Query, scope: AdminScope): Query {
  if (scope.mode === 'global') return query;
  const keys = new Set(scope.countries.map(normalizeCountryKey));
  const aliases = [...scope.countries, ...Object.keys(COUNTRY_ALIASES).filter(key => keys.has(COUNTRY_ALIASES[key]))];
  const values = [...new Set(aliases.flatMap(value => [value.trim(), value.trim().toLowerCase(),
    value.trim().toUpperCase(), value.trim().toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase())]))];
  if (!values.length) throw new Error('COUNTRY_SCOPE_FORBIDDEN');
  return (query as Query & { in(column: string, values: string[]): Query }).in('country', values);
}

async function resolveAdministrativeAccess(permission?: TeamPermission) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { supabase, user: null, role: null, scope: null };

  return resolveVerifiedOperationalAccess(supabase, user, permission);
}

// The caller must supply auth.getUser()-verified identity, never client claims.
// API handlers and page/action guards share this fresh authoritative decision.
export async function resolveVerifiedOperationalAccess(supabase: SupabaseClient, user: User, permission?: TeamPermission) {
  const role = await resolveCanonicalUserRole(supabase, user.id);
  if (!role) return { supabase, user, role: null, scope: null };

  // Only the pinned, active CEO may operate without a grant. Never cache this
  // decision across requests: revocation and country edits take effect at once.
  if (await isCeoActor(supabase, user)) {
    const scope: AdminScope = { mode: 'global', countries: [], grant: null };
    return { supabase, user, role, scope };
  }

  if (!isAdminRole(role) && role !== 'staff') return { supabase, user, role, scope: null };

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
  return { supabase: context.supabase, user: context.user, role: context.role, scope: context.scope };
}

export async function requireAdminPageAccess(destination = '/admin') {
  const context = await resolveAdministrativeAccess();
  if (!context.user) redirect(buildLoginTarget(destination));
  if (!context.role || context.scope?.mode !== 'global') notFound();
  return { user: context.user, role: context.role };
}

export async function requireAdminActionAccess() {
  const context = await resolveAdministrativeAccess();
  if (!context.user) throw new Error('Unauthorized');
  if (!context.role || context.scope?.mode !== 'global') throw new Error('Forbidden');
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
