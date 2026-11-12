import 'server-only';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, getSupabaseAdminHostname } from '../supabase/server';
import { isCredentialBindingCoreProject } from './credential-binding';
import { runInternalAgentTask } from './agent-handoff';
import { publicDialogueActor } from './public-dialogue-policy';
import { createSuccessfulTaskLifecycle, successfulTaskInputDigest, successfulTaskAuthorityCurrent, boundedSuccessfulTaskOperation } from './successful-task-lifecycle';
import { createDabraAssistantTextResponse } from './chat-response-contract';
import type { SuccessfulTaskCoreDecisions } from './successful-task-core-decisions';
import type { SuccessfulTaskProductionPolicy } from './successful-task-production-policy';
import type { SuccessfulTaskExecutionTerms } from './successful-task-decision-contract';
import { CEO_USER_ID } from '../auth/team-access';
import type { FundingRpc } from './dialogue-funding-store';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
export type SuccessfulTaskProductionInput = { resolveInput: () => Promise<Input>; requestId: string | undefined; stream: boolean };
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'X-DABRA-Private-Context': '1' };
export async function runSuccessfulTaskProduction(request: NextRequest, selected: SuccessfulTaskProductionInput,
  policy: SuccessfulTaskProductionPolicy, bundle: SuccessfulTaskCoreDecisions, terms: SuccessfulTaskExecutionTerms): Promise<Response> {
  const unavailable = () => Response.json({ saved: false, error: 'Task unavailable.' }, { status: 503, headers });
  if (!selected.requestId || !supabaseAdmin || request.signal.aborted) return unavailable();
  try {
    const roleMatches = (role: string) => role === bundle.role || (role === 'ceo' && bundle.role === 'admin' && bundle.actorId === CEO_USER_ID);
    const input = await boundedSuccessfulTaskOperation(async signal => {
      const resolved = await selected.resolveInput();
      return await successfulTaskAuthorityCurrent(resolved, signal) ? resolved : null;
    }, request.signal);
    if (!input || publicDialogueActor(input.context) !== bundle.actorId || !roleMatches(input.context.role)
      || terms.actorId !== bundle.actorId || terms.revision !== bundle.revision) return unavailable();
    // Original continuity and operations receipts are independently locked by Core.
    // Operational scope must carry the actual server resolver's binding; Core
    // independently validates and locks its grant/CEO source for every use.
    const operations = input.context.successfulTaskOperationsBinding ?? null;
    const operationsSnapshot = JSON.stringify(operations);
    const operationsBound = () => operations?.schema === 'dabra-operations-binding-v1'
      && operations.actorId === bundle.actorId && operations.country === 'EG'
      && (operations.kind === 'grant' ? !!operations.grant : operations.kind === 'ceo' && bundle.actorId === CEO_USER_ID && input.context.role === 'ceo' && operations.grant === null);
    const continuity = structuredClone(input.successfulTaskContinuityBinding ?? null);
    const continuitySnapshot = JSON.stringify(continuity);
    const continuityBound = () => continuity?.schema === 'dabra-task-continuity-v1' && continuity.ownerId === bundle.actorId
      && input.context.role === 'customer' && continuity.revision === input.continuityBinding?.revision
      && continuity.generation === input.continuityBinding?.generation && continuity.tripId === input.trip?.id;
    const unsupportedContext = () => (!!input.trip || !!input.continuityBinding || !!continuity) && !continuityBound()
      || (input.context.taskAuthority?.kind === 'operator' && input.context.taskAuthority.country !== null && !operationsBound());
    if (unsupportedContext()) return unavailable();
    const inputValidUntil = input.pricing?.snapshot?.expiresAt ?? null;
    if (inputValidUntil !== null && (!Number.isSafeInteger(inputValidUntil) || inputValidUntil <= Date.now())) return unavailable();
    const digest = successfulTaskInputDigest(input);
    const admin = supabaseAdmin;
    const expected = { schema: 'dabra-successful-task-core-decisions-v1', purpose: 'dabra-successful-task', ...bundle };
    const context = input.context, authority = JSON.stringify(context.taskAuthority);
    const authorityCheck = context.isTaskAuthorityCurrent, projectCheck = context.isDialogueFundingProjectCurrent;
    const checkedInput = { ...input, context: { ...context, taskAuthority: structuredClone(context.taskAuthority),
      isTaskAuthorityCurrent: authorityCheck?.bind(context), isDialogueFundingProjectCurrent: projectCheck?.bind(context) } };
    const current = () => isCredentialBindingCoreProject(getSupabaseAdminHostname())
      && !unsupportedContext() && JSON.stringify(input.successfulTaskContinuityBinding ?? null) === continuitySnapshot && JSON.stringify(context.successfulTaskOperationsBinding ?? null) === operationsSnapshot && input.context === context && JSON.stringify(context.taskAuthority) === authority
      && context.isTaskAuthorityCurrent === authorityCheck && context.isDialogueFundingProjectCurrent === projectCheck
      && publicDialogueActor(input.context) === bundle.actorId && roleMatches(input.context.role);
    const names: Record<string, string> = { get_dabra_successful_task_policy: 'get_dabra_production_task_policy',
      read_dabra_successful_task: 'read_dabra_production_task', reserve_dabra_successful_task: 'reserve_dabra_production_task',
      finish_dabra_successful_task: 'finish_dabra_production_task' };
    const rpc: FundingRpc = async (name, params, signal) => {
      const target = Object.hasOwn(names, name) ? names[name] : undefined;
      if (!target || !current() || signal.aborted || params.p_actor_id !== bundle.actorId
        || !await successfulTaskAuthorityCurrent(checkedInput, signal) || !current()) return { data: null, error: 'unavailable' };
      const bound = name === 'finish_dabra_successful_task' ? params
        : { ...params, p_actor_role: bundle.role, p_policy: policy, p_expected_decisions: expected, p_operations_binding: operations, p_continuity_binding: continuity, ...(name === 'reserve_dabra_successful_task' ? { p_input_valid_until_ms: inputValidUntil } : {}) };
      const result = await admin.rpc(target, bound).abortSignal(signal);
      return current() && !signal.aborted && await successfulTaskAuthorityCurrent(checkedInput, signal) && current()
        ? result : { data: null, error: 'unavailable' };
    };
    const run = createSuccessfulTaskLifecycle({ rpc, execute: (resolved, dialogue, signal) =>
      runInternalAgentTask(resolved, { dialogue, signal, responseContract: 'platform-dialogue' }) });
    const result = await run(input, selected.requestId, request.signal);
    if (!current() || !await successfulTaskAuthorityCurrent(checkedInput, request.signal) || !current()) return unavailable();
    if (result.kind !== 'answer') return Response.json({ saved: false, state: result.kind === 'core' ? 'unavailable' : result.kind },
      { status: result.kind === 'expired' ? 410 : result.kind === 'conflict' || result.kind === 'pending' ? 409 : 503, headers });
    // Last asynchronous boundary: Core revalidates consent under locks and proves
    // saved-answer availability. No callback/identity wait follows this receipt.
    const final = await boundedSuccessfulTaskOperation(async signal => await admin.rpc('read_dabra_production_task', {
      p_actor_id: bundle.actorId, p_request_id: selected.requestId, p_input_digest: digest,
      p_actor_role: bundle.role, p_policy: policy, p_expected_decisions: expected, p_operations_binding: operations, p_continuity_binding: continuity, p_confirm_read: true,
    }).abortSignal(signal), request.signal);
    const row = final.data, now = Date.now();
    if (final.error || !current() || request.signal.aborted || successfulTaskInputDigest(input) !== digest
      || !Object.values(bundle.decisions).every(d => !!d && typeof d === 'object' && 'expiresAtMs' in d
        && typeof d.expiresAtMs === 'number' && d.expiresAtMs > now)
      || !row || row.state !== 'succeeded' || row.answer !== result.answer || row.language !== result.language
      || !Number.isSafeInteger(row.expiresAtMs) || row.expiresAtMs <= now
      || (continuity !== null && (!Number.isSafeInteger(row.tripValidUntilMs) || row.tripValidUntilMs !== continuity.tripExpiresAtMs || row.tripValidUntilMs <= now))) return unavailable();
    const payload = { answer: result.answer, language: result.language, saved: true, replay: result.replay };
    if (!selected.stream) return Response.json(payload, { headers });
    const response = createDabraAssistantTextResponse(payload);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  } catch { return unavailable(); }
}
