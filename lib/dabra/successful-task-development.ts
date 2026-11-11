import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { publicDialogueActor } from './public-dialogue-policy';
import { loadPublicDialoguePolicy } from './public-dialogue-store';
import { isAgentTaskAuthorityCurrent, type AgentDialoguePolicy } from './agent-dialogue';
import { runInternalAgentTask, type AgentCoreTaskResult } from './agent-handoff';
import type { FundingRpc } from './dialogue-funding-store';
import { successfulTaskAllowance, type SuccessfulTaskUsage } from './successful-task-contract';

type Input = Parameters<typeof runInternalAgentTask>[0] & { continuityBinding?: Readonly<{ revision: number; generation: number }> };
const uuid = (v: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
/** Include every answer-affecting input; identity and context are server-resolved, never client roles. */
export function successfulTaskInputDigest(input: Input) {
  return sha(JSON.stringify({ schema: 'task237-input-v1', actor: input.context.taskAuthority, role: input.context.role,
    message: input.message, history: input.history, locale: input.locale, trip: input.trip ?? null,
    continuityBinding: input.continuityBinding ?? null, intent: input.intent ?? null, pricing: input.pricing ?? null, needsClarification: input.needsClarification ?? false,
    serverAttachmentNote: input.serverAttachmentNote ?? null }));
}
export type SuccessfulTaskResult =
  | { kind: 'answer'; answer: string; language: 'ar' | 'en'; saved: true; replay: boolean }
  | { kind: 'core'; result: AgentCoreTaskResult; saved: false }
  | { kind: 'unavailable' | 'conflict' | 'pending' | 'unknown' | 'failed' | 'expired'; saved: false };

/** Recheck both sides of the asynchronous identity read; project changes must fence replay too. */
export async function successfulTaskAuthorityCurrent(input: Input, signal: AbortSignal) {
  return !signal.aborted && input.context.isDialogueFundingProjectCurrent?.() === true
    && await isAgentTaskAuthorityCurrent(input.context, signal)
    && !signal.aborted && input.context.isDialogueFundingProjectCurrent?.() === true;
}
/** Bound the whole operation even when an injected dependency ignores AbortSignal. Never retry. */
export async function boundedSuccessfulTaskOperation<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const bounded = AbortSignal.any([AbortSignal.timeout(1000), ...(signal ? [signal] : [])]);
  if (bounded.aborted) throw new Error('TASK237_STORE_UNAVAILABLE');
  let stop: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    stop = () => reject(new Error('TASK237_STORE_UNAVAILABLE'));
    bounded.addEventListener('abort', stop, { once: true });
  });
  const result = await Promise.race([operation(bounded), timeout])
    .finally(() => { if (stop) bounded.removeEventListener('abort', stop); });
  if (bounded.aborted) throw new Error('TASK237_STORE_UNAVAILABLE');
  return result;
}
export async function boundedSuccessfulTaskRpc(rpc: FundingRpc, name: string, params: Record<string, unknown>, signal?: AbortSignal) {
  const result = await boundedSuccessfulTaskOperation(bounded => rpc(name, params, bounded), signal);
  if (result.error || !object(result.data)) throw new Error('TASK237_STORE_UNAVAILABLE');
  return result.data;
}

/** No production adapter, URL, service credentials or environment switch is provided.
 * Only isolated synthetic tests may inject a transport. Runtime route stays hard-disabled.
 * This constructor cannot be reached through request JSON or a public env variable.
 */
