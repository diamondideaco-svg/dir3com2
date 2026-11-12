import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import type { FundingRpc } from './dialogue-funding-store';
import { publicDialogueActor } from './public-dialogue-policy';
import { boundedSuccessfulTaskOperation, successfulTaskAuthorityCurrent, successfulTaskInputDigest } from './successful-task-development';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: readonly string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const integer = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= max;
const identityKeys = ['p_actor_id', 'p_request_id', 'p_input_digest'];
const contracts: Record<string, readonly string[]> = {
  get_dabra_successful_task_policy: ['p_actor_id'],
  get_dabra_successful_task_allowance: ['p_actor_id'],
  read_dabra_successful_task: identityKeys,
  reserve_dabra_successful_task: [...identityKeys, 'p_attempt_id', 'p_authority_id', 'p_execution', 'p_input_tokens', 'p_output_tokens', 'p_cost_micros', 'p_lease_token'],
  finish_dabra_successful_task: [...identityKeys, 'p_lease_token', 'p_outcome', 'p_answer', 'p_language'],
};

/** Uninstalled synthetic transport boundary, not a live client or lifecycle.
 * Existing consumers own policy/receipt/answer validation and public projection.
 * In particular, an uncertain reservation must never become a definite denial.
 */
export function createSyntheticSuccessfulTaskStoreAdapter(deps: {
  dataScope: 'synthetic-only'; input: Input; requestId: string; transport: FundingRpc;
}): FundingRpc {
  if (process.env.NODE_ENV !== 'test' || deps.dataScope !== 'synthetic-only') throw new Error('TASK237_SYNTHETIC_ONLY');
  const { input, requestId, transport } = deps;
  const actor = publicDialogueActor(input.context), digest = successfulTaskInputDigest(input);
  const context = input.context, role = context.role, authority = structuredClone(context.taskAuthority);
  const authorityCheck = context.isTaskAuthorityCurrent, projectCheck = context.isDialogueFundingProjectCurrent;
  const checkedInput = { ...input, context: { ...context, taskAuthority: authority,
    isTaskAuthorityCurrent: authorityCheck?.bind(context), isDialogueFundingProjectCurrent: projectCheck?.bind(context) } };
  const unavailable = () => ({ data: null, error: 'TASK237_STORE_UNAVAILABLE' });
  const bindingCurrent = () => input.context === context && context.isTaskAuthorityCurrent === authorityCheck
    && context.isDialogueFundingProjectCurrent === projectCheck
    && publicDialogueActor(context) === actor && context.role === role
    && isDeepStrictEqual(input.context.taskAuthority, authority);
  return async (name, params, signal) => {
    try {
      // Validate exactly the detached values that transport will receive. Getters
      // run once during cloning; missing/non-enumerable keys fail on the clone.
      const snapshot = structuredClone(params);
      if (process.env.NODE_ENV !== 'test' || !uuid(actor) || !uuid(requestId) || signal.aborted
        || !Object.hasOwn(contracts, name) || !object(snapshot) || !keys(snapshot, contracts[name]) || snapshot.p_actor_id !== actor) return unavailable();
      if (name !== 'get_dabra_successful_task_policy' && name !== 'get_dabra_successful_task_allowance'
        && (snapshot.p_request_id !== requestId || snapshot.p_input_digest !== digest)) return unavailable();
      if (name === 'reserve_dabra_successful_task') {
        const e = snapshot.p_execution;
        if (!uuid(snapshot.p_attempt_id) || !uuid(snapshot.p_authority_id) || !uuid(snapshot.p_lease_token)
          || !integer(snapshot.p_input_tokens, 4096) || !integer(snapshot.p_output_tokens, 1024) || !integer(snapshot.p_cost_micros, 250000)
          || !object(e) || !keys(e, ['schema', 'authorityId', 'profileSha256', 'attemptId', 'requestId', 'observation'])
          || e.schema !== 'dabra-public-execution-v1' || e.authorityId !== snapshot.p_authority_id || e.attemptId !== snapshot.p_attempt_id
          || e.requestId !== requestId || typeof e.profileSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(e.profileSha256) || !object(e.observation)) return unavailable();
      }
      if (name === 'finish_dabra_successful_task' && (!uuid(snapshot.p_lease_token)
        || typeof snapshot.p_outcome !== 'string' || !['succeeded', 'failed', 'unknown'].includes(snapshot.p_outcome)
        || (snapshot.p_outcome === 'succeeded'
          ? typeof snapshot.p_answer !== 'string' || !snapshot.p_answer.trim() || snapshot.p_answer.length > 64000 || snapshot.p_language !== input.locale
          : snapshot.p_answer !== null || snapshot.p_language !== null))) return unavailable();
      // Only this call's signal is used: finish retains its independent deadline
      // after provider cancellation. Digest freshness remains the runner's policy,
      // so a known FX-expiry failure can still finish under its original digest.
      return await boundedSuccessfulTaskOperation(async bounded => {
        if (!bindingCurrent() || !await successfulTaskAuthorityCurrent(checkedInput, bounded) || !bindingCurrent()) return unavailable();
        const result = await transport(name, snapshot, bounded);
        if (!bindingCurrent() || !await successfulTaskAuthorityCurrent(checkedInput, bounded) || !bindingCurrent()) return unavailable();
        return result.error ? unavailable() : result;
      }, signal);
    } catch { return unavailable(); }
  };
}
