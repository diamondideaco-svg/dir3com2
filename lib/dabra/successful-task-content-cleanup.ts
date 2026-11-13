import 'server-only';
import { supabaseAdmin, getSupabaseAdminHostname } from '../supabase/server';
import { isCredentialBindingCoreProject } from './credential-binding';
import { boundedSuccessfulTaskOperation } from './successful-task-lifecycle';
import { readSuccessfulTaskCleanupAuthorization } from './successful-task-cleanup-config';

type CleanupResult = { kind: 'disabled' | 'invalid' | 'unavailable' | 'unknown' }
  | { kind: 'completed'; removed: number };

/** One server-worker invocation, one bounded batch, no retries or drain loop.
 * Core alone determines expiry from original stored deadlines and atomically
 * removes content while retaining accounting/tombstones. No account deletion,
 * consent revocation, metadata expiry or retention duration is inferred here.
 * A timeout/lost reply may follow a committed batch: unknown is not zero removed.
 * No route, schedule or operational cadence is installed by this entrypoint.
 */
export async function runSuccessfulTaskContentCleanup(limit: number, signal: AbortSignal): Promise<CleanupResult> {
  if (readSuccessfulTaskCleanupAuthorization() !== 'stored-deadline-content-only') return { kind: 'disabled' };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return { kind: 'invalid' };
  const client = supabaseAdmin;
  // The admin accessor captures this singleton's constructor configuration; the
  // session-client WeakMap does not contain the admin client. Keep both fences.
  const current = () => !!client && client === supabaseAdmin
    && isCredentialBindingCoreProject(getSupabaseAdminHostname());
  if (signal.aborted || !current()) return { kind: 'unavailable' };
  let attempted = false;
  try {
    return await boundedSuccessfulTaskOperation(async bounded => {
      if (bounded.aborted || !current()) return { kind: 'unavailable' } as const;
      attempted = true;
      const { data, error } = await client!.rpc('purge_dabra_production_task_content', { p_limit: limit }).abortSignal(bounded);
      if (bounded.aborted || !current() || error || !Number.isSafeInteger(data) || data < 0 || data > limit) return { kind: 'unknown' } as const;
      return { kind: 'completed', removed: data } as const;
    }, signal);
  } catch { return { kind: attempted ? 'unknown' : 'unavailable' }; }
}
