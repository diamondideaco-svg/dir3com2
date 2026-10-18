import 'server-only';
import { createHmac } from 'node:crypto';
import { secureEqual, type NotificationStore } from '@/lib/notifications/drive-whatsapp';
import { handleKapsoTargetDispatch, handleKapsoStop, kapsoConfig } from '@/lib/notifications/kapso-drive-whatsapp';
import { handleKapsoTargetReconcile } from '@/lib/notifications/kapso-provider-query';

// This operator is deliberately disposable. These are not browser inputs.
export const TRIAL = {
  reference: 'REQ-2B9F59690ED6D0A57098',
  requestId: '4e06f5e2-d26c-4785-a8cc-429da09ee8f0',
  outboxId: '06eacb8f-55ab-4e16-894b-db047e124e0b',
  recipientUserId: '5f72ea11-b5eb-4c3c-a611-5a37abde5409',
  category: 'operations.created', language: 'ar', sender: '1205896545944230',
  origin: 'https://www.dir3com.com', hostname: 'ynupwivgvwcyrsdhtkcc.supabase.co',
  cutoff: Date.parse('2026-10-18T15:39:00Z'),
} as const;
export const TRIAL_COOKIE = '__Secure-task199-trial';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type TrialResult = { code: string; stopped: boolean };
export type TrialContext = {
  authorize(): Promise<boolean>;
  env: Record<string, string | undefined>;
  hostname: string | null;
  store: NotificationStore | null;
  readTicket(): string | undefined;
  writeTicket(value: string, expires: Date): void;
  clearTicket(): void;
  readDelivery(): Promise<unknown>;
  now(): number;
};
const target = () => ({ requestId: TRIAL.requestId, outboxId: TRIAL.outboxId,
  recipientUserId: TRIAL.recipientUserId, category: TRIAL.category, language: TRIAL.language });
