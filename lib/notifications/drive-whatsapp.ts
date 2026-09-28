import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

type Environment = Record<string, string | undefined>;
export type OutboxItem = {
  id: string; token: string; phone: string; reference: string;
  audience: 'customer' | 'operations'; action: 'created' | 'review' | 'confirm' | 'decline' | 'customer_accept'; language: 'ar' | 'en';
};
export interface NotificationStore {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type SenderConfig = {
  accountSid: string; authToken: string; from: string; messagingServiceSid: string;
  callbackUrl: string; siteUrl: string; templates: Record<string, string>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SID = /^SM[0-9a-f]{32}$/i;
const PHONE = /^\+[1-9][0-9]{6,14}$/;
const ACTIONS = ['created', 'review', 'confirm', 'decline', 'customer_accept'];
const CALLBACK_PATH = '/api/webhooks/twilio/whatsapp';

export function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verificationConfig(env: Environment) {
  const accountSid = env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = env.TWILIO_AUTH_TOKEN ?? '';
  const from = env.DIR3COM_WHATSAPP_FROM ?? '';
  const callbackUrl = env.DIR3COM_WHATSAPP_CALLBACK_URL ?? '';
  try {
    const url = new URL(callbackUrl);
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || authToken.length < 32 || !PHONE.test(from)
      || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== CALLBACK_PATH) return null;
    return { accountSid, authToken, from, callbackUrl };
  } catch { return null; }
}

export function senderConfig(env: Environment): SenderConfig | null {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return null;
  const verification = verificationConfig(env);
  if (!verification || !/^MG[0-9a-f]{32}$/i.test(env.TWILIO_MESSAGING_SERVICE_SID ?? '')) return null;
  try {
    const site = new URL(env.DIR3COM_WHATSAPP_SITE_URL ?? '');
    if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return null;
    const templates: unknown = JSON.parse(env.DIR3COM_WHATSAPP_TEMPLATE_SIDS ?? '{}');
    if (!templates || typeof templates !== 'object' || Array.isArray(templates)) return null;
    // Require all approved templates before claiming anything; no free-text fallback.
    for (const audience of ['customer', 'operations']) {
      for (const action of audience === 'customer' ? ACTIONS : ['created', 'customer_accept']) {
        for (const language of ['ar', 'en']) {
          const sid = (templates as Record<string, unknown>)[`${audience}.${action}.${language}`];
          if (typeof sid !== 'string' || !/^HX[0-9a-f]{32}$/i.test(sid)) return null;
        }
      }
    }
    return { ...verification, messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!, siteUrl: site.origin, templates: templates as Record<string, string> };
  } catch { return null; }
}

export function parseOutboxItem(data: unknown): OutboxItem | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== 'string' || !UUID.test(row.id) || typeof row.token !== 'string' || !UUID.test(row.token)
    || typeof row.phone !== 'string' || !PHONE.test(row.phone) || typeof row.reference !== 'string' || !/^REQ-[A-Z0-9]{1,40}$/.test(row.reference)
    || !['customer', 'operations'].includes(String(row.audience)) || !['ar', 'en'].includes(String(row.language))
    || !ACTIONS.includes(String(row.action))
    || (row.audience === 'operations' && !['created', 'customer_accept'].includes(String(row.action)))) return null;
  return row as OutboxItem;
}

export function callbackUrl(config: Pick<SenderConfig, 'callbackUrl'>, item: Pick<OutboxItem, 'id' | 'token'>) {
  const url = new URL(config.callbackUrl);
  url.searchParams.set('id', item.id); url.searchParams.set('token', item.token);
  return url.toString();
}

export type SendResult = { outcome: 'accepted'; sid: string; error: null }
  | { outcome: 'retry' | 'failed' | 'unknown'; sid: null; error: string };

export async function sendTemplate(config: SenderConfig, item: OutboxItem, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const link = item.audience === 'customer' ? `/my-requests/${item.reference}/drive` : '/admin/operations/drive';
  const form = new URLSearchParams({
    From: `whatsapp:${config.from}`, To: `whatsapp:${item.phone}`, MessagingServiceSid: config.messagingServiceSid,
    ContentSid: config.templates[`${item.audience}.${item.action}.${item.language}`],
    ContentVariables: JSON.stringify({ '1': item.reference, '2': `${config.siteUrl}${link}?language=${item.language}` }),
    StatusCallback: callbackUrl(config, item),
  });
  try {
    const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const raw = await readLimitedBody(response, 32_768);
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { outcome: 'unknown', sid: null, error: 'INVALID_PROVIDER_RESPONSE' };
    const result = data as Record<string, unknown>;
    if (response.status === 201 && typeof result.sid === 'string' && SID.test(result.sid)
      && result.account_sid === config.accountSid && result.to === `whatsapp:${item.phone}` && result.from === `whatsapp:${config.from}`) {
      return { outcome: 'accepted', sid: result.sid, error: null };
    }
    // Only the documented Twilio concurrency rejection is known not to have sent.
    if (response.status === 429 && result.code === 20429 && !result.sid) return { outcome: 'retry', sid: null, error: 'TWILIO_20429' };
    if ([400, 401, 403, 404, 422].includes(response.status) && Number.isInteger(result.code) && !result.sid) {
      return { outcome: 'failed', sid: null, error: 'PROVIDER_REJECTED' };
    }
    return { outcome: 'unknown', sid: null, error: 'AMBIGUOUS_PROVIDER_RESPONSE' };
  } catch {
    // Includes response loss after acceptance. Never log body, contacts or tokens.
    return { outcome: 'unknown', sid: null, error: 'SEND_OUTCOME_UNKNOWN' };
  }
}

