import { randomUUID } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

import { callAnthropicMessagesWeb } from '@/lib/ai2/runtime/anthropic-web';
import { callDeepSeekWebSearch } from '@/lib/ai2/runtime/deepseek-web';
import { callGeminiGoogleSearch } from '@/lib/ai2/runtime/gemini-web';
import { callMistralWebSearch } from '@/lib/ai2/runtime/mistral-web';
import { callOpenAIResponsesWebSearch } from '@/lib/ai2/runtime/openai-web';
import { callQwenWebSearch } from '@/lib/ai2/runtime/qwen-web';
import { callXAIWebSearch } from '@/lib/ai2/runtime/xai-web';

export const CERTIFICATION_PROVIDERS = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'] as const;
export type CertificationProvider = (typeof CERTIFICATION_PROVIDERS)[number];
type Language = 'ar' | 'en';

export const PROBES_PER_PROVIDER = 4;
export const MAX_LOGICAL_PROBES = 28;
export const MAX_HTTP_CALLS_PER_PROBE = 8;
export const PROBE_WATCHDOG_MS = 100_000;
export const LIVE_RUNTIME_LIMIT_MS = 55 * 60_000;
export const READBACK_LIMIT_MS = 5_000;
export const READBACK_MAX_ATTEMPTS = 3;
export const LIVE_CONFIRMATION = 'DABRA_PROVIDER_CERTIFICATION_LIVE';
export const HARDENING_MIGRATION_IDENTITY = '20260904210623_harden_dabra_provider_attempt_acl';

const TELEMETRY_COLUMNS = [
  'attempt_id', 'request_id', 'provider', 'model', 'intent_class', 'language', 'route',
  'started_at', 'completed_at', 'latency_ms', 'success', 'error_category', 'fallback_from',
  'fallback_reason', 'fallback_hop', 'input_tokens', 'output_tokens', 'estimated_cost_usd',
  'pricing_version', 'grounding_status', 'created_at',
].join(',');

const PROBE_TEXT: Record<Language, readonly string[]> = {
  ar: [
    'اذكر باختصار عاصمة المملكة العربية السعودية.',
    'اذكر باختصار عاصمة جمهورية مصر العربية.',
  ],
  en: [
    'Briefly name the capital of Saudi Arabia.',
    'Briefly name the capital of Egypt.',
  ],
};

const SYSTEM_PROMPT = 'Answer the informational calibration question briefly. Do not request or include personal data.';

