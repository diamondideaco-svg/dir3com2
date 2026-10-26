import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { parseOutboxItem, parseOutboxEnvelope, readLimitedBody, secureEqual, type NotificationStore, type OutboxItem, type OutboxEnvelope, type SendResult } from './drive-whatsapp';

type Environment = Record<string, string | undefined>;
type Template = { name: string; languageCode: string; bodyParameterNames?: [string, string] };
export type KapsoOutboxItem = OutboxItem | (OutboxEnvelope & { action: 'current_state' });
export type KapsoCategory = 'operations.created' | `customer.${OutboxItem['action']}` | 'customer.current_state' | 'operations.current_state';
const CATEGORIES: readonly KapsoCategory[] = ['operations.created', 'customer.created', 'customer.review', 'customer.confirm', 'customer.decline', 'customer.customer_accept', 'customer.current_state', 'operations.current_state'];
export function parseKapsoOutboxItem(value: unknown): KapsoOutboxItem | null {
  const lifecycle = parseOutboxItem(value);
  if (lifecycle) return lifecycle;
  const row = object(value);
  if (row?.action !== 'current_state') return null;
  const fields = parseOutboxEnvelope(row);
  return fields ? { ...fields, action: 'current_state' } : null;
}
type KapsoSender = { apiKey: string; phoneNumberId: string; siteUrl: string; templates: Partial<Record<`${KapsoCategory}.${'ar' | 'en'}`, Template>> };
export type KapsoConfig = KapsoSender & (
  { deliveryMode: 'webhook'; webhookSecret: string } | { deliveryMode: 'provider_query' }
);
const PATH = '/api/webhooks/kapso/drive-whatsapp';
const MESSAGE_ID = /^wamid\.[A-Za-z0-9_+/=-]{1,250}$/;
const TARGET_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type KapsoRecoveryPair = Readonly<{ outboxId: string; messageId: string }>;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
// Dedicated identifier-only contract on the existing server console destination.
// No generic sanitizer changes: lossless identifiers are permitted only by this boundary.
// Deployment still requires separate evidence of actual log access and retention.
export function logKapsoRecovery(value: unknown): void {
  try {
    const candidate = object(value);
    if (!candidate || typeof candidate.outboxId !== 'string' || !TARGET_UUID.test(candidate.outboxId)
      || typeof candidate.messageId !== 'string' || !MESSAGE_ID.test(candidate.messageId)) return;
    const pair: KapsoRecoveryPair = { outboxId: candidate.outboxId, messageId: candidate.messageId };
    console.error('DRIVE_WHATSAPP_RECOVERY', pair);
  } catch { /* Logging is best effort and cannot change send intent or enable a retry. */ }
}
export function receiptConfig(env: Environment) {
  const phoneNumberId = env.KAPSO_PHONE_NUMBER_ID ?? '';
  const webhookSecret = env.KAPSO_WEBHOOK_SECRET ?? '';
  return /^[0-9]{5,32}$/.test(phoneNumberId) && webhookSecret.length >= 32 && webhookSecret.length <= 512
    ? { phoneNumberId, webhookSecret } : null;
}
export type KapsoConfigRejection =
  | 'KAPSO_CONFIG_ENABLED_REQUIRED'
  | 'KAPSO_CONFIG_CATEGORIES_REJECTED'
  | 'KAPSO_CONFIG_DELIVERY_MODE_REJECTED'
  | 'KAPSO_CONFIG_QUERY_SCOPE_REJECTED'
  | 'KAPSO_CONFIG_STATE_SCOPE_REJECTED'
  | 'KAPSO_CONFIG_SENDER_FORMAT_REJECTED'
  | 'KAPSO_CONFIG_WEBHOOK_RECEIPT_REQUIRED'
  | 'KAPSO_CONFIG_API_KEY_MISSING'
  | 'KAPSO_CONFIG_API_KEY_REJECTED'
  | 'KAPSO_CONFIG_SITE_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_JSON_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_MAP_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_KEY_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_ENTRY_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_PARAMETERS_REJECTED'
  | 'KAPSO_CONFIG_TEMPLATE_CATEGORY_MISSING';
