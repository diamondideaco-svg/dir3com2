import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readSuccessfulTaskCleanupAuthorization } from './successful-task-cleanup-config';
import { readSuccessfulTaskCleanupEndpointConfig } from './successful-task-cleanup-endpoint-config';

function reply(state: string, status: number) {
  return Response.json({ state }, { status, headers: { 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' } });
}

/** Machine POST only. Both independent server gates and authentication precede
 * importing the Core worker. No caller batch/body, cookies, retries or logs.
 * Unknown can mean committed removal; it never authorizes an automatic retry.
 */
export async function handleSuccessfulTaskContentCleanup(request: Request): Promise<Response> {
  if (request.method !== 'POST') return reply('method_not_allowed', 405);
  const config = readSuccessfulTaskCleanupEndpointConfig();
  if (!config || readSuccessfulTaskCleanupAuthorization() !== 'stored-deadline-content-only'
    || !/^[a-f0-9]{64}$/.test(config.tokenSha256)
    || !Number.isSafeInteger(config.batchLimit) || config.batchLimit < 1 || config.batchLimit > 100) return reply('unavailable', 503);
  const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !timingSafeEqual(createHash('sha256').update(token).digest(), Buffer.from(config.tokenSha256, 'hex'))) return reply('unauthorized', 401);
  if (new URL(request.url).search || request.body !== null) return reply('invalid', 400);
  if (request.signal.aborted) return reply('unavailable', 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(1000)]);
  let attempted = false, stop: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(new Error('CLEANUP_STOPPED'));
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    const work = (async () => {
      const { runSuccessfulTaskContentCleanup } = await import('./successful-task-content-cleanup');
      if (signal.aborted) return reply('unavailable', 503);
      attempted = true;
      const result = await runSuccessfulTaskContentCleanup(config.batchLimit, signal);
      if (signal.aborted || result.kind === 'unknown') return reply('unknown', 503);
      return result.kind === 'completed' ? reply('completed', 200) : reply('unavailable', 503);
    })();
    return await Promise.race([work, cancelled]);
  } catch {
    return reply(attempted ? 'unknown' : 'unavailable', 503);
  } finally {
    if (stop) signal.removeEventListener('abort', stop);
  }
}