type ProviderResult = {
  ok: boolean;
  model?: string;
  status?: number;
  errorCategory?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type HardeningEvidence = {
  target_table?: unknown;
  migration_identity?: unknown;
  migration_applied?: unknown;
  service_role_select?: unknown;
  service_role_insert?: unknown;
  service_role_update?: unknown;
  service_role_delete?: unknown;
  service_role_truncate?: unknown;
  service_role_references?: unknown;
  service_role_trigger?: unknown;
  service_role_maintain?: unknown;
  service_role_column_mutation_absent?: unknown;
  service_role_set_role_safe?: unknown;
  service_role_role_membership_safe?: unknown;
  anonymous_authenticated_set_role_safe?: unknown;
  anonymous_authenticated_role_membership_safe?: unknown;
  table_acl_exact?: unknown;
  column_acl_absent?: unknown;
  rls_enabled?: unknown;
  force_rls_enabled?: unknown;
};

export type ProbeExecution = {
  result: Promise<ProviderResult>;
  terminate: () => Promise<void>;
  httpCalls: () => number;
};

type ProbeWorkerData = {
  kind: 'dabra-provider-certification-probe';
  provider: CertificationProvider;
  language: Language;
  message: string;
};

type ProbeWorkerBootstrapData = ProbeWorkerData & { moduleUrl: string; tsconfigPath: string };

type ProbeWorkerMessage =
  | { type: 'http_call'; httpCalls: number }
  | { type: 'result'; result: ProviderResult; httpCalls: number }
  | { type: 'failure'; code: string; httpCalls: number };

const SAFE_TERMINAL_ERRORS = new Set([
  'unsupported_argument',
  'unsupported_provider',
  'logical_probe_limit_exceeded',
  'live_intent_missing',
  'live_confirmation_missing',
  'target_project_ref_mismatch',
  'service_role_key_missing',
  'private_manifest_path_required',
  'manifest_must_be_absolute_jsonl',
  'manifest_parent_symlink_forbidden',
  'manifest_must_be_outside_repository',
  'manifest_symlink_forbidden',
  'manifest_must_be_private_regular_file',
  'manifest_allowlist_violation',
  'live_certification_runtime_limit_exceeded',
  'production_hardening_evidence_unavailable',
  'production_hardening_evidence_invalid',
  'persistence_verification_failed',
  'provider_http_call_limit_exceeded',
  'probe_watchdog_timeout',
  'provider_worker_failed',
]);

class BoundedProbeError extends Error {
  constructor(message: string, readonly httpCalls: number) {
    super(message);
    this.name = 'BoundedProbeError';
  }
}

export type CertificationOptions = {
  live: boolean;
  provider: CertificationProvider | 'all';
  targetProjectRef: string | null;
  confirmation: string | null;
  manifestPath: string | null;
};

export type Probe = {
  provider: CertificationProvider;
  language: Language;
  ordinal: number;
  message: string;
};

export type ManifestRecord = {
  provider: CertificationProvider;
  request_id: string;
  language: Language;
  timestamp: string;
  actual_model: string | null;
  http_invocation_confirmed: boolean;
  status_category: string;
  latency_ms: number;
  persistence_confirmed: boolean;
  observability_row_id: string | null;
  classification: 'DIRECT';
};

type PersistedRow = Record<string, unknown> & { attempt_id?: string };

export type CertificationDependencies = {
  readHardeningEvidence: () => Promise<HardeningEvidence>;
  startProbe: (provider: CertificationProvider, language: Language, message: string) => ProbeExecution;
  persistAttempt: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readBack: (requestId: string, fallbackHop: number, timeoutMs: number) => Promise<PersistedRow[]>;
  appendManifest: (path: string, record: ManifestRecord) => void;
  now: () => number;
  uuid: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  classifyError: (error: string | undefined, status?: number) => string;
};

export function parseCertificationArgs(argv: readonly string[]): CertificationOptions {
  const values = new Map<string, string>();
  let live = false;
  for (const argument of argv) {
    if (argument === '--live') {
      live = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (!match) throw new Error('unsupported_argument');
    values.set(match[1], match[2]);
  }
  const provider = values.get('provider') ?? 'all';
  if (provider !== 'all' && !CERTIFICATION_PROVIDERS.includes(provider as CertificationProvider)) {
    throw new Error('unsupported_provider');
  }
  return {
    live,
    provider: provider as CertificationProvider | 'all',
    targetProjectRef: values.get('target-project-ref')?.trim().toLowerCase() || null,
    confirmation: values.get('confirm-live') || null,
    manifestPath: values.get('manifest') || null,
  };
}

export function buildProbePlan(provider: CertificationProvider | 'all'): Probe[] {
  const providers = provider === 'all' ? CERTIFICATION_PROVIDERS : [provider];
  const probes = providers.flatMap((selectedProvider) => ([
    ...PROBE_TEXT.ar.map((message, index) => ({ provider: selectedProvider, language: 'ar' as const, ordinal: index + 1, message })),
    ...PROBE_TEXT.en.map((message, index) => ({ provider: selectedProvider, language: 'en' as const, ordinal: index + 3, message })),
  ]));
  if (probes.length > MAX_LOGICAL_PROBES) throw new Error('logical_probe_limit_exceeded');
  return probes;
}

function projectRefFromUrl(value: string | undefined): string | null {
  try {
    const hostname = new URL(value ?? '').hostname.toLowerCase();
    const match = /^([a-z0-9-]+)\.supabase\.(?:co|net)$/.exec(hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function validateLiveExecution(
  options: CertificationOptions,
  env: Readonly<Record<string, string | undefined>>,
  repositoryRoot: string,
): { targetProjectRef: string; manifestPath: string } {
  if (!options.live) throw new Error('live_intent_missing');
  if (options.confirmation !== LIVE_CONFIRMATION || env.DABRA_PROVIDER_CERTIFICATION_LIVE !== LIVE_CONFIRMATION) {
    throw new Error('live_confirmation_missing');
  }
  const urlRef = projectRefFromUrl(env.SUPABASE_URL);
  const envRef = env.SUPABASE_PROJECT_REF?.trim().toLowerCase() || null;
  if (!options.targetProjectRef || !urlRef || options.targetProjectRef !== urlRef || (envRef && envRef !== urlRef)) {
    throw new Error('target_project_ref_mismatch');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new Error('service_role_key_missing');
  if (!options.manifestPath) throw new Error('private_manifest_path_required');
  return {
    targetProjectRef: urlRef,
    manifestPath: validatePrivateManifestPath(options.manifestPath, repositoryRoot),
  };
}

export function assertHardeningEvidence(evidence: HardeningEvidence): void {
  const required = {
    target_table: 'public.dabra_provider_attempts',
    migration_identity: HARDENING_MIGRATION_IDENTITY,
    migration_applied: true,
    service_role_select: true,
    service_role_insert: true,
    service_role_update: false,
    service_role_delete: false,
    service_role_truncate: false,
    service_role_references: false,
    service_role_trigger: false,
    service_role_maintain: false,
    service_role_column_mutation_absent: true,
    service_role_set_role_safe: true,
    service_role_role_membership_safe: true,
    anonymous_authenticated_set_role_safe: true,
    anonymous_authenticated_role_membership_safe: true,
    table_acl_exact: true,
    column_acl_absent: true,
    rls_enabled: true,
    force_rls_enabled: true,
  } as const;
  for (const [key, expected] of Object.entries(required)) {
    if (evidence[key as keyof HardeningEvidence] !== expected) {
      throw new Error('production_hardening_evidence_invalid');
    }
  }
}

export function sanitizeCertificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (SAFE_TERMINAL_ERRORS.has(message)) return message;
  if (/^provider_configuration_missing:(?:openai|gemini|anthropic|xai|deepseek|qwen|mistral)$/.test(message)) {
    return message;
  }
  return 'certification_failed';
}

export function validatePrivateManifestPath(value: string, repositoryRoot: string): string {
  if (!isAbsolute(value) || extname(value).toLowerCase() !== '.jsonl') {
    throw new Error('manifest_must_be_absolute_jsonl');
  }
  const root = realpathSync(repositoryRoot);
  const target = resolve(value);
  const requestedParent = dirname(target);
  if (lstatSync(requestedParent).isSymbolicLink()) throw new Error('manifest_parent_symlink_forbidden');
  const targetParent = realpathSync(requestedParent);
  const canonicalTarget = resolve(targetParent, basename(target));
  const targetRelativeToRepository = relative(root, canonicalTarget);
  const insideRepository = targetRelativeToRepository.split(/[\\/]/)[0] !== '..' && !isAbsolute(targetRelativeToRepository);
  if (insideRepository) throw new Error('manifest_must_be_outside_repository');
  try {
    const targetStatus = lstatSync(target);
    if (targetStatus.isSymbolicLink()) throw new Error('manifest_symlink_forbidden');
    if (!targetStatus.isFile() || targetStatus.nlink !== 1) throw new Error('manifest_must_be_private_regular_file');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return canonicalTarget;
}

export function appendPrivateManifest(path: string, record: ManifestRecord): void {
  const allowedKeys = [
    'provider', 'request_id', 'language', 'timestamp', 'actual_model', 'http_invocation_confirmed',
    'status_category', 'latency_ms', 'persistence_confirmed', 'observability_row_id', 'classification',
  ];
  if (Object.keys(record).sort().join(',') !== [...allowedKeys].sort().join(',')) {
    throw new Error('manifest_allowlist_violation');
  }
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | noFollow, 0o600);
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.nlink !== 1) throw new Error('manifest_must_be_private_regular_file');
    try { fchmodSync(descriptor, 0o600); } catch { /* Filesystem ACL enforcement is operational and is not claimed here. */ }
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  } finally {
    closeSync(descriptor);
  }
}

export async function invokeWithProbeBounds(
  execution: ProbeExecution,
  watchdogMs = PROBE_WATCHDOG_MS,
): Promise<{ result: ProviderResult; httpCalls: number }> {
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('probe_watchdog_timeout')), watchdogMs);
    });
    try {
      const result = await Promise.race([execution.result, timeout]);
      return { result, httpCalls: execution.httpCalls() };
    } catch (error) {
      const code = error instanceof Error && SAFE_TERMINAL_ERRORS.has(error.message)
        ? error.message
        : 'provider_worker_failed';
      throw new BoundedProbeError(code, execution.httpCalls());
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
    await execution.terminate();
  }
}

