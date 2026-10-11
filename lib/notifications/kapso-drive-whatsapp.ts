import 'server-only';
import { createHmac } from 'node:crypto';
import { parseOutboxItem, secureEqual, type NotificationStore, type OutboxItem, type SendResult } from './drive-whatsapp';

type Environment = Record<string, string | undefined>;
type Template = { name: string; languageCode: string };
export type KapsoCategory = 'operations.created' | `customer.${OutboxItem['action']}`;
const CATEGORIES: readonly KapsoCategory[] = ['operations.created', 'customer.created', 'customer.review', 'customer.confirm', 'customer.decline', 'customer.customer_accept'];
export type KapsoConfig = { apiKey: string; phoneNumberId: string; webhookSecret: string; siteUrl: string; templates: Partial<Record<`${KapsoCategory}.${'ar' | 'en'}`, Template>> };
const PATH = '/api/webhooks/kapso/drive-whatsapp';
const MESSAGE_ID = /^wamid\.[A-Za-z0-9_+/=-]{1,250}$/;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function receiptConfig(env: Environment) {
  const phoneNumberId = env.KAPSO_PHONE_NUMBER_ID ?? '';
  const webhookSecret = env.KAPSO_WEBHOOK_SECRET ?? '';
  return /^[0-9]{5,32}$/.test(phoneNumberId) && webhookSecret.length >= 32 && webhookSecret.length <= 512
    ? { phoneNumberId, webhookSecret } : null;
}
export function kapsoConfig(env: Environment): KapsoConfig | null {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return null;
  // Exact explicit categories only; absence, duplicates and unknown categories fail closed.
  const categories = (env.DIR3COM_WHATSAPP_CATEGORIES ?? '').split(',');
  if (new Set(categories).size !== categories.length || categories.some(key => !CATEGORIES.includes(key as KapsoCategory))) return null;
  const receipt = receiptConfig(env);
  const apiKey = env.KAPSO_API_KEY ?? '';
  if (!receipt || apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey)) return null;
  try {
    const site = new URL(env.DIR3COM_WHATSAPP_SITE_URL ?? '');
    if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return null;
    const values = object(JSON.parse(env.DIR3COM_WHATSAPP_KAPSO_TEMPLATES ?? '{}'));
    if (!values || Object.keys(values).length === 0) return null;
    const templates: KapsoConfig['templates'] = {};
    for (const [key, value] of Object.entries(values)) {
      const category = key.slice(0, key.lastIndexOf('.'));
      if (!categories.includes(category) || !['ar', 'en'].includes(key.slice(key.lastIndexOf('.') + 1))) return null;
      const entry = object(value);
      const language = key.endsWith('.ar') ? 'ar' : 'en';
      if (!entry || typeof entry.name !== 'string' || !/^[a-z][a-z0-9_]{0,511}$/.test(entry.name)
        || typeof entry.languageCode !== 'string' || !(language === 'ar' ? ['ar'] : ['en', 'en_US', 'en_GB']).includes(entry.languageCode)
        || Object.keys(entry).some(k => !['name', 'languageCode'].includes(k))) return null;
      templates[key as keyof typeof templates] = { name: entry.name, languageCode: entry.languageCode };
    }
    if (categories.some(category => !Object.keys(templates).some(key => key.startsWith(`${category}.`)))) return null;
    return { ...receipt, apiKey, siteUrl: site.origin, templates };
  } catch { return null; }
}
async function bodyBytes(message: Request | Response, limit: number): Promise<Buffer> {
  if (!message.body) return Buffer.alloc(0);
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return Buffer.concat(chunks, length);
      length += part.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('BODY_LIMIT'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
}
function configuredTemplate(config: KapsoConfig, item: OutboxItem) {
  const category = `${item.audience}.${item.action}`;
  if (!CATEGORIES.includes(category as KapsoCategory)) return undefined;
  return config.templates[`${category}.${item.language}` as keyof KapsoConfig['templates']];
}
export async function sendKapsoTemplate(config: KapsoConfig, item: OutboxItem, fetcher: typeof fetch = fetch): Promise<SendResult> {
  const template = configuredTemplate(config, item);
  if (!parseOutboxItem(item) || !template) return { outcome: 'failed', sid: null, error: 'CATEGORY_NOT_CONFIGURED' };
  const to = item.phone.slice(1);
  try {
    const response = await fetcher(`https://api.kapso.ai/meta/whatsapp/v24.0/${config.phoneNumberId}/messages`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
        template: { name: template.name, language: { code: template.languageCode }, components: [{ type: 'body', parameters: [
          { type: 'text', text: item.reference },
          { type: 'text', text: `${config.siteUrl}${item.audience === 'customer' ? `/my-requests/${item.reference}/drive` : '/admin/operations/drive'}?language=${item.language}` },
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
  const claim = await store.rpc('claim_kapso_drive_whatsapp', { p_template_keys: Object.keys(config.templates) });
  if (claim.error) throw new Error('CLAIM_FAILED');
  if (claim.data === null) return 'idle';
  const item = parseOutboxItem(claim.data);
  if (!item) throw new Error('INVALID_CLAIM');
  if (!configuredTemplate(config, item)) return 'not_sent';
  const start = await store.rpc('begin_kapso_drive_whatsapp', { p_id: item.id, p_token: item.token, p_phone_number_id: config.phoneNumberId });
  if (start.error) throw new Error('SEND_INTENT_UNCONFIRMED');
  if (start.data !== true) return 'not_sent';
  const result = await sendKapsoTemplate(config, item, fetcher);
  const finished = await store.rpc('finish_drive_whatsapp', { p_id: item.id, p_token: item.token, p_outcome: result.outcome, p_sid: result.sid, p_error: result.error });
  if (finished.error || finished.data !== true) throw new Error('RESULT_PERSISTENCE_UNCONFIRMED');
  return result.outcome;
}
export async function handleKapsoDispatch(request: Request, env: Environment, getStore: () => NotificationStore | null, fetcher: typeof fetch = fetch) {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true') return Response.json({ error: 'DISABLED' }, { status: 404 });
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
export async function receiveKapsoReceipt(request: Request, env: Environment, getStore: () => NotificationStore | null) {
  const config = receiptConfig(env);
  if (!config) return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  try {
    const url = new URL(request.url);
    if (url.pathname !== PATH || url.search || request.method !== 'POST'
      || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return new Response(null, { status: 400 });
    const raw = await bodyBytes(request, 32_768);
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
    const result = await store.rpc('record_kapso_drive_whatsapp_receipt', {
      p_sid: message.id, p_phone_number_id: config.phoneNumberId, p_phone: '+' + message.to, p_state: state,
      p_error: state === 'failed' ? 'KAPSO_DELIVERY_FAILED' : null,
    });
    if (result.error) return new Response(null, { status: 503 });
    // Retry callbacks that race durable HTTP acceptance. Never bind an unknown WAMID by phone alone.
    return new Response(null, { status: result.data === true ? 200 : 409 });
  } catch { return new Response(null, { status: 400 }); }
}
