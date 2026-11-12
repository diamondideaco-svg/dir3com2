import 'server-only';
import { createSuccessfulTaskLifecycle, successfulTaskInputDigest, successfulTaskAuthorityCurrent, boundedSuccessfulTaskRpc } from './successful-task-lifecycle';
import { publicDialogueActor } from './public-dialogue-policy';
import { successfulTaskAllowance, type SuccessfulTaskUsage } from './successful-task-contract';
import type { FundingRpc } from './dialogue-funding-store';
export { successfulTaskInputDigest, successfulTaskAuthorityCurrent, boundedSuccessfulTaskRpc, boundedSuccessfulTaskOperation, type SuccessfulTaskResult } from './successful-task-lifecycle';
type Input = Parameters<typeof successfulTaskInputDigest>[0];
/** The existing synthetic wrapper remains test-only; production never imports it. */
export function createSyntheticSuccessfulTaskRunner(deps: Parameters<typeof createSuccessfulTaskLifecycle>[0] & { dataScope: 'synthetic-only' }) {
  if (process.env.NODE_ENV !== 'test' || deps.dataScope !== 'synthetic-only') throw new Error('TASK237_SYNTHETIC_ONLY');
  return createSuccessfulTaskLifecycle(deps);
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
