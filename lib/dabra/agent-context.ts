import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient, supabaseAdmin, getSupabaseClientHostname, getSupabaseAdminHostname } from '@/lib/supabase/server';
import { getExecutiveDashboardData } from '@/lib/integration/dashboard-engine';
import { isCredentialBindingCoreProject } from './credential-binding';
import { resolveCustomerCaseAccess } from '@/lib/contact/customer-cases-server';
import { resolveCanonicalActiveProfile } from '@/lib/auth/identity';
import { isCeoActor } from '@/lib/auth/team-access';
import { isCountryAllowed, resolveVerifiedOperationalAccess, scopeCountryQuery } from '@/lib/auth/admin';
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
    const authorityCurrent = async () => {
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
    };
    return {
      role, taskAuthority, isTaskAuthorityCurrent: authorityCurrent,
      isDialogueFundingProjectCurrent() {
        const source = getSupabaseClientHostname(auth.supabase);
        return !!source && source === getSupabaseAdminHostname();
      },
      async readExecutiveMetrics() {
        try {
          if (!executive || !await authorityCurrent()) return { kind: 'forbidden' };
          if (!isCredentialBindingCoreProject(getSupabaseClientHostname(auth.supabase))) return { kind: 'unavailable' };
          const access = await resolveVerifiedOperationalAccess(auth.supabase, auth.user);
          if (access.scope?.mode !== 'global' || !await authorityCurrent()) return { kind: 'forbidden' };
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
          const metrics = await getExecutiveDashboardData(auth.supabase, signal);
          if (signal.aborted) return { kind: 'unavailable' };
          if (!await authorityCurrent()) return { kind: 'forbidden' };
          return { kind: 'ready', metrics, retrievedAt: new Date().toISOString() };
        } catch { return { kind: 'unavailable' }; }
      },
      async readContactInbox() {
        try {
          if (!operational?.scope || !isCountryAllowed(operational.scope, 'EG') || !await authorityCurrent()) return { kind: 'forbidden' };
          const source = getSupabaseClientHostname(auth.supabase);
          if (!supabaseAdmin || !isCredentialBindingCoreProject(source) || source !== getSupabaseAdminHostname()) return { kind: 'unavailable' };
          const access = await resolveVerifiedOperationalAccess(auth.supabase, auth.user, 'operations:read');
          if (!access.scope || !isCountryAllowed(access.scope, 'EG') || !await authorityCurrent()) return { kind: 'forbidden' };
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
          // Same protected inbox and country scoper; never retrieve contacts,
          // messages or internal notes for chat or send them to a provider.
          const { data, error } = await scopeCountryQuery(supabaseAdmin.from('contact_enquiries')
            .select('status').order('created_at', { ascending: false }).limit(101),
            { mode: 'country', countries: ['EG'], grant: access.scope.grant }).abortSignal(signal);
          if (signal.aborted || error || !Array.isArray(data)) return { kind: 'unavailable' };
          if (!await authorityCurrent()) return { kind: 'forbidden' };
          if (data.some(row => !row || !['received','in_progress','closed'].includes(row.status))) return { kind: 'unavailable' };
          const counts = { received: 0, in_progress: 0, closed: 0 };
          for (const row of data.slice(0, 100)) {
            if (row.status === 'received') counts.received++;
            else if (row.status === 'in_progress') counts.in_progress++;
            else counts.closed++;
          }
          return { kind: 'ready', country: 'EG', counts, displayed: Math.min(data.length, 100), truncated: data.length > 100, retrievedAt: new Date().toISOString() };
        } catch { return { kind: 'unavailable' }; }
      },
      async readSupportCases(reference) {
        if (role !== 'customer' || !await authorityCurrent()) return { kind: 'forbidden' };
        const access = await resolveCustomerCaseAccess(request);
        if (access.kind !== 'ready') return { kind: access.kind };
        if (access.actorId !== auth.user.id || !await authorityCurrent()) return { kind: 'forbidden' };
        const result = await access.read(reference);
        return await authorityCurrent() ? result : { kind: 'forbidden' };
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
