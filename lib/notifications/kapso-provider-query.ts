import 'server-only';
import { secureEqual, type NotificationStore } from './drive-whatsapp';
import { beforeDeadline, bodyBytes, kapsoConfig, parseKapsoTarget, type KapsoConfig, type KapsoTarget } from './kapso-drive-whatsapp';

type QueryConfig = Extract<KapsoConfig, { deliveryMode: 'provider_query' }>;
type DeliveryState = 'sent' | 'delivered' | 'read' | 'failed';
type QueryLease = { windowId: string; token: string; sid: string; phone: string; expiresAt: number };
type ObservationReason = 'HTTP_NOT_FOUND' | 'HTTP_RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'HTTP_UNCONFIRMED'
  | 'BAD_BODY' | 'PROVIDER_ERROR' | 'IDENTITY_MISMATCH' | 'UNSUPPORTED_STATE' | 'TRANSPORT_UNCONFIRMED';
type Observation = { kind: 'observed'; state: DeliveryState } | { kind: 'unconfirmed'; reason: ObservationReason };
type QueryFailureReason = 'QUERY_LEASE_UNCONFIRMED' | 'QUERY_IDENTITY_UNCONFIRMED' | 'QUERY_PERSISTENCE_UNCONFIRMED';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WAMID = /^wamid\.[A-Za-z0-9_+/=-]{1,250}$/;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function leaseFor(value: unknown, target: KapsoTarget, sender: string): QueryLease | null {
  const row = object(value);
  if (!row || row.request_id !== target.requestId || row.outbox_id !== target.outboxId
    || row.recipient_user_id !== target.recipientUserId || row.category !== target.category || row.language !== target.language
    || row.phone_number_id !== sender || typeof row.window_id !== 'string' || !UUID.test(row.window_id)
    || typeof row.query_token !== 'string' || !UUID.test(row.query_token)
    || typeof row.provider_sid !== 'string' || !WAMID.test(row.provider_sid)
    || typeof row.phone !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(row.phone)
    || typeof row.expires_at !== 'string') return null;
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { windowId: row.window_id, token: row.query_token, sid: row.provider_sid, phone: row.phone, expiresAt };
}
async function observe(config: QueryConfig, lease: QueryLease, fetcher: typeof fetch, signal: AbortSignal): Promise<Observation> {
  try {
    // Only a database-persisted WAMID may select this fixed-origin, exact-sender GET.
    const url = new URL(`https://api.kapso.ai/meta/whatsapp/v24.0/${config.phoneNumberId}/messages/${encodeURIComponent(lease.sid)}`);
    url.searchParams.set('fields', 'id,to,kapso(direction,status,processing_status)');
    const response = await beforeDeadline(fetcher(url.toString(), { method: 'GET', redirect: 'error', cache: 'no-store',
      signal, headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' } }), signal);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      return { kind: 'unconfirmed', reason: response.status === 404 ? 'HTTP_NOT_FOUND'
        : response.status === 429 ? 'HTTP_RATE_LIMITED' : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'HTTP_UNCONFIRMED' };
    }
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      void response.body?.cancel().catch(() => {}); return { kind: 'unconfirmed', reason: 'BAD_BODY' };
    }
    let message: Record<string, unknown> | null;
    try { message = object(JSON.parse((await bodyBytes(response, 8192, signal)).toString('utf8'))); }
    catch { return { kind: 'unconfirmed', reason: 'BAD_BODY' }; }
    if (message?.error) return { kind: 'unconfirmed', reason: 'PROVIDER_ERROR' };
    const kapso = object(message?.kapso);
    if (!message || !kapso) return { kind: 'unconfirmed', reason: 'BAD_BODY' };
    // These extra fields are not declared by the GET schema or requested above.
    // Reject contradictions if returned; their absence proves neither sender nor active delivery.
    if (message.id !== lease.sid || message.to !== lease.phone.slice(1)
      || kapso?.direction !== 'outbound' || kapso.passive === true
      || (kapso.phone_number_id !== undefined && kapso.phone_number_id !== config.phoneNumberId)) return { kind: 'unconfirmed', reason: 'IDENTITY_MISMATCH' };
    const state = kapso.status;
    if (state !== 'sent' && state !== 'delivered' && state !== 'read' && state !== 'failed') return { kind: 'unconfirmed', reason: 'UNSUPPORTED_STATE' };
    return { kind: 'observed', state };
  } catch { return { kind: 'unconfirmed', reason: 'TRANSPORT_UNCONFIRMED' }; }
}

