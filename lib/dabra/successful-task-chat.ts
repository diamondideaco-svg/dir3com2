import 'server-only';
import { createDabraAssistantTextResponse } from './chat-response-contract';
import { runInternalAgentTask } from './agent-handoff';
import { createSyntheticSuccessfulTaskRunner, readSyntheticSuccessfulTaskAllowance,
  successfulTaskAuthorityCurrent, boundedSuccessfulTaskOperation, type successfulTaskInputDigest } from './successful-task-development';
import type { FundingRpc } from './dialogue-funding-store';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
export type SyntheticSuccessfulTaskChatDependencies = Readonly<{
  dataScope: 'synthetic-only';
  rpc: FundingRpc;
}>;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
  'X-DABRA-Private-Context': '1' };

/** The actual POST calls without deps. There is deliberately no live adapter,
 * registration hook, credential transport, mutable singleton or ENV switch.
 * Tests inject the dependency at the module boundary, never through HTTP data.
 */
export async function successfulTaskChatResponse(
  resolveInput: () => Promise<Input>, requestId: string | undefined, signal: AbortSignal,
  stream: boolean, deps?: SyntheticSuccessfulTaskChatDependencies,
): Promise<Response | null> {
  if (!deps) return null; // Preserve existing Core/public admission behavior byte-for-byte.
  const unavailable = () => Response.json({ saved: false, error: 'Task unavailable.' }, { status: 503, headers: privateHeaders });
  if (process.env.NODE_ENV !== 'test' || deps.dataScope !== 'synthetic-only') return unavailable();
  if (!requestId) return Response.json({ saved: false, error: 'Request identity required.' }, { status: 400, headers: privateHeaders });
  try {
    const input = await boundedSuccessfulTaskOperation(async bounded => {
      const resolved = await resolveInput();
      return await successfulTaskAuthorityCurrent(resolved, bounded) ? resolved : null;
    }, signal);
    if (!input) return unavailable();
    const run = createSyntheticSuccessfulTaskRunner({ ...deps,
      execute: (resolved, policy, bounded) => runInternalAgentTask(resolved, {
        dialogue: policy, signal: bounded, responseContract: 'platform-dialogue',
      }),
    });
    const result = await run(input, requestId, signal);
    if (result.kind === 'unavailable') return unavailable();
    // One post-execution deadline covers both authority fences and allowance,
    // including IO that ignores cancellation. Never extend it by retrying.
    const delivery = await boundedSuccessfulTaskOperation(async bounded => {
      if (!await successfulTaskAuthorityCurrent(input, bounded)) return null;
      const allowance = await readSyntheticSuccessfulTaskAllowance(deps.rpc, input, bounded);
      return await successfulTaskAuthorityCurrent(input, bounded) ? { allowance } : null;
    }, signal);
    if (!delivery) return unavailable();
    const headers = { ...privateHeaders,
      ...(delivery.allowance ? { 'X-DABRA-Successful-Task-Allowance': JSON.stringify(delivery.allowance) } : {}),
    };
    const payload = result.kind === 'answer'
      ? { answer: result.answer, language: result.language, saved: true, replay: result.replay }
      : result.kind === 'core' && result.result.kind === 'response' ? { ...result.result.response, saved: false } : null;
    if (payload) {
      if (!stream) return Response.json(payload, { headers });
      const response = createDabraAssistantTextResponse(payload);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return response;
    }
    const state = result.kind === 'core' ? 'unavailable' : result.kind;
    const status = state === 'unavailable' ? 503 : state === 'expired' ? 410 : 409;
    return Response.json({ state, saved: false, error: 'Task is not available for delivery.' }, { status, headers });
  } catch { return unavailable(); }
}