async function readBackWithBound(
  dependencies: CertificationDependencies,
  requestId: string,
  fallbackHop: number,
): Promise<PersistedRow[]> {
  const deadline = dependencies.now() + READBACK_LIMIT_MS;
  let rows: PersistedRow[] = [];
  for (let attempt = 0; attempt < READBACK_MAX_ATTEMPTS; attempt += 1) {
    const remainingBeforeRead = deadline - dependencies.now();
    if (remainingBeforeRead <= 0) break;
    rows = await dependencies.readBack(requestId, fallbackHop, Math.min(1_500, remainingBeforeRead));
    if (rows.length > 0 || attempt === READBACK_MAX_ATTEMPTS - 1) break;
    const remaining = deadline - dependencies.now();
    if (remaining <= 0) break;
    await dependencies.sleep(Math.min(500, remaining));
  }
  return rows;
}

function rowsMatch(record: Record<string, unknown>, rows: PersistedRow[]): boolean {
  if (rows.length !== 1) return false;
  const row = rows[0];
  const fields = [
    'attempt_id', 'request_id', 'provider', 'model', 'intent_class', 'language', 'route',
    'started_at', 'completed_at', 'latency_ms', 'success', 'error_category', 'fallback_from',
    'fallback_reason', 'fallback_hop', 'input_tokens', 'output_tokens', 'estimated_cost_usd',
    'pricing_version', 'grounding_status', 'created_at',
  ];
  return fields.every((field) => equivalentTelemetryValue(field, row[field], record[field]));
}

