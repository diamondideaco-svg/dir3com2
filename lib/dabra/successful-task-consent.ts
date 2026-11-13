import 'server-only';
import type { NextRequest } from 'next/server';
import { withSuccessfulTaskOwner } from './successful-task-owner';
import { readSuccessfulTaskProductionPolicy, classifySuccessfulTaskPilot } from './successful-task-production-policy';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

async function body(request: NextRequest, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > 1024) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  let cancelled = false, size = 0; const chunks: Uint8Array[] = [];
  const cancel = () => { if (cancelled) return; cancelled = true; try { void reader.cancel().catch(() => {}); } catch {} };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) { cancel(); return null; }
    for (;;) {
      const part = await reader.read(); if (signal.aborted) return null;
      if (part.done) break;
      size += part.value.length; if (size > 1024) { cancel(); return null; } chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

/** Account management includes initial and final session checks. Keep its own
 * 4s budget below the UI's 5s deadline; task admission/finish retain their 1s cap.
 * An uncooperative dependency must not keep the response pending. Never retry.
 */
async function boundedConsentOperation<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  const bounded = AbortSignal.any([AbortSignal.timeout(4000), signal]);
  if (bounded.aborted) throw new Error('CONSENT_UNAVAILABLE');
  let stop: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(new Error('CONSENT_UNAVAILABLE'));
    bounded.addEventListener('abort', stop, { once: true });
  });
  try {
    const result = await Promise.race([new Promise<T>(resolve => resolve(operation(bounded))), cancelled]);
    if (bounded.aborted) throw new Error('CONSENT_UNAVAILABLE');
    return result;
  } finally { if (stop) bounded.removeEventListener('abort', stop); }
}

/** Notice read is not consent. Removal is deliberately independent of execution selection. */
export async function successfulTaskConsent(request: NextRequest): Promise<Response> {
  const unavailable = () => json({ error: 'Unavailable.' }, 503);
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Invalid method.' }, 405);
  if (request.method === 'POST' && (request.headers.get('origin') !== request.nextUrl.origin
    || request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json')) return json({ error: 'Invalid origin or media type.' }, 403);
  if (request.nextUrl.search) return json({ error: 'Invalid request.' }, 400);
  const configured = readSuccessfulTaskProductionPolicy();
  try {
    return await boundedConsentOperation(async signal => {
      const input = request.method === 'POST' ? await body(request, signal) : null;
      if (signal.aborted) return unavailable();
      if (request.method === 'POST' && (!input || !['grant','revoke'].includes(String(input.action))
        || typeof input.expectedOwner !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.expectedOwner)
        || typeof input.mutationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.mutationId)
        || !Number.isSafeInteger(input.generation) || (input.generation as number) < 0)) return json({ error: 'Invalid request.' }, 400);
      if (input && !(input.action === 'revoke' ? exact(input, ['action','generation','expectedOwner','mutationId'])
        : input.action === 'grant' && exact(input, ['action','generation','noticeVersion','noticeSha256','mutationId','expectedOwner'])
        && typeof input.noticeVersion === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(input.noticeVersion)
        && typeof input.noticeSha256 === 'string' && /^[a-f0-9]{64}$/.test(input.noticeSha256)
        && typeof input.mutationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.mutationId))) return json({ error: 'Invalid request.' }, 400);
      const result = await withSuccessfulTaskOwner(request, signal, async (actor, role, admin) => {
        if (input && input.expectedOwner !== actor) return null;
        // Status and withdrawal remain owner-accessible even outside the pilot.
        const selection = classifySuccessfulTaskPilot(configured, actor, role);
        const program = selection.kind === 'pilot' ? selection.program : null;
        if (input?.action === 'grant' && !program) return null;
        const rpc = async (action: string) => {
          const { data, error } = await admin.rpc('dabra_task_consent', { p_actor_id: actor, p_actor_role: role, p_action: action,
            p_revision: program?.revision ?? null, p_generation: input?.generation ?? null,
            p_notice_version: input?.noticeVersion ?? null, p_notice_sha256: input?.noticeSha256 ?? null, p_mutation: input?.mutationId ?? null }).abortSignal(signal);
          return error ? null : data;
        };
        if (input) return rpc(input.action as string);
        const status = await rpc('status'); if (!status || signal.aborted) return null;
        const notice = program ? await rpc('notice') : null;
        return { ...status, notice, ownerId: actor };
      });
      if (!result || signal.aborted) return unavailable();
      if (request.method === 'GET' && result.notice && (!Number.isSafeInteger(result.notice.expiresAtMs) || result.notice.expiresAtMs <= Date.now())) result.notice = null;
      return json(result);
    }, request.signal);
  } catch { return unavailable(); }
}
