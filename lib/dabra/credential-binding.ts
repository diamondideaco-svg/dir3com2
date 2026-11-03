import 'server-only';
import { createHash } from 'node:crypto';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from './agent-capabilities';

type RuntimeContext = Readonly<{
  environment: string | undefined; sourceSha: string | undefined; databaseHostname: string | null;
}>;
export type CredentialBindingDependencies = Readonly<{
  authorize: () => Promise<string | null>;
  readBindings: (signal: AbortSignal) => Promise<
    Readonly<{ kind: 'ok'; data: unknown }> | Readonly<{ kind: 'error' }>
  >;
  readCredential: (provider: AgentProviderId) => string | undefined;
  runtime: () => RuntimeContext;
}>;
type BindingBody =
  | Readonly<{ status: 'MATCH' | 'MISMATCH' | 'UNBOUND'; provider: AgentProviderId; sourceSha: string }>
  | Readonly<{ status: 'DENIED' | 'ERROR' | 'INVALID_REQUEST' }>;

const digest = /^[a-f0-9]{64}$/;
const source = /^[a-f0-9]{40}$/;
const productionDatabase = 'ynupwivgvwcyrsdhtkcc.supabase.co';
const stopped = Symbol('stopped');
function response(body: BindingBody, status = 200) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization',
  } });
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function bindings(value: unknown): value is Record<string, string> {
  return record(value) && Object.entries(value).every(([provider, value]) =>
    AGENT_PROVIDER_IDS.some(p => p === provider) && typeof value === 'string' && digest.test(value));
}
export function isCredentialBindingCoreProject(hostname: string | null | undefined) {
  return hostname === productionDatabase;
}
function validRuntime(value: RuntimeContext) {
  return value.environment === 'production' && typeof value.sourceSha === 'string'
    && source.test(value.sourceSha) && isCredentialBindingCoreProject(value.databaseHostname);
}
async function bounded<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T | typeof stopped> {
  if (signal.aborted) return stopped;
  let onAbort: (() => void) | undefined;
  const abort = new Promise<typeof stopped>(resolve => {
    onAbort = () => resolve(stopped);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([work(), abort]); }
  finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}

/** Read-only key equality at this request's runtime. Never financial or capability evidence. */
export async function checkRuntimeCredentialBinding(
  request: Request, dependencies: CredentialBindingDependencies, timeoutMs = 5000,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const provider = AGENT_PROVIDER_IDS.find(p => p === url.searchParams.get('provider'));
    if (request.method !== 'GET' || request.body !== null || url.search.length > 128
      || url.searchParams.get('operation') !== 'credential-binding' || !provider
      || [...url.searchParams.keys()].length !== 2
      || url.searchParams.getAll('operation').length !== 1 || url.searchParams.getAll('provider').length !== 1
      || (request.headers.has('content-length') && request.headers.get('content-length') !== '0')) {
      return response({ status: 'INVALID_REQUEST' }, 400);
    }
    const origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site');
    if ((origin !== null && origin !== url.origin)
      || (site !== null && site !== 'same-origin' && site !== 'none') || (!origin && !site)) {
      return response({ status: 'DENIED' }, 403);
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) {
      return response({ status: 'ERROR' }, 503);
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    const actor = await bounded(dependencies.authorize, signal);
    if (actor === stopped) return response({ status: 'ERROR' }, 503);
    if (!actor) return response({ status: 'DENIED' }, 403);
    const runtime = dependencies.runtime();
    if (!validRuntime(runtime)) return response({ status: 'ERROR' }, 503);

    // NULL is the explicit private diagnostic branch, not a borrowed Customer subject.
    const read = await bounded(() => dependencies.readBindings(signal), signal);
    if (read === stopped || read.kind === 'error' || !record(read.data)
      || Object.keys(read.data).length !== 1 || !bindings(read.data.credentialBindings)) {
      return response({ status: 'ERROR' }, 503);
    }
    const expected = Object.prototype.hasOwnProperty.call(read.data.credentialBindings, provider)
      ? read.data.credentialBindings[provider] : undefined;
    const currentActor = await bounded(dependencies.authorize, signal);
    if (currentActor === stopped) return response({ status: 'ERROR' }, 503);
    if (currentActor !== actor) return response({ status: 'DENIED' }, 403);

    // All awaited authority/database reads are complete before the actual key read.
    const current = dependencies.runtime();
    if (signal.aborted || !validRuntime(current) || current.sourceSha !== runtime.sourceSha
      || typeof current.sourceSha !== 'string') return response({ status: 'ERROR' }, 503);
    if (expected === undefined) return response({ status: 'UNBOUND', provider, sourceSha: current.sourceSha });
    const credential = dependencies.readCredential(provider);
    if (!credential || signal.aborted) return response({ status: 'ERROR' }, 503);
    const matches = createHash('sha256').update(credential).digest('hex') === expected;
    return response({ status: matches ? 'MATCH' : 'MISMATCH', provider, sourceSha: current.sourceSha });
  } catch {
    // No raw RPC/auth/configuration error, credential or digest is logged or returned.
    return response({ status: 'ERROR' }, 503);
  }
}