function equivalentTelemetryValue(field: string, left: unknown, right: unknown): boolean {
  if (left == null || right == null) return left == null && right == null;
  if (['started_at', 'completed_at', 'created_at'].includes(field)) {
    return Date.parse(String(left)) === Date.parse(String(right));
  }
  if (['latency_ms', 'fallback_hop', 'input_tokens', 'output_tokens', 'estimated_cost_usd'].includes(field)) {
    return Number(left) === Number(right);
  }
  return left === right;
}

export async function runLiveCertification(
  options: CertificationOptions,
  dependencies: CertificationDependencies,
  manifestPath: string,
): Promise<{ passed: boolean; probes: ManifestRecord[] }> {
  assertHardeningEvidence(await dependencies.readHardeningEvidence());
  const plan = buildProbePlan(options.provider);
  const certificationStartedAt = dependencies.now();
  const manifestRecords: ManifestRecord[] = [];
  let passed = true;

  for (const probe of plan) {
    if (dependencies.now() - certificationStartedAt >= LIVE_RUNTIME_LIMIT_MS) {
      throw new Error('live_certification_runtime_limit_exceeded');
    }
    const requestId = dependencies.uuid();
    const startedAtMs = dependencies.now();
    let result: ProviderResult;
    let httpCalls = 0;
    try {
      const bounded = await invokeWithProbeBounds(
        dependencies.startProbe(probe.provider, probe.language, probe.message),
      );
      result = bounded.result;
      httpCalls = bounded.httpCalls;
    } catch (error) {
      httpCalls = error instanceof BoundedProbeError ? error.httpCalls : 0;
      result = { ok: false, errorCategory: error instanceof Error ? error.message : 'unknown' };
    }
    const completedAtMs = dependencies.now();
    const errorCategory = result.ok ? null : dependencies.classifyError(
      result.errorCategory === 'probe_watchdog_timeout' ? 'timeout' : result.errorCategory,
      result.status,
    );
    let persisted: Record<string, unknown>;
    let rows: PersistedRow[];
    try {
      persisted = await dependencies.persistAttempt({
        requestId,
        provider: probe.provider,
        model: result.model,
        intentClass: 'internal',
        language: probe.language,
        route: 'web',
        startedAtMs,
        completedAtMs,
        success: result.ok,
        errorCategory: errorCategory ?? undefined,
        fallbackHop: 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        groundingStatus: result.ok ? 'grounded-global-web' : 'fallback-provider-unavailable',
      });
      rows = await readBackWithBound(dependencies, requestId, 0);
    } catch {
      const failureManifest: ManifestRecord = {
        provider: probe.provider,
        request_id: requestId,
        language: probe.language,
        timestamp: new Date(completedAtMs).toISOString(),
        actual_model: typeof result.model === 'string' ? result.model : null,
        http_invocation_confirmed: httpCalls > 0,
        status_category: 'persistence_verification_failed',
        latency_ms: Math.max(0, completedAtMs - startedAtMs),
        persistence_confirmed: false,
        observability_row_id: null,
        classification: 'DIRECT',
      };
      dependencies.appendManifest(manifestPath, failureManifest);
      manifestRecords.push(failureManifest);
      throw new Error('persistence_verification_failed');
    }
    const persistenceConfirmed = rowsMatch(persisted, rows);
    const manifest: ManifestRecord = {
      provider: probe.provider,
      request_id: requestId,
      language: probe.language,
      timestamp: new Date(completedAtMs).toISOString(),
      actual_model: typeof result.model === 'string' ? result.model : null,
      http_invocation_confirmed: httpCalls > 0,
      status_category: result.ok ? 'success' : (errorCategory ?? 'unknown'),
      latency_ms: Math.max(0, completedAtMs - startedAtMs),
      persistence_confirmed: persistenceConfirmed,
      observability_row_id: persistenceConfirmed && typeof rows[0].attempt_id === 'string' ? rows[0].attempt_id : null,
      classification: 'DIRECT',
    };
    dependencies.appendManifest(manifestPath, manifest);
    manifestRecords.push(manifest);
    if (!result.ok || httpCalls === 0 || !persistenceConfirmed) passed = false;
  }
  return { passed, probes: manifestRecords };
}