// One bounded read per authenticated invocation. SQL enforces a persistent three-
// query budget, cooldown and lease; no scheduler, loop or resend exists here.
export async function handleKapsoTargetReconcile(request: Request, env: Record<string, string | undefined>,
  getStore: () => NotificationStore | null, fetcher: typeof fetch = fetch, timeoutMs = 6000) {
  if (env.DIR3COM_WHATSAPP_ENABLED !== 'true' || env.DIR3COM_WHATSAPP_DELIVERY_MODE !== 'provider_query') return Response.json({ error: 'DISABLED' }, { status: 404 });
  const secret = env.DIR3COM_WHATSAPP_WORKER_SECRET ?? '';
  if (secret.length < 32 || !secureEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'INVALID_TARGET' }, { status: 400 });
  const config = kapsoConfig(env);
  if (!config || config.deliveryMode !== 'provider_query') return Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), Math.max(1, Math.min(timeoutMs, 6000)));
  let failureReason: QueryFailureReason = 'QUERY_LEASE_UNCONFIRMED';
  try {
    let target: KapsoTarget | null;
    try { target = parseKapsoTarget(JSON.parse((await bodyBytes(request, 2048, deadline.signal)).toString('utf8'))); }
    catch { return Response.json({ error: 'INVALID_TARGET' }, { status: deadline.signal.aborted ? 503 : 400 }); }
    if (!target || target.category !== 'operations.created') return Response.json({ error: 'INVALID_TARGET' }, { status: 400 });
    const store = getStore();
    if (!store) return Response.json({ error: 'STORE_UNAVAILABLE' }, { status: 503 });
    const pending = store.rpc('claim_kapso_drive_whatsapp_status_query', {
      p_request_id: target.requestId, p_outbox_id: target.outboxId, p_recipient_user_id: target.recipientUserId,
      p_category: target.category, p_language: target.language, p_phone_number_id: config.phoneNumberId,
    });
    const claimed = await beforeDeadline(pending.abortSignal ? pending.abortSignal(deadline.signal) : pending, deadline.signal);
    if (claimed.error) throw new Error('QUERY_LEASE_UNCONFIRMED');
    if (claimed.data === null) return Response.json({ result: 'idle' }, { headers: { 'Cache-Control': 'no-store' } });
    failureReason = 'QUERY_IDENTITY_UNCONFIRMED';
    const lease = leaseFor(claimed.data, target, config.phoneNumberId);
    if (!lease || deadline.signal.aborted) throw new Error('QUERY_IDENTITY_UNCONFIRMED');
    // The durable SQL lease ends with the window. It cannot grant work beyond it.
    const expiryTimer = setTimeout(() => deadline.abort(), Math.max(1, lease.expiresAt - Date.now()));
    let observation: Observation;
    try { observation = await observe(config, lease, fetcher, deadline.signal); }
    finally { clearTimeout(expiryTimer); }
    if (deadline.signal.aborted) throw new Error('QUERY_DEADLINE');
    failureReason = 'QUERY_PERSISTENCE_UNCONFIRMED';
    const completion = store.rpc('finish_kapso_drive_whatsapp_status_query', {
      p_window_id: lease.windowId, p_query_token: lease.token, p_sid: lease.sid, p_phone_number_id: config.phoneNumberId,
      p_phone: lease.phone, p_state: observation.kind === 'observed' ? observation.state : null,
    });
    const finished = await beforeDeadline(completion.abortSignal ? completion.abortSignal(deadline.signal) : completion, deadline.signal);
    if (finished.error || finished.data !== true) throw new Error('QUERY_PERSISTENCE_UNCONFIRMED');
    return Response.json({ result: observation.kind === 'observed' ? 'recorded' : 'unconfirmed', messageId: lease.sid,
      ...(observation.kind === 'unconfirmed' ? { reason: observation.reason } : {}) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'QUERY_UNCONFIRMED', reason: deadline.signal.aborted ? 'QUERY_DEADLINE' : failureReason },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  finally { clearTimeout(timer); }
}