export async function dispatchOne(store: NotificationStore, config: SenderConfig, fetcher: typeof fetch = fetch) {
  const claim = await store.rpc('claim_drive_whatsapp');
  if (claim.error) throw new Error('OUTBOX_UNAVAILABLE');
  if (claim.data == null) return 'idle';
  const item = parseOutboxItem(claim.data);
  if (!item) throw new Error('INVALID_OUTBOX_ITEM');
  const start = await store.rpc('begin_drive_whatsapp', { p_id: item.id, p_token: item.token });
  if (start.error) throw new Error('OUTBOX_UNAVAILABLE');
  if (start.data !== true) return 'not_sent';
  const result = await sendTemplate(config, item, fetcher);
  const finished = await store.rpc('finish_drive_whatsapp', {
    p_id: item.id, p_token: item.token, p_outcome: result.outcome, p_sid: result.sid, p_error: result.error,
  });
  // Lost completion writes leave durable sending intent; expiry marks unknown, not pending.
  if (finished.error || finished.data !== true) throw new Error('RESULT_PERSISTENCE_UNCONFIRMED');
  return result.outcome;
}

export async function readLimitedBody(input: Pick<Request, 'body'>, limit = 16_384) {
  if (!input.body) return '';
  const reader = input.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function receiveReceipt(request: Request, env: Environment, getStore: () => NotificationStore | null): Promise<Response> {
  // Keep accepting authenticated receipts after the outbound kill switch is turned off.
  const config = verificationConfig(env);
  if (!config) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? ''; const token = url.searchParams.get('token') ?? '';
  if (url.pathname !== CALLBACK_PATH || !UUID.test(id) || !UUID.test(token)
    || url.search !== new URL(callbackUrl(config, { id, token })).search
    || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return Response.json({ error: 'INVALID_RECEIPT' }, { status: 400 });
  }
  let body: string;
  try { body = await readLimitedBody(request); } catch { return Response.json({ error: 'BODY_TOO_LARGE' }, { status: 413 }); }
  const fields = new URLSearchParams(body); const entries = [...fields.entries()];
  if (new Set(entries.map(([k]) => k)).size !== entries.length) return Response.json({ error: 'INVALID_RECEIPT' }, { status: 400 });
  // Twilio's documented form signature. Include ALL fields, including future fields.
  const payload = callbackUrl(config, { id, token }) + entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + v).join('');
  const expected = createHmac('sha1', config.authToken).update(payload).digest('base64');
  const supplied = request.headers.get('x-twilio-signature') ?? '';
  if (!secureEqual(expected, supplied)) return Response.json({ error: 'INVALID_SIGNATURE' }, { status: 403 });
  const sid = fields.get('MessageSid') ?? ''; const state = fields.get('MessageStatus') ?? '';
  const to = fields.get('To') ?? ''; const error = fields.get('ErrorCode') || null;
  if (fields.get('AccountSid') !== config.accountSid || fields.get('From') !== `whatsapp:${config.from}`
    || !to.startsWith('whatsapp:') || !PHONE.test(to.slice(9)) || !SID.test(sid)
    || !['accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered'].includes(state)
    || (error !== null && !/^\d{1,8}$/.test(error))) return Response.json({ error: 'INVALID_RECEIPT' }, { status: 400 });
  try {
    const store = getStore();
    if (!store) return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    const recorded = await store.rpc('record_drive_whatsapp_receipt', {
      p_id: id, p_token: token, p_sid: sid, p_phone: to.slice(9), p_state: state, p_error: error,
    });
    if (recorded.error) return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    if (recorded.data !== true) return Response.json({ error: 'RECEIPT_NOT_MATCHED' }, { status: 409 });
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }); }
}

export async function handleDispatch(request: Request, env: Environment, getStore: () => NotificationStore | null, fetcher: typeof fetch = fetch) {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return Response.json({ error: 'DISABLED' }, { status: 404 });
  const secret = env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
  if (secret.length < 32 || !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const config = senderConfig(env);
  if (!config) return Response.json({ error: 'PROVIDER_NOT_CONFIGURED' }, { status: 503 });
  try {
    const store = getStore();
    if (!store) return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    return Response.json({ result: await dispatchOne(store, config, fetcher) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'DISPATCH_UNCONFIRMED' }, { status: 503 }); }
}