function providerKey(provider: CertificationProvider): string {
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'gemini') return (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY)?.trim() ?? '';
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  if (provider === 'xai') return process.env.XAI_API_KEY?.trim() ?? '';
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY?.trim() ?? '';
  if (provider === 'qwen') return (process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY)?.trim() ?? '';
  return process.env.MISTRAL_API_KEY?.trim() ?? '';
}

async function callCanonicalAdapter(provider: CertificationProvider, language: Language, message: string): Promise<ProviderResult> {
  const params = { apiKey: providerKey(provider), language, message, prompt: SYSTEM_PROMPT, timeoutMs: 90_000 };
  if (provider === 'openai') return callOpenAIResponsesWebSearch(params);
  if (provider === 'gemini') return callGeminiGoogleSearch(params);
  if (provider === 'anthropic') return callAnthropicMessagesWeb(params);
  if (provider === 'xai') return callXAIWebSearch(params);
  if (provider === 'deepseek') return callDeepSeekWebSearch(params);
  if (provider === 'qwen') return callQwenWebSearch(params);
  return callMistralWebSearch(params);
}

function isProbeWorkerData(value: unknown): value is ProbeWorkerData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProbeWorkerData>;
  return candidate.kind === 'dabra-provider-certification-probe'
    && typeof candidate.provider === 'string'
    && CERTIFICATION_PROVIDERS.includes(candidate.provider as CertificationProvider)
    && (candidate.language === 'ar' || candidate.language === 'en')
    && typeof candidate.message === 'string';
}

