import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

export const CEO_EMAIL = 'diamondidea.co@gmail.com';

export const TEAM_PERMISSIONS = [
  'admin:full',
  'operations:read',
  'operations:write',
  'customers:read',
  'customers:write',
  'partners:read',
  'partners:write',
  'products:read',
  'products:write',
  'finance:read',
  'finance:write',
  'verification:read',
  'verification:write',
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export type TeamAccessGrant = {
  id: string;
  email: string;
  job_title: string;
  access_level: 'scoped_staff' | 'global_admin';
  country_scope: string[];
  permissions: string[];
  status: 'active' | 'inactive' | 'pending';
  invited_user_id?: string | null;
};

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isCeoEmail(value: unknown) {
  return normalizeEmail(value) === CEO_EMAIL;
}

export async function getTeamAccessGrant(supabase: SupabaseClient, user: User): Promise<TeamAccessGrant | null> {
  const email = normalizeEmail(user.email);
  if (!email) return null;

  const { data, error } = await supabase
    .from('team_access_grants')
    .select('id, email, job_title, access_level, country_scope, permissions, status, invited_user_id')
    .or(`invited_user_id.eq.${user.id},email.ilike.${email}`)
    .maybeSingle();

  if (error || !data) return null;
  return data as TeamAccessGrant;
}

export function hasPermission(grant: TeamAccessGrant | null, permission: TeamPermission) {
  if (!grant || grant.status !== 'active') return false;
  return grant.access_level === 'global_admin' || grant.permissions.includes('admin:full') || grant.permissions.includes(permission);
}
