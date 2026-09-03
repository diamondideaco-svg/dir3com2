import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TeamAccessGrant } from '@/lib/auth/team-access';
import { logServerEvent } from '@/lib/security/safe-logger';

export type TeamAccessState =
  | { status: 'ready'; grants: TeamAccessGrant[] }
  | { status: 'not_activated' | 'unavailable' };

function isGrant(value: unknown): value is TeamAccessGrant {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['id', 'email', 'job_title'].every(key => typeof row[key] === 'string')
    && ['scoped_staff', 'global_admin'].includes(String(row.access_level))
    && ['active', 'inactive', 'pending'].includes(String(row.status))
    && [row.country_scope, row.permissions].every(items => Array.isArray(items) && items.every(item => typeof item === 'string'))
    && (row.invited_user_id === null || typeof row.invited_user_id === 'string');
}

function failed(error: unknown, source: 'table' | 'function'): TeamAccessState {
  const raw = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code = typeof raw === 'string' && /^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(raw) ? raw : 'UNKNOWN';
  const missing = source === 'table' ? ['PGRST205', '42P01'] : ['PGRST202', '42883'];
  const status = missing.includes(code) ? 'not_activated' : 'unavailable';
  // Expected operational state, not an uncaught render failure. Never log raw
  // provider messages, query details, employee data or credentials.
  logServerEvent('admin.team.load_state', { source, code, status });
  return { status };
}

// Call only after the canonical authenticated CEO guard. schemaOnly is used by
// server actions to stop before invitations/profile writes on an inactive schema.
export async function loadTeamAccess(supabase: SupabaseClient, schemaOnly = false): Promise<TeamAccessState> {
  let source: 'table' | 'function' = 'table';
  try {
    let query = supabase.from('team_access_grants')
      .select('id, email, job_title, access_level, country_scope, permissions, status, invited_user_id, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (schemaOnly) query = query.limit(0);
    const { data, error } = await query;
    if (error) return failed(error, source);
    if (!Array.isArray(data)) return failed(null, source);
    if (!schemaOnly && !data.every(isGrant)) return failed(null, source);

    source = 'function';
    const activation = await supabase.rpc('is_ceo_actor', {}, { get: true });
    if (activation.error) return failed(activation.error, source);
    // A service client has no human Auth UUID and legitimately returns false.
    // This is an existence/contract probe, NEVER an authorization predicate.
    if (typeof activation.data !== 'boolean') return failed(null, source);
    return { status: 'ready', grants: data as TeamAccessGrant[] };
  } catch (error) {
    return failed(error, source);
  }
}
