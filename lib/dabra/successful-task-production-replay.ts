import 'server-only';
import type { NextRequest } from 'next/server';
import { resolveAgentContext } from './agent-context';
import { publicDialogueActor } from './public-dialogue-policy';
import { isAgentTaskAuthorityCurrent } from './agent-dialogue';
import { boundedSuccessfulTaskOperation } from './successful-task-lifecycle';
import { readSuccessfulTaskProductionPolicy, type SuccessfulTaskProductionPolicy, selectSuccessfulTaskPilot } from './successful-task-production-policy';
import { selectSuccessfulTaskPolicy, resolveSuccessfulTaskCoreDecisions } from './successful-task-core-decisions';
import { interpretSuccessfulTaskDecisions } from './successful-task-decision-contract';
import { supabaseAdmin, getSupabaseAdminHostname } from '../supabase/server';
import { isCredentialBindingCoreProject } from './credential-binding';
import { CEO_USER_ID } from '../auth/team-access';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
/** UUID is a lookup key, never identity, authority, freshness or a dispatch request. */
export async function successfulTaskProductionReplay(request: NextRequest, configured = readSuccessfulTaskProductionPolicy()): Promise<Response> {
  const unavailable = () => Response.json({ saved: false, error: 'Task unavailable.' }, { status: 503, headers });
  if (configured.kind !== 'configured' || !supabaseAdmin || request.signal.aborted) return unavailable();
  const program = configured.program;
  let policy: SuccessfulTaskProductionPolicy | null = null;
  const invalid = (status: number) => Response.json({ saved: false, error: 'Invalid request.' }, { status, headers });
  if (request.method !== 'POST' || request.headers.get('origin') !== request.nextUrl.origin
    || request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return invalid(403);
  if (request.nextUrl.search) return invalid(400);
  if (Number(request.headers.get('content-length') ?? 0) > 256) return invalid(413);
  try {
    return await boundedSuccessfulTaskOperation(async signal => {
      const reader = request.body?.getReader(); if (!reader) return invalid(400);
      let size = 0; const chunks: Uint8Array[] = [];
      let cancelled = false;
      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        // Closing the reader must not await an uncooperative source cancel.
        try { void reader.cancel().catch(() => {}); } catch { /* Already released/errored. */ }
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (signal.aborted) { cancel(); return unavailable(); }
        for (;;) {
          if (signal.aborted) return unavailable();
          const part = await reader.read();
          if (signal.aborted) return unavailable();
          if (part.done) break;
          size += part.value.length;
          if (size > 256) { cancel(); return invalid(413); }
          chunks.push(part.value);
        }
      } finally {
        signal.removeEventListener('abort', cancel);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return invalid(400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
        || !('requestId' in body) || typeof body.requestId !== 'string'
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) return invalid(400);
      const id = body.requestId;
      if (signal.aborted) return unavailable();
      const selection = await selectSuccessfulTaskPilot(request, configured);
      if (selection.kind !== 'pilot' || signal.aborted) return unavailable();
      if (program) policy = await selectSuccessfulTaskPolicy(request, program.revision);
      if (!policy || signal.aborted) return unavailable();
      const bundle = await resolveSuccessfulTaskCoreDecisions(request, policy);
      if (!bundle || bundle.actorId !== selection.actorId || bundle.role !== selection.role || !interpretSuccessfulTaskDecisions(bundle) || signal.aborted) return unavailable();
      const context = await resolveAgentContext(request), actor = publicDialogueActor(context);
      if (actor !== bundle.actorId || !(context.role === bundle.role
        || (context.role === 'ceo' && bundle.role === 'admin' && actor === CEO_USER_ID))) return unavailable();
      const authority = context.isTaskAuthorityCurrent, project = context.isDialogueFundingProjectCurrent;
      const snapshot = JSON.stringify([context.role, context.taskAuthority, context.successfulTaskOperationsBinding ?? null]);
      const operations = structuredClone(context.successfulTaskOperationsBinding ?? null);
      // Original callback may wait; Core is the final authority, not its truth value.
      const checked = { ...context, taskAuthority: structuredClone(context.taskAuthority), isTaskAuthorityCurrent: authority?.bind(context) };
      const current = () => !signal.aborted && isCredentialBindingCoreProject(getSupabaseAdminHostname())
        && context.isTaskAuthorityCurrent === authority && context.isDialogueFundingProjectCurrent === project
        && project?.call(context) === true && publicDialogueActor(context) === actor
        && JSON.stringify([context.role, context.taskAuthority, context.successfulTaskOperationsBinding ?? null]) === snapshot;
      if (context.taskAuthority?.kind === 'operator' && context.taskAuthority.country !== null
        && (!operations || operations.actorId !== actor || operations.country !== 'EG')) return unavailable();
      if (!current() || !await isAgentTaskAuthorityCurrent(checked, signal) || !current()) return unavailable();
      // The only final asynchronous boundary. The transaction obtains original
      // digest/FX expiry from the owner's row and uses the same locked read proof.
      const { data: row, error } = await supabaseAdmin!.rpc('retrieve_dabra_production_task', {
        p_actor_id: actor, p_request_id: id, p_actor_role: bundle.role, p_policy: policy,
        p_expected_decisions: { schema: 'dabra-successful-task-core-decisions-v1', purpose: 'dabra-successful-task', ...bundle },
        p_operations_binding: operations,
        p_continuity_enabled: process.env.DABRA_CONTINUITY_ENABLED === 'true',
      }).abortSignal(signal);
      const now = Date.now();
      if (error || !row || !current() || !Object.values(bundle.decisions).every(d => !!d && typeof d === 'object'
        && 'expiresAtMs' in d && typeof d.expiresAtMs === 'number' && d.expiresAtMs > now)) return unavailable();
      if (row.state === 'absent') return Response.json({ error: 'Task unavailable.' }, { status: 404, headers });
      if (row.state !== 'succeeded') return Response.json({ saved: false, state: ['pending','unknown','failed'].includes(row.state) ? row.state : 'unavailable' }, { status: 409, headers });
      if (typeof row.answer !== 'string' || !row.answer.trim() || row.answer.length > 64000 || !['ar','en'].includes(row.language)
        || !Number.isSafeInteger(row.expiresAtMs) || row.expiresAtMs <= now
        || !Object.hasOwn(row, 'tripValidUntilMs') || (row.tripValidUntilMs !== null
          && (!Number.isSafeInteger(row.tripValidUntilMs) || row.tripValidUntilMs <= now))
        || !Object.hasOwn(row, 'inputValidUntilMs') || (row.inputValidUntilMs !== null
          && (!Number.isSafeInteger(row.inputValidUntilMs) || row.inputValidUntilMs <= now)))
        return Response.json({ saved: false, state: 'expired' }, { status: 410, headers });
      return Response.json({ answer: row.answer, language: row.language, saved: true, replay: true }, { headers });
    }, request.signal);
  } catch { return unavailable(); }
}