export function createSyntheticSuccessfulTaskRunner(deps: {
  dataScope: 'synthetic-only'; rpc: FundingRpc;
  execute: (input: Input, policy: AgentDialoguePolicy, signal: AbortSignal) => Promise<AgentCoreTaskResult>;
}) {
  if (process.env.NODE_ENV !== 'test' || deps.dataScope !== 'synthetic-only') throw new Error('TASK237_SYNTHETIC_ONLY');
  return async function run(input: Input, requestId: string, signal: AbortSignal): Promise<SuccessfulTaskResult> {
    const actor = publicDialogueActor(input.context), digest = successfulTaskInputDigest(input);
    if (!actor || !uuid(actor) || !uuid(requestId) || signal.aborted || input.serverAttachmentNote || (input.trip && !input.continuityBinding)) return { kind: 'unavailable', saved: false };
    const current = () => successfulTaskAuthorityCurrent(input, signal);
    // Completion uses a bounded independent signal; it is not a provider retry.
    const call = (name: string, params: Record<string, unknown>) => boundedSuccessfulTaskRpc(deps.rpc,name,params);
    const identity = { p_actor_id: actor, p_request_id: requestId, p_input_digest: digest };
    const read = () => call('read_dabra_successful_task', identity);
    const replay = async (row: Record<string, unknown>): Promise<SuccessfulTaskResult> => {
      if (!await current()) return { kind: 'unavailable', saved: false };
      if (row.state === 'succeeded') {
        if (typeof row.answer !== 'string' || !row.answer.trim() || row.answer.length > 64000 || row.language !== input.locale)
          return { kind: 'expired', saved: false };
        return { kind: 'answer', answer: row.answer, language: input.locale, saved: true, replay: true };
      }
      const kind = row.state === 'conflict' ? 'conflict' : row.state === 'pending' ? 'pending' : row.state === 'failed' ? 'failed' : 'unknown';
      return { kind, saved: false };
    };
    let admissionStarted = false, admitted = false, explicitlyDenied = false;
    const lease = randomUUID();
    try {
      if (!await current()) return { kind: 'unavailable', saved: false };
      const existing = await read();
      if (existing.state !== 'absent') return replay(existing);
      const rpc: FundingRpc = async (name, params, rpcSignal) => {
        if (name === 'get_dabra_public_dialogue_policy') return deps.rpc('get_dabra_successful_task_policy', params, rpcSignal);
        if (name !== 'reserve_dabra_public_dialogue_attempt') return { data: null, error: 'unexpected_rpc' };
        admissionStarted = true;
        const result = await deps.rpc('reserve_dabra_successful_task', { ...params, ...identity, p_lease_token: lease }, rpcSignal);
        admitted = !result.error && object(result.data) && result.data.decision === 'admitted';
        explicitlyDenied = !result.error && object(result.data) && result.data.decision === 'denied';
        return result;
      };
      const policy = await loadPublicDialoguePolicy(input.context, signal, requestId, rpc);
      const result = await deps.execute(input, policy, signal);
      if (!admissionStarted || explicitlyDenied) return await current()
        ? { kind: 'core', result, saved: false } : { kind: 'unavailable', saved: false };
      if (!admitted) return replay(await read()); // Committed-unknown or concurrent request: never redispatch.
      if (!await current()) return { kind: 'unknown', saved: false }; // Preserve the lease and cost; bounded expiry reconciles.
      const valid = result.kind === 'response' && result.dialogueOutcome === 'validated' && result.response.provider !== 'local'
        && result.response.language === input.locale && result.response.agent.mutations === 0
        && result.response.answer.trim().length > 0 && result.response.answer.length <= 64000;
      const outcome = valid ? 'succeeded' : result.kind === 'stopped' || result.dialogueOutcome === 'unknown' ? 'unknown' : 'failed';
      const finished = await call('finish_dabra_successful_task', { ...identity, p_lease_token: lease, p_outcome: outcome,
        p_answer: valid ? result.response.answer : null, p_language: valid ? input.locale : null });
      if (finished.state !== 'succeeded') return { kind: outcome === 'failed' && finished.state === 'failed' ? 'failed' : 'unknown', saved: false };
      // A receipt alone is not enough: verify the saved answer is available before reporting success.
      const saved = await replay(await read());
      return saved.kind === 'answer' ? { ...saved, replay: false } : saved;
    } catch { return { kind: admissionStarted ? 'unknown' : 'unavailable', saved: false }; }
  };
}

export async function readSyntheticSuccessfulTaskAllowance(rpc: FundingRpc, input: Input, signal: AbortSignal) {
  if (process.env.NODE_ENV !== 'test') return null;
  try {
    const actor = publicDialogueActor(input.context);
    if (!actor || !await successfulTaskAuthorityCurrent(input,signal)) return null;
    const data = await boundedSuccessfulTaskRpc(rpc,'get_dabra_successful_task_allowance',{p_actor_id:actor},signal);
    if (Object.keys(data).length !== 6 || !await successfulTaskAuthorityCurrent(input,signal)) return null;
    return successfulTaskAllowance(data as SuccessfulTaskUsage);
  } catch { return null; }
}
