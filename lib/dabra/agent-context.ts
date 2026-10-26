import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';
import { resolveCanonicalActiveProfile } from '@/lib/auth/identity';
import { isCeoActor } from '@/lib/auth/team-access';
import { isCountryAllowed, resolveVerifiedOperationalAccess } from '@/lib/auth/admin';
import { getCustomerMarketplaceRequest, listCustomerMarketplaceRequests } from '@/lib/marketplace/customer-requests';
import { safeAgentRequest, type AgentContext, type AgentReadResult, type AgentRole, type AgentTaskAuthority } from './agent-contract';

export const anonymousAgentContext: AgentContext = { role: 'guest', taskAuthority: { kind: 'guest' }, taskAuthorityFailure: 'authentication_required', readRequests: async () => ({ kind: 'authentication_required' }) };
export const unavailableAgentContext: AgentContext = { role: 'guest', taskAuthority: { kind: 'guest' }, taskAuthorityFailure: 'unavailable', readRequests: async () => ({ kind: 'unavailable' }) };
const LIMIT = 20;

export async function resolveAgentContext(request: NextRequest): Promise<AgentContext> {
  try {
    const auth = await createSupabaseRequestClient(request);
    if (!auth) return anonymousAgentContext;
    const profile = await resolveCanonicalActiveProfile(auth.supabase, auth.user.id);
    if (!profile) return { role: 'guest', taskAuthority: { kind: 'guest' }, taskAuthorityFailure: 'forbidden', readRequests: async () => ({ kind: 'forbidden' }) };
    const executive = await isCeoActor(auth.supabase, auth.user);
    const operational = profile.role === 'admin' || profile.role === 'staff'
      ? await resolveVerifiedOperationalAccess(auth.supabase, auth.user, 'operations:read') : null;
    const role: AgentRole = executive ? 'ceo' : profile.role;
    const operationsCountry = operational?.scope && isCountryAllowed(operational.scope, 'EG') ? 'EG' : null;
    let taskAuthority: AgentTaskAuthority = { kind: 'guest' };
    if (role === 'staff' || role === 'admin' || role === 'ceo') taskAuthority = { kind: 'operator', actorId: auth.user.id, role, country: operationsCountry };
    else if (role === 'customer') taskAuthority = { kind: 'customer', actorId: auth.user.id, ownerId: auth.user.id };
    else if (role === 'partner') taskAuthority = { kind: 'partner', actorId: auth.user.id };
    return {
      role,
      taskAuthority,
      async isTaskAuthorityCurrent() {
        try {
          const current = await resolveCanonicalActiveProfile(auth.supabase, auth.user.id);
          if (!current || current.role !== profile.role) return false;
          if ((await isCeoActor(auth.supabase, auth.user)) !== executive) return false;
          if (operationsCountry === 'EG') {
            const access = await resolveVerifiedOperationalAccess(auth.supabase, auth.user, 'operations:read');
            if (!access?.scope || !isCountryAllowed(access.scope, 'EG')) return false;
          }
          return true;
        } catch { return false; }
      },
      async readRequests(reference, asOperations): Promise<AgentReadResult> {
        try {
          let rows: unknown[];
          if (asOperations) {
            // Same canonical grant and Egypt RLS used by /admin/operations/drive.
            // Never use a service-role client or broaden scope from caller/model input.
            if (!operational?.scope || !isCountryAllowed(operational.scope, 'EG')) return { kind: 'forbidden' };
            let query = auth.supabase.from('marketplace_requests')
              .select('request_reference,status,next_action,quote_amount,quote_currency,quote_expires_at,drive_request_context!inner(country)')
              .not('drive_offer_id', 'is', null).eq('drive_request_context.country', 'EG')
              .order('created_at', { ascending: false }).limit(LIMIT + 1);
            if (reference) query = query.eq('request_reference', reference);
            const { data, error } = await query;
            if (error) return { kind: 'unavailable' };
            rows = data ?? [];
          } else {
            if (profile.role !== 'customer') return { kind: 'forbidden' };
            if (reference) {
              const result = await getCustomerMarketplaceRequest(auth.supabase, auth.user.id, reference);
              if (result.error) return { kind: 'unavailable' };
              rows = result.request ? [result.request] : [];
            } else {
              const result = await listCustomerMarketplaceRequests(auth.supabase, auth.user.id, LIMIT + 1);
              if (result.error) return { kind: 'unavailable' };
              rows = result.requests;
            }
          }
          const parsed = rows.map(safeAgentRequest);
          if (parsed.some(row => row === null)) return { kind: 'unavailable' };
          return { kind: 'ready', requests: parsed.filter(row => row !== null).slice(0, LIMIT), scope: asOperations ? 'egypt' : 'own', truncated: rows.length > LIMIT, retrievedAt: new Date().toISOString() };
        } catch { return { kind: 'unavailable' }; }
      },
    };
  } catch { return unavailableAgentContext; }
}