async function runProbeWorker(data: ProbeWorkerData): Promise<void> {
  const port = parentPort;
  if (!port) return;
  const originalFetch = globalThis.fetch;
  let httpCalls = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    if (httpCalls >= MAX_HTTP_CALLS_PER_PROBE) throw new Error('provider_http_call_limit_exceeded');
    httpCalls += 1;
    port.postMessage({ type: 'http_call', httpCalls } satisfies ProbeWorkerMessage);
    return originalFetch(...args);
  }) as typeof fetch;
  try {
    const result = normalizeProviderResult(await callCanonicalAdapter(data.provider, data.language, data.message));
    port.postMessage({ type: 'result', result, httpCalls } satisfies ProbeWorkerMessage);
  } catch (error) {
    const message = error instanceof Error && error.message === 'provider_http_call_limit_exceeded'
      ? error.message
      : 'provider_worker_failed';
    port.postMessage({ type: 'failure', code: message, httpCalls } satisfies ProbeWorkerMessage);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function normalizeProviderResult(result: ProviderResult): ProviderResult {
  return {
    ok: result.ok === true,
    ...(typeof result.model === 'string' ? { model: result.model } : {}),
    ...(typeof result.status === 'number' ? { status: result.status } : {}),
    ...(typeof result.errorCategory === 'string' ? { errorCategory: result.errorCategory } : {}),
    ...(typeof result.inputTokens === 'number' ? { inputTokens: result.inputTokens } : {}),
    ...(typeof result.outputTokens === 'number' ? { outputTokens: result.outputTokens } : {}),
  };
}

export function createIsolatedCanonicalProbe(
  provider: CertificationProvider,
  language: Language,
  message: string,
): ProbeExecution {
  // Node 20 does not consistently hand a .ts Worker entrypoint to --import tsx.
  // This static bootstrap registers the repository's existing TS loader inside
  // the isolated thread before importing the fixed module URL. Node 20 needs a
  // clean URL and an explicit tsconfig path so @/ aliases resolve in the worker.
  const probeModuleUrl = new URL(import.meta.url);
  probeModuleUrl.search = '';
  probeModuleUrl.hash = '';
  const probeTsconfigPath = resolve(dirname(fileURLToPath(probeModuleUrl)), '..', 'tsconfig.json');
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    void import('tsx/esm/api')
      .then(({ tsImport }) => tsImport(workerData.moduleUrl, {
        parentURL: workerData.moduleUrl,
        tsconfig: workerData.tsconfigPath,
      }))
      .catch(() => { throw new Error('provider_worker_bootstrap_failed'); });
  `, {
    eval: true,
    execArgv: [],
    workerData: {
      kind: 'dabra-provider-certification-probe', provider, language, message,
      moduleUrl: probeModuleUrl.href, tsconfigPath: probeTsconfigPath,
    } satisfies ProbeWorkerBootstrapData,
  });
  let httpCalls = 0;
  let settled = false;
  let terminated = false;
  const result = new Promise<ProviderResult>((resolveResult, rejectResult) => {
    worker.on('message', (message: ProbeWorkerMessage) => {
      httpCalls = Math.max(httpCalls, message.httpCalls);
      if (message.type === 'result') {
        settled = true;
        resolveResult(message.result);
      } else if (message.type === 'failure') {
        settled = true;
        rejectResult(new Error(message.code));
      }
    });
    worker.once('error', () => {
      if (!settled) {
        settled = true;
        rejectResult(new Error('provider_worker_failed'));
      }
    });
    worker.once('exit', () => {
      if (!settled && !terminated) {
        settled = true;
        rejectResult(new Error('provider_worker_failed'));
      }
    });
  });
  return {
    result,
    terminate: async () => {
      if (terminated) return;
      terminated = true;
      await worker.terminate();
    },
    httpCalls: () => httpCalls,
  };
}

async function createLiveDependencies(): Promise<CertificationDependencies> {
  const [{ mapProviderErrorCategory, recordDabraProviderAttempt }, { supabaseAdmin }] = await Promise.all([
    import('@/lib/ai2/observability/provider-attempts'),
    import('@/lib/supabase/server'),
  ]);
  if (!supabaseAdmin) throw new Error('admin_client_unavailable');
  return {
    readHardeningEvidence: async () => {
      const { data, error } = await supabaseAdmin
        .rpc('get_dabra_provider_observability_hardening_status')
        .abortSignal(AbortSignal.timeout(READBACK_LIMIT_MS));
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('production_hardening_evidence_unavailable');
      }
      return data as HardeningEvidence;
    },
    startProbe: createIsolatedCanonicalProbe,
    persistAttempt: (input) => recordDabraProviderAttempt(input as Parameters<typeof recordDabraProviderAttempt>[0]),
    readBack: async (requestId, fallbackHop, timeoutMs) => {
      const { data, error } = await supabaseAdmin
        .from('dabra_provider_attempts')
        .select(TELEMETRY_COLUMNS)
        .eq('request_id', requestId)
        .eq('fallback_hop', fallbackHop)
        .limit(2)
        .abortSignal(AbortSignal.timeout(Math.max(1, timeoutMs)));
      if (error) throw new Error(`telemetry_readback_failed:${error.code ?? 'unknown'}`);
      return (data ?? []) as unknown as PersistedRow[];
    },
    appendManifest: appendPrivateManifest,
    now: Date.now,
    uuid: randomUUID,
    sleep: (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    classifyError: mapProviderErrorCategory,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseCertificationArgs(argv);
  const plan = buildProbePlan(options.provider);
  if (!options.live) {
    process.stdout.write(`${JSON.stringify({
      mode: 'DRY_RUN', provider: options.provider, logicalProbes: plan.length,
      providerCalls: 0, databaseWrites: 0, certificationCredit: false,
    })}\n`);
    return 0;
  }
  const validated = validateLiveExecution(options, process.env, process.cwd());
  const selectedProviders = options.provider === 'all' ? CERTIFICATION_PROVIDERS : [options.provider];
  for (const provider of selectedProviders) {
    if (!providerKey(provider)) throw new Error(`provider_configuration_missing:${provider}`);
  }
  const result = await runLiveCertification(options, await createLiveDependencies(), validated.manifestPath);
  process.stdout.write(`${JSON.stringify({ mode: 'LIVE', passed: result.passed, probes: result.probes })}\n`);
  return result.passed ? 0 : 1;
}

if (!isMainThread && isProbeWorkerData(workerData)) {
  void runProbeWorker(workerData);
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: sanitizeCertificationError(error) })}\n`);
    process.exitCode = 1;
  });
}
