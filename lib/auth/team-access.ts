import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

export const CEO_EMAIL = 'diamondidea.co@gmail.com';
// Pinned auth.users.id verified read-only against the canonical project.
// Email is contact/display data, never an authorization identifier.
export const CEO_USER_ID = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16';

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

const TEAM_ACCESS_SELECT = 'id, email, job_title, access_level, country_scope, permissions, status, invited_user_id';

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isCeoUserId(value: unknown) {
  return value === CEO_USER_ID;
}

// Call only with the user returned by the server's verified auth.getUser().
export async function isCeoActor(supabase: SupabaseClient, user: Pick<User, 'id'>) {
  if (!isCeoUserId(user.id)) return false;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', user.id)
    .maybeSingle();
  return !error && profile?.id === user.id && profile.role === 'admin' && profile.status === 'active';
}

export async function getTeamAccessGrant(supabase: SupabaseClient, user: User): Promise<TeamAccessGrant | null> {
  const { data: byUserId, error: byUserIdError } = await supabase
    .from('team_access_grants')
    .select(TEAM_ACCESS_SELECT)
    .eq('invited_user_id', user.id)
    .maybeSingle();

  // Invitations are attached by the CEO action to the Auth-returned user ID.
  // Missing/ambiguous/error results cannot fall back to another identity's email.
  if (byUserIdError || !byUserId || byUserId.invited_user_id !== user.id) return null;
  return byUserId as TeamAccessGrant;
}

export function hasPermission(grant: TeamAccessGrant | null, permission: TeamPermission) {
  if (!grant || grant.status !== 'active') return false;
  return grant.access_level === 'global_admin' || grant.permissions.includes('admin:full') || grant.permissions.includes(permission);
}
