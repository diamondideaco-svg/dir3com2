import 'server-only';
import type { NextRequest } from 'next/server';
import { createSupabaseRequestClient, getSupabaseClientHostname, supabaseAdmin, getSupabaseAdminHostname } from '../supabase/server';
import { resolveCanonicalActiveProfile } from '../auth/identity';
import { CEO_USER_ID } from '../auth/team-access';
import { isCredentialBindingCoreProject } from './credential-binding';
import type { SuccessfulTaskProductionPolicy } from './successful-task-production-policy';

const kinds = ['retention', 'consent', 'deletion', 'audience', 'spending'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reference = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export type SuccessfulTaskCoreDecisions = Readonly<{
  actorId: string; role: string; revision: string;
  /** Detached Core documents. Not a funding reservation or execution permit. */
  decisions: Readonly<Record<string, unknown>>;
}>;

function parseDecisions(value: unknown, policy: SuccessfulTaskProductionPolicy, actorId: string, role: string): SuccessfulTaskCoreDecisions | null {
  const v: unknown = structuredClone(value);
  if (!object(v) || !exact(v, ['schema', 'purpose', 'actorId', 'role', 'revision', 'decisions'])
    || v.schema !== 'dabra-successful-task-core-decisions-v1' || v.purpose !== 'dabra-successful-task'
    || v.actorId !== actorId || v.role !== role || v.revision !== policy.revision
    || !object(v.decisions) || !exact(v.decisions, kinds)) return null;
  const now = Date.now();
  for (const kind of kinds) {
    const d = v.decisions[kind];
    if (!object(d) || !exact(d, ['reference', 'approvedBy', 'approvalReference', 'approvedAtMs', 'expiresAtMs', 'revokedAtMs', 'document', 'fundingGrantId', 'fundingProofSha256'])
      || d.reference !== policy[`${kind}Decision`] || d.approvedBy !== (kind === 'consent' ? actorId : CEO_USER_ID)
      || typeof d.approvalReference !== 'string' || !reference.test(d.approvalReference)
      || !integer(d.approvedAtMs) || !integer(d.expiresAtMs) || d.approvedAtMs > now || d.expiresAtMs <= now
      || d.expiresAtMs <= d.approvedAtMs || d.revokedAtMs !== null
      || !object(d.document) || Object.keys(d.document).length === 0 || JSON.stringify(d.document).length > 16384) return null;
    if (kind === 'spending') {
      if (typeof d.fundingGrantId !== 'string' || !uuid.test(d.fundingGrantId)
        || typeof d.fundingProofSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(d.fundingProofSha256)) return null;
    } else if (d.fundingGrantId !== null || d.fundingProofSha256 !== null) return null;
  }
  // Do not expose mutable approval documents to subsequent consumers.
  const freeze = (x: unknown): void => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } };
  freeze(v.decisions);
  return Object.freeze({ actorId, role, revision: policy.revision, decisions: v.decisions });
}

/** The actual cookie/bearer Core client supplies the verified actor; no client actor,
 * caller-supplied credential, synthetic transport, write, retry or provider call.
 * Approval resolution alone cannot authorize execution or replace admission.
 */
export async function resolveSuccessfulTaskCoreDecisions(request: NextRequest, policy: SuccessfulTaskProductionPolicy): Promise<SuccessfulTaskCoreDecisions | null> {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(1000)]);
  if (signal.aborted || new Set(kinds.map(k => policy[`${k}Decision`])).size !== kinds.length) return null;
  let stop: (() => void) | undefined;
  const expired = new Promise<null>(resolve => {
    stop = () => resolve(null); signal.addEventListener('abort', stop, { once: true });
  });
  try {
    return await Promise.race([expired, (async () => {
      const session = await createSupabaseRequestClient(request);
      if (!session || signal.aborted) return null;
      const actorId = session.user.id, client = session.supabase, admin = supabaseAdmin;
      if (!admin) return null;
      const project = () => isCredentialBindingCoreProject(getSupabaseClientHostname(client))
        && getSupabaseClientHostname(client) === getSupabaseAdminHostname();
      if (!uuid.test(actorId) || !project()) return null;
      const profile = await resolveCanonicalActiveProfile(client, actorId);
      if (!profile || profile.id !== actorId || signal.aborted || !project()) return null;
      const { data, error } = await admin.rpc('resolve_dabra_successful_task_decisions', { p_actor_id: actorId, p_actor_role: profile.role, p_policy: policy }).abortSignal(signal);
      if (error || signal.aborted || !project()) return null;
      const auth = await client.auth.getUser();
      if (auth.error || auth.data.user?.id !== actorId || signal.aborted || !project()) return null;
      const current = await resolveCanonicalActiveProfile(client, actorId);
      if (!current || current.id !== actorId || current.role !== profile.role || current.sourceRole !== profile.sourceRole
        || signal.aborted || !project()) return null;
      return parseDecisions(data, policy, actorId, profile.role);
    })()]);
  } catch { return null; }
  finally { if (stop) signal.removeEventListener('abort', stop); }
}

/** Actor-scoped reference selection; the five-document resolver still revalidates. */
export async function selectSuccessfulTaskPolicy(request: NextRequest, revision: string): Promise<SuccessfulTaskProductionPolicy | null> {
  const { withSuccessfulTaskOwner } = await import('./successful-task-owner');
  const { parseSuccessfulTaskProductionPolicy } = await import('./successful-task-production-policy');
  const { boundedSuccessfulTaskOperation } = await import('./successful-task-lifecycle');
  try {
    return await boundedSuccessfulTaskOperation(signal => withSuccessfulTaskOwner(request, signal, async (actor, role, admin) => {
      const { data, error } = await admin.rpc('select_dabra_production_task_policy', {
        p_actor_id: actor, p_actor_role: role, p_revision: revision,
      }).abortSignal(signal);
      return error ? null : parseSuccessfulTaskProductionPolicy(data);
    }), request.signal);
  } catch { return null; }
}
