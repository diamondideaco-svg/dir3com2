import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient, supabaseAdmin, getSupabaseClientHostname, getSupabaseAdminHostname } from '@/lib/supabase/server';
import { resolveCanonicalActiveProfile } from '@/lib/auth/identity';
import { isCredentialBindingCoreProject } from '@/lib/dabra/credential-binding';
import { UUID_PATTERN } from './contract';
import type { SaveContact } from './handler';
import { parseCustomerCaseRead, parseCustomerCaseReference, type CustomerCaseRead } from './customer-cases';

type Access =
  | { kind: 'authentication_required' | 'forbidden' | 'unavailable' }
  | { kind: 'ready'; actorId: string; save: SaveContact; read: (reference: string | null) => Promise<CustomerCaseRead> };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Same verified Auth and Core project as the existing platform; no caller owner/role is accepted. */
export async function resolveCustomerCaseAccess(request: NextRequest): Promise<Access> {
  try {
    const auth = await createSupabaseRequestClient(request);
    if (!auth) return { kind: 'authentication_required' };
    const profile = await resolveCanonicalActiveProfile(auth.supabase, auth.user.id);
    if (!profile || profile.role !== 'customer') return { kind: 'forbidden' };
    const hostname = getSupabaseClientHostname(auth.supabase);
    const admin = supabaseAdmin;
    if (!admin || !isCredentialBindingCoreProject(hostname) || hostname !== getSupabaseAdminHostname()) return { kind: 'unavailable' };
    const current = async () => {
      if (request.signal.aborted) return false;
      const fresh = await resolveCanonicalActiveProfile(auth.supabase, auth.user.id);
      return fresh?.id === auth.user.id && fresh.role === 'customer';
    };
    const signal = () => AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
    return {
      kind: 'ready', actorId: auth.user.id,
      async save(input, key) {
        try {
          if (!UUID_PATTERN.test(key) || !await current()) return { kind: 'unavailable' };
          // The database computes the actor-bound fingerprint and locks current
          // authority inside the same transaction as the row and first event.
          const bounded = signal();
          const { data, error } = await admin.rpc('receive_customer_contact_enquiry', {
            p_actor: auth.user.id, p_key: key.toLowerCase(), p_input: input,
          }).abortSignal(bounded);
          if (bounded.aborted || error || !await current() || !record(data)) return { kind: 'unavailable' };
          if (data.kind === 'conflict' || data.kind === 'limited') return { kind: data.kind };
          if (data.kind !== 'saved' || typeof data.reference !== 'string' || !UUID_PATTERN.test(data.reference)
            || typeof data.replay !== 'boolean') return { kind: 'unavailable' };
          return { kind: 'saved', reference: 'CASE-' + data.reference.toLowerCase(), replay: data.replay };
        } catch { return { kind: 'unavailable' }; }
      },
      async read(reference) {
        try {
          const parsed = reference === null ? null : parseCustomerCaseReference(reference);
          if (reference !== null && !parsed) return { kind: 'unavailable' };
          if (!await current()) return { kind: 'forbidden' };
          const bounded = signal();
          const { data, error } = await admin.rpc('get_customer_contact_cases', {
            p_actor: auth.user.id, p_case: parsed?.id ?? null,
          }).abortSignal(bounded);
          if (bounded.aborted || error) return { kind: 'unavailable' };
          if (!await current()) return { kind: 'forbidden' };
          return parseCustomerCaseRead(data) ?? { kind: 'unavailable' };
        } catch { return { kind: 'unavailable' }; }
      },
    };
  } catch { return { kind: 'unavailable' }; }
}
