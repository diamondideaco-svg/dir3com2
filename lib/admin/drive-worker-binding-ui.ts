// Client-safe metadata only. Authorization and the worker credential stay in the existing POST route.
export const workerBindingOrigin = 'https://www.dir3com.com';
export const workerBindingPath = '/api/admin/drive-whatsapp/worker-binding';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type SetupReadiness = 'ready' | 'bound' | 'unavailable';
export type SetupOutcome = 'bound' | 'already-bound' | 'unknown' | 'unavailable';

export function isBindingApprovalId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}

export function bindingSetupReadiness(value: unknown, approvalId: string,
  identity: { sha: string; deploymentId: string }): SetupReadiness {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unavailable';
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'approvalId,code,deploymentId,referenceName,secretId,sourceSha'
    || !isBindingApprovalId(approvalId) || row.approvalId !== approvalId
    || row.sourceSha !== identity.sha || row.deploymentId !== identity.deploymentId
    || row.referenceName !== 'task166_existing_worker_bearer') return 'unavailable';
  if (row.code === 'READY' && row.secretId === null) return 'ready';
  if (['BOUND', 'ALREADY_BOUND'].includes(String(row.code)) && isBindingApprovalId(row.secretId)) return 'bound';
  return 'unavailable';
}

export function bindingSetupOutcome(status: number, value: unknown, approvalId: string): SetupOutcome {
  if (status !== 200 || !value || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'approvalId,code,secretId'
    || row.approvalId !== approvalId || !isBindingApprovalId(row.secretId)) return 'unknown';
  if (row.code === 'BOUND_NOT_ACTIVATED') return 'bound';
  if (row.code === 'ALREADY_BOUND_NO_RETRY') return 'already-bound';
  return 'unknown';
}

type AttemptEnvironment = {
  origin: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  locks: Pick<LockManager, 'request'>;
  fetcher: typeof fetch;
};

// Web Locks serialize tabs; a durable marker is saved BEFORE the single POST.
// A reload, lost response, malformed response or storage failure never retries it.
export async function attemptWorkerBinding(approvalId: string, env: AttemptEnvironment): Promise<SetupOutcome> {
  if (!isBindingApprovalId(approvalId) || env.origin !== workerBindingOrigin) return 'unavailable';
  const key = 'task166-worker-binding-attempt:' + approvalId;
  try {
    return await env.locks.request(key, { ifAvailable: true }, async (lock) => {
      if (!lock || env.storage.getItem(key) !== null) return 'unknown';
      env.storage.setItem(key, 'attempted');
      if (env.storage.getItem(key) !== 'attempted') return 'unknown';
      const response = await env.fetcher(workerBindingPath, {
        method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
        cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId }), signal: AbortSignal.timeout(10000),
      });
      if (response.redirected || (response.url && response.url !== workerBindingOrigin + workerBindingPath)) return 'unknown';
      return bindingSetupOutcome(response.status, await response.json(), approvalId);
    });
  } catch {
    // Never return a raw error/response or retry a possibly completed write.
    return 'unknown';
  }
}
