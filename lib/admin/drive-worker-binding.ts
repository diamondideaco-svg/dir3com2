import 'server-only';

import { readLimitedBody } from '@/lib/notifications/drive-whatsapp';
import type { getDeploymentIdentity } from '@/lib/admin/server-binding-diagnostic';

const origin = 'https://www.dir3com.com';
const projectOrigin = 'https://ynupwivgvwcyrsdhtkcc.supabase.co';
const reference = 'task166_existing_worker_bearer';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha = /^[0-9a-f]{40}$/;
const deployment = /^dpl_[A-Za-z0-9]{10,100}$/;

type RpcResult = { data: unknown; error: unknown };
type RuntimeIdentity = NonNullable<ReturnType<typeof getDeploymentIdentity>>;
type BindInput = { approvalId: string; sourceSha: string; deploymentId: string; worker: string };
type Authorized = {
  adminHostname: string | null;
  publicHostname: string | null;
  readState(approvalId: string): PromiseLike<RpcResult>;
  bind(input: BindInput): PromiseLike<RpcResult>;
};
export type BindingContext = {
  authorize(transport: typeof fetch): Promise<Authorized | null>;
  runtime(): RuntimeIdentity | null;
  readWorker(): string | undefined;
};

type BindingState = {
  code: 'READY' | 'BOUND' | 'ALREADY_BOUND';
  approvalId: string;
  sourceSha: string;
  deploymentId: string;
  referenceName: string;
  secretId: string | null;
};

function state(value: unknown): BindingState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'approvalId,code,deploymentId,referenceName,secretId,sourceSha'
    || !('code' in value) || !['READY', 'BOUND', 'ALREADY_BOUND'].includes(String(value.code))
    || !('approvalId' in value) || typeof value.approvalId !== 'string' || !uuid.test(value.approvalId)
    || !('sourceSha' in value) || typeof value.sourceSha !== 'string' || !sha.test(value.sourceSha)
    || !('deploymentId' in value) || typeof value.deploymentId !== 'string' || !deployment.test(value.deploymentId)
    || !('referenceName' in value) || value.referenceName !== reference || !('secretId' in value)) return null;
  if (value.code === 'READY' && value.secretId === null) return {
    code: 'READY', approvalId: value.approvalId, sourceSha: value.sourceSha,
    deploymentId: value.deploymentId, referenceName: reference, secretId: null,
  };
  if ((value.code === 'BOUND' || value.code === 'ALREADY_BOUND')
    && typeof value.secretId === 'string' && uuid.test(value.secretId)) {
    return { code: value.code, approvalId: value.approvalId, sourceSha: value.sourceSha,
      deploymentId: value.deploymentId, referenceName: reference, secretId: value.secretId };
  }
  return null;
}

function json(code: string, status: number, ids?: { approvalId: string; secretId: string }) {
  return Response.json({ code, ...ids }, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie, Origin',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  } });
}

// Never pass the credential through a URL or a transport which follows redirects.
// The installed SDK's POST does not retry; the route also sets retry(false).
export function bindingTransport(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const rpc = ['/rest/v1/rpc/get_task166_worker_binding_state', '/rest/v1/rpc/bind_task166_existing_worker'].includes(url.pathname);
      const profile = url.pathname === '/rest/v1/profiles' && method === 'GET'
        && Array.from(url.searchParams).length === 4
        && url.searchParams.get('select') === 'id,role,status,deleted_at,full_name'
        && url.searchParams.get('id') === 'eq.0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'
        && url.searchParams.get('status') === 'eq.active' && url.searchParams.get('deleted_at') === 'is.null'
        && !init?.body;
      if (url.origin !== projectOrigin || url.username || url.password || url.hash
        || (rpc ? method !== 'POST' || Boolean(url.search) : !profile && !url.pathname.startsWith('/auth/v1/'))) {
        throw new Error('BINDING_TRANSPORT_UNCONFIRMED');
      }
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const response = await fetcher(input, { ...init, redirect: 'error', cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
      if (response.redirected || (response.status >= 300 && response.status < 400)
        || (response.url && new URL(response.url).origin !== projectOrigin)) {
        throw new Error('BINDING_TRANSPORT_UNCONFIRMED');
      }
      return response;
    } catch {
      // Do not attach the input/init/cause or provider/SDK error to the safe error.
      throw new Error('BINDING_TRANSPORT_UNCONFIRMED');
    }
  };
}

export async function bindExistingWorkerAsCeo(request: Request, ctx: BindingContext,
  fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json('METHOD_NOT_ALLOWED', 405);
  const url = new URL(request.url);
  if (url.origin !== origin || url.pathname !== '/api/admin/drive-whatsapp/worker-binding'
    || url.search || request.headers.get('origin') !== origin
    || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
    return json('ORIGIN_REJECTED', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json('INVALID_APPROVAL', 400);
  }
  try {
    const actor = await ctx.authorize(bindingTransport(fetcher));
    if (!actor) return json('FORBIDDEN', 403);
    let body: unknown;
    try { body = JSON.parse(await readLimitedBody(request, 256)); }
    catch { return json('INVALID_APPROVAL', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'approvalId'
      || !('approvalId' in body) || typeof body.approvalId !== 'string' || !uuid.test(body.approvalId)) {
      return json('INVALID_APPROVAL', 400);
    }
    const runtime = ctx.runtime();
    if (!runtime || actor.adminHostname !== new URL(projectOrigin).hostname
      || actor.publicHostname !== new URL(projectOrigin).hostname) return json('BINDING_IDENTITY_UNVERIFIED', 409);
    const preflight = await actor.readState(body.approvalId);
    if (preflight.error) return json('UNCONFIRMED_CHECK_METADATA', 503);
    const before = state(preflight.data);
    if (!before) return json('NOT_READY_CHECK_METADATA', 409);
    if (before.approvalId !== body.approvalId || before.sourceSha !== runtime.sha
      || before.deploymentId !== runtime.deploymentId) return json('BINDING_IDENTITY_MISMATCH', 409);
    if (before.code !== 'READY') return json('ALREADY_BOUND_NO_RETRY', 200,
      before.secretId === null ? undefined : { approvalId: before.approvalId, secretId: before.secretId });
    // Only this point can access the existing runtime value. It is never a client argument.
    const worker = ctx.readWorker();
    if (typeof worker !== 'string' || worker.length < 32 || worker.length > 512) return json('WORKER_UNAVAILABLE', 409);
    const result = await actor.bind({ approvalId: before.approvalId, sourceSha: runtime.sha,
      deploymentId: runtime.deploymentId, worker });
    if (result.error) return json('UNCONFIRMED_CHECK_METADATA', 503);
    const after = state(result.data);
    if (!after || after.code === 'READY' || after.approvalId !== before.approvalId
      || after.sourceSha !== before.sourceSha || after.deploymentId !== before.deploymentId || after.secretId === null) {
      return json('UNCONFIRMED_CHECK_METADATA', 503);
    }
    return json(after.code === 'BOUND' ? 'BOUND_NOT_ACTIVATED' : 'ALREADY_BOUND_NO_RETRY', 200,
      { approvalId: after.approvalId, secretId: after.secretId });
  } catch {
    return json('UNCONFIRMED_CHECK_METADATA', 503);
  }
}