export function kapsoConfig(env: Environment, onReject?: (code: KapsoConfigRejection) => void): KapsoConfig | null {
  // Optional observer receives fixed reason codes only; the existing acceptance predicates remain authoritative.
  const reject = (code: KapsoConfigRejection): null => { onReject?.(code); return null; };
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return reject('KAPSO_CONFIG_ENABLED_REQUIRED');
  // Exact explicit categories only; absence, duplicates and unknown categories fail closed.
  const categories = (env.DIR3COM_WHATSAPP_CATEGORIES ?? '').split(',');
  if (new Set(categories).size !== categories.length || categories.some(key => !CATEGORIES.includes(key as KapsoCategory))) return reject('KAPSO_CONFIG_CATEGORIES_REJECTED');
  const deliveryMode = env.DIR3COM_WHATSAPP_DELIVERY_MODE ?? 'webhook';
  if (deliveryMode !== 'webhook' && deliveryMode !== 'provider_query') return reject('KAPSO_CONFIG_DELIVERY_MODE_REJECTED');
  if (categories.some(category => category.endsWith('.current_state')) && (deliveryMode !== 'webhook'
    || env.DIR3COM_WHATSAPP_DISPATCH_MODE !== 'target_only' || categories.some(category => !category.endsWith('.current_state')))) return reject('KAPSO_CONFIG_STATE_SCOPE_REJECTED');
  // Query delivery is an explicit single-Operations-target mode, never a queue fallback.
  if (deliveryMode === 'provider_query' && (env.DIR3COM_WHATSAPP_DISPATCH_MODE === 'general'
    || categories.length !== 1 || categories[0] !== 'operations.created')) return reject('KAPSO_CONFIG_QUERY_SCOPE_REJECTED');
  const phoneNumberId = env.KAPSO_PHONE_NUMBER_ID ?? '';
  const receipt = deliveryMode === 'webhook' ? receiptConfig(env) : null;
  const apiKey = env.KAPSO_API_KEY ?? '';
  if (!/^[0-9]{5,32}$/.test(phoneNumberId)) return reject('KAPSO_CONFIG_SENDER_FORMAT_REJECTED');
  if (deliveryMode === 'webhook' && !receipt) return reject('KAPSO_CONFIG_WEBHOOK_RECEIPT_REQUIRED');
  if (apiKey === '') return reject('KAPSO_CONFIG_API_KEY_MISSING');
  if (apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey)) return reject('KAPSO_CONFIG_API_KEY_REJECTED');
  let parsingSite = true;
  try {
    const site = new URL(env.DIR3COM_WHATSAPP_SITE_URL ?? '');
    if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return reject('KAPSO_CONFIG_SITE_REJECTED');
    parsingSite = false;
    const values = object(JSON.parse(env.DIR3COM_WHATSAPP_KAPSO_TEMPLATES ?? '{}'));
    if (!values || Object.keys(values).length === 0) return reject('KAPSO_CONFIG_TEMPLATE_MAP_REJECTED');
    const templates: KapsoConfig['templates'] = {};
    for (const [key, value] of Object.entries(values)) {
      const category = key.slice(0, key.lastIndexOf('.'));
      if (!categories.includes(category) || !['ar', 'en'].includes(key.slice(key.lastIndexOf('.') + 1))) return reject('KAPSO_CONFIG_TEMPLATE_KEY_REJECTED');
      const entry = object(value);
      const language = key.endsWith('.ar') ? 'ar' : 'en';
      if (!entry || typeof entry.name !== 'string' || !/^[a-z][a-z0-9_]{0,511}$/.test(entry.name)
        || typeof entry.languageCode !== 'string' || !(language === 'ar' ? ['ar'] : ['en', 'en_US', 'en_GB']).includes(entry.languageCode)
        || Object.keys(entry).some(k => !['name', 'languageCode', 'bodyParameterNames'].includes(k))) return reject('KAPSO_CONFIG_TEMPLATE_ENTRY_REJECTED');
      const names = entry.bodyParameterNames;
      if (names !== undefined && (!Array.isArray(names) || names.length !== 2 || names.some(n => typeof n !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(n)) || names[0] === names[1])) return reject('KAPSO_CONFIG_TEMPLATE_PARAMETERS_REJECTED');
      templates[key as keyof typeof templates] = { name: entry.name, languageCode: entry.languageCode,
        ...(Array.isArray(names) ? { bodyParameterNames: [names[0], names[1]] as [string, string] } : {}) };
    }
    if (categories.some(category => !Object.keys(templates).some(key => key.startsWith(`${category}.`)))) return reject('KAPSO_CONFIG_TEMPLATE_CATEGORY_MISSING');
    const sender = { phoneNumberId, apiKey, siteUrl: site.origin, templates };
    return deliveryMode === 'webhook' && receipt
      ? { ...sender, deliveryMode, webhookSecret: receipt.webhookSecret }
      : { ...sender, deliveryMode: 'provider_query' };
  } catch { return reject(parsingSite ? 'KAPSO_CONFIG_SITE_REJECTED' : 'KAPSO_CONFIG_TEMPLATE_JSON_REJECTED'); }
}
export async function bodyBytes(message: Request | Response, limit: number, signal?: AbortSignal): Promise<Buffer> {
  if (!message.body) return Buffer.alloc(0);
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await beforeDeadline(reader.read(), signal);
      if (part.done) return Buffer.concat(chunks, length);
      length += part.value.byteLength;
      if (length > limit) { void reader.cancel().catch(() => {}); throw new Error('BODY_LIMIT'); }
      chunks.push(part.value);
    }
  } finally {
    if (signal?.aborted) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* Cancellation may still own a pending read. */ }
  }
}
// Bound the whole callback, including slow bodies and database transport. A late
// commit is safe: delivery ingestion is transactional and semantically deduplicated.
export function beforeDeadline<T>(value: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(value);
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('CALLBACK_DEADLINE')); };
    if (signal.aborted) { void Promise.resolve(value).catch(() => {}); reject(new Error('CALLBACK_DEADLINE')); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then(result => { signal.removeEventListener('abort', abort); resolve(result); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
function configuredTemplate(config: KapsoConfig, item: KapsoOutboxItem) {
  const category = `${item.audience}.${item.action}`;
  if (!CATEGORIES.includes(category as KapsoCategory)) return undefined;
  return config.templates[`${category}.${item.language}` as keyof KapsoConfig['templates']];
}
export async function sendKapsoTemplate(config: KapsoConfig, item: KapsoOutboxItem, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const template = configuredTemplate(config, item);
  if (!parseKapsoOutboxItem(item) || !template) return { outcome: 'failed', sid: null, error: 'CATEGORY_NOT_CONFIGURED' };
  const to = item.phone.slice(1);
  try {
    const response = await fetcher(`https://api.kapso.ai/meta/whatsapp/v24.0/${config.phoneNumberId}/messages`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
        template: { name: template.name, language: { code: template.languageCode }, components: [{ type: 'body', parameters: [
          { type: 'text', text: item.reference, ...(template.bodyParameterNames ? { parameter_name: template.bodyParameterNames[0] } : {}) },
          { type: 'text', text: `${config.siteUrl}${item.audience === 'customer' ? `/my-requests/${item.reference}/drive` : '/admin/operations/drive'}?language=${item.language}`, ...(template.bodyParameterNames ? { parameter_name: template.bodyParameterNames[1] } : {}) },
        ] }] } }),
    });
    const result = object(JSON.parse((await bodyBytes(response, 32_768)).toString('utf8')));
    const messages = result?.messages; const contacts = result?.contacts;
    const message = Array.isArray(messages) && messages.length === 1 ? object(messages[0]) : null;
    const contact = Array.isArray(contacts) && contacts.length === 1 ? object(contacts[0]) : null;
    if (response.status === 200 && result?.messaging_product === 'whatsapp' && !result.error
      && typeof message?.id === 'string' && MESSAGE_ID.test(message.id) && contact?.wa_id === to && contact.input === to
      && (message.message_status === undefined || ['accepted', 'held_for_quality_assessment'].includes(String(message.message_status)))) {
      return { outcome: 'accepted', sid: message.id, error: null };
    }
    // No Kapso rejection is assumed safe to retry. This includes 429 and 5xx.
    return { outcome: 'unknown', sid: null, error: 'SEND_OUTCOME_UNKNOWN' };
  } catch { return { outcome: 'unknown', sid: null, error: 'SEND_OUTCOME_UNKNOWN' }; }
}
export async function dispatchKapsoOne(store: NotificationStore, config: KapsoConfig, fetcher: typeof fetch = fetch) {
  if (config.deliveryMode === 'provider_query') return 'not_sent';
  const claim = await store.rpc('claim_kapso_drive_whatsapp', { p_template_keys: Object.keys(config.templates) });
  if (claim.error) throw new Error('CLAIM_FAILED');
  if (claim.data === null) return 'idle';
  const item = parseOutboxItem(claim.data);
  if (!item) throw new Error('INVALID_CLAIM');
  return dispatchClaimedKapso(store, config, item, fetcher);
}
async function dispatchClaimedKapso(store: NotificationStore, config: KapsoConfig, item: KapsoOutboxItem, fetcher: typeof fetch) {
  const template = configuredTemplate(config, item);
  if (!template) return 'not_sent';
  const start = item.action === 'current_state'
    ? await store.rpc('begin_kapso_current_state_notice', { p_id: item.id, p_token: item.token, p_phone_number_id: config.phoneNumberId, p_template: template })
    : await store.rpc(config.deliveryMode === 'provider_query'
    ? 'begin_kapso_drive_whatsapp_provider_query' : 'begin_kapso_drive_whatsapp',
  { p_id: item.id, p_token: item.token, p_phone_number_id: config.phoneNumberId });
  if (start.error) throw new Error('SEND_INTENT_UNCONFIRMED');
  if (start.data !== true) return 'not_sent';
  const result = await sendKapsoTemplate(config, item, fetcher);
  try {
    const finished = await store.rpc('finish_drive_whatsapp', { p_id: item.id, p_token: item.token, p_outcome: result.outcome, p_sid: result.sid, p_error: result.error });
    if (finished.error || finished.data !== true) throw new Error('RESULT_PERSISTENCE_UNCONFIRMED');
  } catch {
    if (result.outcome === 'accepted' && result.sid !== null) logKapsoRecovery({ outboxId: item.id, messageId: result.sid });
    throw new Error('RESULT_PERSISTENCE_UNCONFIRMED');
  }
  return result.outcome;
}
export type KapsoTarget = {
  requestId: string; outboxId: string; recipientUserId: string; category: KapsoCategory; language: 'ar' | 'en';
};
export function parseKapsoTarget(value: unknown): KapsoTarget | null {
  const target = object(value);
  if (!target || Object.keys(target).length !== 5
    || typeof target.requestId !== 'string' || !TARGET_UUID.test(target.requestId)
    || typeof target.outboxId !== 'string' || !TARGET_UUID.test(target.outboxId)
    || typeof target.recipientUserId !== 'string' || !TARGET_UUID.test(target.recipientUserId)
    || (target.language !== 'ar' && target.language !== 'en')) return null;
  const category = CATEGORIES.find(category => category === target.category);
  if (!category) return null;
  return { requestId: target.requestId, outboxId: target.outboxId, recipientUserId: target.recipientUserId, category, language: target.language };
}
export async function dispatchKapsoTarget(store: NotificationStore, config: KapsoConfig, target: KapsoTarget, fetcher: typeof fetch = fetch) {
  if (!parseKapsoTarget(target)) throw new Error('INVALID_TARGET');
  if (!config.templates[`${target.category}.${target.language}`]) return 'not_sent';
  const claim = await store.rpc('claim_kapso_drive_whatsapp_target', {
    p_request_id: target.requestId, p_outbox_id: target.outboxId, p_recipient_user_id: target.recipientUserId,
    p_category: target.category, p_language: target.language,
  });
  if (claim.error) throw new Error('CLAIM_FAILED');
  if (claim.data === null) return 'idle';
  const item = parseKapsoOutboxItem(claim.data);
  const identity = object(claim.data);
  if (!item || item.id !== target.outboxId || identity?.request_id !== target.requestId
    || identity.recipient_user_id !== target.recipientUserId || `${item.audience}.${item.action}` !== target.category
    || item.language !== target.language) throw new Error('TARGET_MISMATCH');
  return dispatchClaimedKapso(store, config, item, fetcher);
}
export async function handleKapsoTargetDispatch(request: Request, env: Environment, getStore: () => NotificationStore | null, fetcher: typeof fetch = fetch) {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return Response.json({ error: 'DISABLED' }, { status: 404 });
  const secret = env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
  if (secret.length < 32 || !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'INVALID_TARGET' }, { status: 400 });
  const config = kapsoConfig(env);
  if (!config) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  let target: KapsoTarget | null;
  try { target = parseKapsoTarget(JSON.parse(await readLimitedBody(request, 2048))); }
  catch { return Response.json({ error: 'INVALID_TARGET' }, { status: 400 }); }
  if (!target) return Response.json({ error: 'INVALID_TARGET' }, { status: 400 });
  try {
    const store = getStore();
    if (!store) return Response.json({ error: 'STORE_UNAVAILABLE' }, { status: 503 });
    return Response.json({ result: await dispatchKapsoTarget(store, config, target, fetcher) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'DISPATCH_UNCONFIRMED' }, { status: 503 }); }
}
export async function handleKapsoDispatch(request: Request, env: Environment, getStore: () => NotificationStore | null, fetcher: typeof fetch = fetch) {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true' || env.DIR3COM_WHATSAPP_DISPATCH_MODE !== 'general') return Response.json({ error: 'DISABLED' }, { status: 404 });
  const secret = env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
  if (secret.length < 32 || !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const config = kapsoConfig(env);
  if (!config) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  try {
    const store = getStore();
    if (!store) return Response.json({ error: 'STORE_UNAVAILABLE' }, { status: 503 });
    return Response.json({ result: await dispatchKapsoOne(store, config, fetcher) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: 'DISPATCH_UNCONFIRMED' }, { status: 503 }); }
}
export async function receiveKapsoReceipt(request: Request, env: Environment, getStore: () => NotificationStore | null, timeoutMs = 6000) {
  const config = receiptConfig(env);
  if (!config) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), Math.max(1, Math.min(timeoutMs, 6000)));
  try {
    const url = new URL(request.url);
    if (url.pathname !== PATH || url.search || request.method !== 'POST'
      || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return new Response(null, { status: 400 });
    const raw = await bodyBytes(request, 32_768, deadline.signal);
    const signature = request.headers.get('x-webhook-signature') ?? '';
    if (!/^[a-f0-9]{64}$/.test(signature) || !secureEqual(signature, createHmac('sha256', config.webhookSecret).update(raw).digest('hex'))) return new Response(null, { status: 403 });
    const payload = object(JSON.parse(raw.toString('utf8')));
    const message = object(payload?.message); const kapso = object(message?.kapso);
    const state = kapso?.status;
    // The event header is not signed. State comes exclusively from the signed body.
    if (payload?.phone_number_id !== config.phoneNumberId || !message || typeof message.id !== 'string' || !MESSAGE_ID.test(message.id)
      || kapso?.direction !== 'outbound' || kapso.passive === true || !['sent', 'delivered', 'read', 'failed'].includes(String(state))
      || typeof message.to !== 'string' || !/^[1-9][0-9]{6,14}$/.test(message.to)) return new Response(null, { status: 400 });
    const store = getStore();
    if (!store) return new Response(null, { status: 503 });
    const deliveryKey = request.headers.get('x-idempotency-key');
    // Opaque delivery identifier, not a credential or an authorization decision.
    if (deliveryKey !== null && !/^[\x21-\x7e]{1,512}$/.test(deliveryKey)) return new Response(null, { status: 400 });
    if (deadline.signal.aborted) return new Response(null, { status: 503 });
    const call = store.rpc('ingest_kapso_drive_whatsapp_receipt', {
      p_sid: message.id, p_phone_number_id: config.phoneNumberId, p_phone: '+' + message.to, p_state: state,
      p_error: state === 'failed' ? 'KAPSO_DELIVERY_FAILED' : null,
      p_delivery_key_hash: deliveryKey === null ? null : createHash('sha256').update(deliveryKey).digest('hex'),
    });
    const result = await beforeDeadline(call.abortSignal ? call.abortSignal(deadline.signal) : call, deadline.signal);
    if (result.error) return new Response(null, { status: 503 });
    // 200 requires durable ingestion or exact existing WAMID correlation. An unbound
    // record is not delivery of the order until finish/reconciliation matches its WAMID.
    return new Response(null, { status: result.data === true ? 200 : 409 });
  } catch { return new Response(null, { status: deadline.signal.aborted ? 503 : 400 }); }
  finally { clearTimeout(timer); }
}


// An authenticated operator/watchdog may close a window. This never calls Kapso or
// claims that webhook deliveries stopped: deactivation_required must be reconciled
// by the separately authorized provider operator.
export async function handleKapsoStop(request: Request, env: Environment, getStore: () => NotificationStore | null) {
  const secret = env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
  if (secret.length < 32 || !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'INVALID_STOP' }, { status: 400 });
  try {
    const target = object(JSON.parse(await readLimitedBody(request, 1024)));
    if (!target || Object.keys(target).length !== 1 || typeof target.windowId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(target.windowId)) return Response.json({ error: 'INVALID_STOP' }, { status: 400 });
    const store = getStore(); if (!store) return Response.json({ error: 'STORE_UNAVAILABLE' }, { status: 503 });
    const result = await store.rpc('stop_kapso_drive_whatsapp_window', { p_window_id: target.windowId, p_reason: 'manual' });
    if (result.error) return Response.json({ error: 'STOP_UNCONFIRMED' }, { status: 503 });
    return Response.json({ result: result.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'STOP_UNCONFIRMED' }, { status: 503 }); }
}
