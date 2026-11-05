import 'server-only';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerEvent } from '@/lib/security/safe-logger';
import { handleKapsoDispatch } from './kapso-drive-whatsapp';

type WakeContext = {
  env: Parameters<typeof handleKapsoDispatch>[1];
  getStore: Parameters<typeof handleKapsoDispatch>[2];
  fetcher: typeof fetch;
  now(): number;
};
type WakeCode = 'SCHEDULING_UNAVAILABLE' | 'GATED' | 'ELAPSED_BUDGET'
  | 'ACCEPTED_NOT_DELIVERED' | 'IDLE' | 'NOT_SENT' | 'FAILED_NO_RETRY'
  | 'UNKNOWN_DO_NOT_RETRY' | 'UNCONFIRMED_DO_NOT_RETRY';

// Admission budget only: never extend Next/Vercel maxDuration. In-flight DB
// work still depends on the platform deadline; interrupted intents are not retried.
const WAKE_BUDGET_MS = 20_000;
const ATTEMPT_RESERVE_MS = 12_000;
function context(): WakeContext {
  return { env: process.env, getStore: () => supabaseAdmin, fetcher: fetch, now: () => performance.now() };
}
function record(code: WakeCode) {
  try { logServerEvent('drive.created_notification_wake', { code }); }
  catch { /* Diagnostics cannot change the committed request or send outcome. */ }
}
function createdMode(env: WakeContext['env']) {
  const categories = (env.DIR3COM_WHATSAPP_CATEGORIES ?? '').split(',');
  return env.DIR3COM_WHATSAPP_ENABLED === 'true'
    && env.DIR3COM_WHATSAPP_DISPATCH_MODE === 'continuous'
    && (env.DIR3COM_WHATSAPP_DELIVERY_MODE ?? 'webhook') === 'webhook'
    && categories.every(category => category === 'customer.created' || category === 'operations.created');
}

// This wakes the existing oldest-eligible-row dispatcher, not a request-targeted
// sender or durable scheduler. SQL remains the authority for each claim/begin.
export async function wakeCreatedDriveNotifications(ctx: WakeContext = context(), scheduledAt = ctx.now()): Promise<void> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!createdMode(ctx.env)) { record('GATED'); return; }
      const elapsed = ctx.now() - scheduledAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed + ATTEMPT_RESERVE_MS > WAKE_BUDGET_MS) {
        record('ELAPSED_BUDGET'); return;
      }
      // In-process only. Neither this Request nor its bearer leaves the server.
      // The existing handler still validates worker/config/store and all DB gates.
      const request = new Request('https://www.dir3com.com/api/internal/drive-whatsapp/dispatch', {
        method: 'POST', headers: { Authorization: `Bearer ${ctx.env.DIR3COM_WHATSAPP_WORKER_SECRET ?? ''}` },
      });
      const response = await handleKapsoDispatch(request, ctx.env, ctx.getStore, ctx.fetcher);
      if (!response.ok) { record('UNCONFIRMED_DO_NOT_RETRY'); return; }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('result' in payload)) {
        record('UNCONFIRMED_DO_NOT_RETRY'); return;
      }
      switch (payload.result) {
        case 'accepted': record('ACCEPTED_NOT_DELIVERED'); break;
        case 'idle': record('IDLE'); return;
        case 'not_sent': record('NOT_SENT'); return;
        case 'failed': record('FAILED_NO_RETRY'); return;
        case 'unknown': record('UNKNOWN_DO_NOT_RETRY'); return;
        default: record('UNCONFIRMED_DO_NOT_RETRY'); return;
      }
    }
  } catch { record('UNCONFIRMED_DO_NOT_RETRY'); }
}

export function scheduleCreatedDriveWake(): void {
  try {
    const ctx = context();
    const scheduledAt = ctx.now();
    after(() => wakeCreatedDriveNotifications(ctx, scheduledAt));
  } catch {
    // The business transaction already committed. Never turn an unavailable
    // post-response hook into a failed creation or a reason to retry its intent.
    record('SCHEDULING_UNAVAILABLE');
  }
}
