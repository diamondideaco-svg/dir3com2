import 'server-only';
import type { NextRequest } from 'next/server';
import { runSuccessfulTaskProduction, type SuccessfulTaskProductionInput } from './successful-task-production-runtime';
import { interpretSuccessfulTaskDecisions } from './successful-task-decision-contract';
import { selectSuccessfulTaskPolicy, resolveSuccessfulTaskCoreDecisions } from './successful-task-core-decisions';

/** Server-owned decision references, not consent text or an authorization grant.
 * Resolving these references against Core is required before execution can exist.
 * No development retention, audience or spending values are inherited.
 */
export type SuccessfulTaskProductionPolicy = Readonly<{
  schema: 'dabra-successful-task-production-policy-v1';
  revision: string;
  retentionDecision: string;
  consentDecision: string;
  deletionDecision: string;
  audienceDecision: string;
  spendingDecision: string;
}>;
const keys = ['schema', 'revision', 'retentionDecision', 'consentDecision',
  'deletionDecision', 'audienceDecision', 'spendingDecision'] as const;

/** Only detached JSON data is accepted. A structurally valid policy is not proof
 * of approval, current consent, available funding or production readiness.
 */
export function parseSuccessfulTaskProductionPolicy(value: unknown): SuccessfulTaskProductionPolicy | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== keys.length || !keys.every(key =>
      descriptors[key]?.enumerable === true && Object.hasOwn(descriptors[key], 'value'))) return null;
    const snapshot = structuredClone(value) as Record<string, unknown>;
    if (snapshot.schema !== 'dabra-successful-task-production-policy-v1'
      || !keys.slice(1).every(key => typeof snapshot[key] === 'string'
        && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(snapshot[key] as string))) return null;
    return Object.freeze(snapshot) as SuccessfulTaskProductionPolicy;
  } catch { return null; }
}

/** Deliberately unconfigured. No ENV, request field, mutable registration hook,
 * existing continuity consent or synthetic RPC can supply this policy.
 */
export type SuccessfulTaskProgram = Readonly<{ schema: 'dabra-successful-task-program-v1'; revision: string }>;
export function parseSuccessfulTaskProgram(value: unknown): SuccessfulTaskProgram | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || v.schema !== 'dabra-successful-task-program-v1'
    || typeof v.revision !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v.revision)) return null;
  return Object.freeze({ schema: 'dabra-successful-task-program-v1', revision: v.revision });
}
export function readSuccessfulTaskProductionPolicy(): SuccessfulTaskProgram | null { return null; }

/** null means the new path was not selected: preserve the existing chat path.
 * Any configured value selects the new boundary. Invalid/incomplete decisions
 * fail closed, and even valid references remain unavailable until Core resolves
 * them and supplies the separately reviewed lifecycle. Never fall through then.
 */
export async function successfulTaskProductionGate(policy: unknown, request?: NextRequest,
  resolve = resolveSuccessfulTaskCoreDecisions, execution?: SuccessfulTaskProductionInput, run = runSuccessfulTaskProduction): Promise<Response | null> {
  if (policy === null || policy === undefined) return null;
  const program = parseSuccessfulTaskProgram(policy);
  const parsed = program && request ? await selectSuccessfulTaskPolicy(request, program.revision)
    : parseSuccessfulTaskProductionPolicy(policy);
  // Selection never falls through to legacy funding, including unknown admission.
  let decisions = null;
  try { if (parsed && request) decisions = await resolve(request, parsed); } catch { /* Selected paths never fall back. */ }
  const terms = decisions && interpretSuccessfulTaskDecisions(decisions);
  if (parsed && request && decisions && terms && execution) return run(request, execution, parsed, decisions, terms);
  return Response.json({ saved: false, error: 'Task unavailable.',
    state: terms ? 'not_ready' : 'policy_unavailable' }, {
    status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' },
  });
}
