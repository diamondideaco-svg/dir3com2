import 'server-only';

import { readLimitedBody, type NotificationStore } from '@/lib/notifications/drive-whatsapp';
import { handleKapsoTargetDispatch, parseKapsoTarget } from '@/lib/notifications/kapso-drive-whatsapp';

type OperatorContext = {
  authorize(): Promise<boolean>;
  env: Record<string, string | undefined>;
  getStore(): NotificationStore | null;
};

function json(code: string, status = 200) {
  return Response.json({ code }, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Cookie, Origin',
    'X-Content-Type-Options': 'nosniff',
  } });
}

// This is an operator adapter, not an enrollment, approval or general-send API.
// Target UUIDs only select the already-authorized DB window. They never establish
// recipient authority: the shared claim/begin RPCs must match its complete tuple.
export async function dispatchCurrentStateAsOperator(
  request: Request, ctx: OperatorContext, fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json('METHOD_NOT_ALLOWED', 405);
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin || url.search
    || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
    return json('ORIGIN_REJECTED', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json('INVALID_TARGET', 400);
  }
  try {
    if (!(await ctx.authorize())) return json('FORBIDDEN', 403);
    let input: unknown;
    try { input = JSON.parse(await readLimitedBody(request, 1024)); }
    catch { return json('INVALID_TARGET', 400); }
    const target = parseKapsoTarget(input);
    if (!target || !['customer.current_state', 'operations.current_state'].includes(target.category)) {
      return json('INVALID_TARGET', 400);
    }
    // Never change a functioning continuous service to accommodate this adapter.
    if (ctx.env.DIR3COM_WHATSAPP_DISPATCH_MODE !== 'target_only'
      || (ctx.env.DIR3COM_WHATSAPP_DELIVERY_MODE ?? 'webhook') !== 'webhook') return json('CURRENT_STATE_MODE_REQUIRED', 409);

    // No HTTP self-fetch or credential export. The existing handler enforces
    // enabled/config/auth and the exact atomic DB authorization before transport.
    const internal = new Request(new URL('/api/internal/drive-whatsapp/dispatch-target', url), {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.env.DIR3COM_WHATSAPP_WORKER_SECRET ?? ''}`,
      }, body: JSON.stringify(target),
    });
    const response = await handleKapsoTargetDispatch(internal, ctx.env, ctx.getStore, fetcher);
    if (!response.ok) return json('DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('result' in payload)) return json('DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503);
    switch (payload.result) {
      case 'accepted': return json('ACCEPTED_NOT_DELIVERED');
      case 'idle': return json('IDLE_NO_RESEND');
      case 'not_sent': return json('NOT_SENT');
      case 'unknown': return json('UNKNOWN_DO_NOT_RETRY');
      case 'failed': return json('FAILED_NO_RETRY');
      default: return json('DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503);
    }
  } catch {
    // Never relay cookies, credentials, provider messages or private error data.
    // No stop/cleanup/retry or global gate mutation is performed here.
    return json('DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503);
  }
}