function signature(body: string, secret: string) {
  return createHmac('sha256', secret).update('task199-operator-v1:' + JSON.stringify(target()) + ':' + body).digest('hex');
}
function ticket(value: string | undefined, secret: string) {
  if (!value || value.length > 200) return null;
  const [id, rawExpiry, mac, extra] = value.split('.');
  if (extra !== undefined || !UUID.test(id ?? '') || !/^\d{13}$/.test(rawExpiry ?? '') || !/^[a-f0-9]{64}$/.test(mac ?? '')) return null;
  const expires = Number(rawExpiry);
  if (expires > TRIAL.cutoff || !secureEqual(mac, signature(id + '.' + rawExpiry, secret))) return null;
  return { id, expires };
}
function internal(path: string, body: unknown, secret: string) {
  return new Request(TRIAL.origin + '/api/internal/drive-whatsapp/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: JSON.stringify(body),
  });
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
async function stop(ctx: TrialContext, windowId: string, secret: string): Promise<boolean> {
  const response = await handleKapsoStop(internal('stop', { windowId }, secret), ctx.env, () => ctx.store);
  const result = object((await response.json()).result);
  if (!response.ok || result?.window_id !== windowId) return false;
  ctx.clearTicket();
  return true;
}
async function delivery(ctx: TrialContext) {
  const rows = await ctx.readDelivery();
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = object(rows[0]);
  // Only the single provisioned Operations row may constitute trial evidence.
  return row?.audience === 'operations' && row.attempts === 1 && typeof row.state === 'string' ? row.state : null;
}
export async function runTask199Trial(operation: unknown, origin: string | null, ctx: TrialContext): Promise<TrialResult> {
  const result = (code: string, stopped = false) => ({ code, stopped });
  let cleanup: { id: string; secret: string } | null = null;
  try {
    if (origin !== TRIAL.origin) return result('ORIGIN_REJECTED');
    if (!(await ctx.authorize())) return result('FORBIDDEN');
    if (operation !== 'start' && operation !== 'dispatch' && operation !== 'reconcile' && operation !== 'stop') return result('INVALID_OPERATION');
    if (ctx.env.VERCEL_ENV !== 'production' || ctx.hostname !== TRIAL.hostname || !ctx.store) return result('RUNTIME_REJECTED');
    const secret = ctx.env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
    if (secret.length < 32 || secret.length > 512) return result('WORKER_CONFIGURATION_REQUIRED');
    const existing = ticket(ctx.readTicket(), secret);
    if (existing) cleanup = { id: existing.id, secret };
    if (operation === 'stop') return existing ? result('STOP', await stop(ctx, existing.id, secret)) : result('NO_WINDOW');
    if (ctx.now() >= TRIAL.cutoff) {
      return result('ACCESS_EXPIRED', existing ? await stop(ctx, existing.id, secret) : false);
    }
    const config = kapsoConfig(ctx.env);
    if (!config || config.deliveryMode !== 'provider_query' || config.phoneNumberId !== TRIAL.sender
      || ctx.env.DIR3COM_WHATSAPP_DISPATCH_MODE !== 'target_only'
      || ctx.env.DIR3COM_WHATSAPP_CATEGORIES !== TRIAL.category
      || config.templates['operations.created.ar']?.name !== 'dir3com_operations_created_ar'
      || config.templates['operations.created.ar']?.languageCode !== 'ar'
      || config.siteUrl !== 'https://dir3com.com') return result('KAPSO_CONFIGURATION_REQUIRED');
    if (operation === 'start') {
      if (existing) return result('WINDOW_ALREADY_ASSIGNED');
      const expires = Math.min(ctx.now() + 9 * 60_000, TRIAL.cutoff);
      const opened = await ctx.store.rpc('open_kapso_drive_whatsapp_provider_query_window', {
        p_request_id: TRIAL.requestId, p_outbox_id: TRIAL.outboxId, p_recipient_user_id: TRIAL.recipientUserId,
        p_category: TRIAL.category, p_language: TRIAL.language, p_phone_number_id: TRIAL.sender,
        p_approval_reference: 'Task199-20261018-1830', p_expires_at: new Date(expires).toISOString(),
      });
      if (opened.error || typeof opened.data !== 'string' || !UUID.test(opened.data)) return result('START_UNCONFIRMED');
      cleanup = { id: opened.data, secret };
      const body = opened.data + '.' + expires;
      // A MAC binds the server-created window to this immutable tuple. No worker
      // credential, WAMID, contact, arbitrary target or URL reaches the browser.
      ctx.writeTicket(body + '.' + signature(body, secret), new Date(TRIAL.cutoff + 86_400_000));
      return result('WINDOW_OPEN');
    }
    if (!existing) return result('NO_WINDOW');
    if (existing.expires <= ctx.now()) return result('WINDOW_EXPIRED', await stop(ctx, existing.id, secret));
    const response = operation === 'dispatch'
      ? await handleKapsoTargetDispatch(internal('dispatch-target', target(), secret), ctx.env, () => ctx.store)
      : await handleKapsoTargetReconcile(internal('reconcile-target', target(), secret), ctx.env, () => ctx.store);
    // Do not serialize the existing handler's raw response: reconcile includes
    // a private WAMID. Only bounded result codes and persisted state leave here.
    const payload: unknown = await response.json();
    const record = object(payload);
    if (!response.ok || (operation === 'dispatch' && record?.result !== 'accepted' && record?.result !== 'idle')) {
      return result('EXECUTION_UNCONFIRMED', await stop(ctx, existing.id, secret));
    }
    const state = await delivery(ctx);
    if (state === 'delivered' || state === 'read' || state === 'failed' || state === 'undelivered' || state === 'unknown') {
      return result(state.toUpperCase(), await stop(ctx, existing.id, secret));
    }
    if (operation === 'dispatch') return result(record?.result === 'accepted' ? 'ACCEPTED_NOT_DELIVERED' : 'IDLE_NO_RESEND');
    return result(record?.result === 'recorded' ? 'OBSERVATION_RECORDED_NOT_DELIVERED' : 'OBSERVATION_UNCONFIRMED');
  } catch {
    // A lost observation must not leave sending enabled. Preserve the ticket
    // for explicit cleanup if the stop transaction is itself unconfirmed.
    if (cleanup) {
      try { return result('UNCONFIRMED', await stop(ctx, cleanup.id, cleanup.secret)); }
      catch { /* Never expose an exception, credential or private provider data. */ }
    }
    return result('UNCONFIRMED_USE_STOP');
  }
}
