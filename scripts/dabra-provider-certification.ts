import { randomUUID } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  invokeAdapter: (provider: CertificationProvider, language: Language, message: string) => Promise<ProviderResult>;
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
    if (!match) throw new Error(`unsupported_argument:${argument}`);
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
    try { fchmodSync(descriptor, 0o600); } catch { /* Windows privacy is owned by the pre-provisioned private directory ACL. */ }
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  } finally {
    closeSync(descriptor);
  }
}

export async function invokeWithProbeBounds(
  invocation: () => Promise<ProviderResult>,
  watchdogMs = PROBE_WATCHDOG_MS,
): Promise<{ result: ProviderResult; httpCalls: number }> {
  const originalFetch = globalThis.fetch;
  let httpCalls = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    if (httpCalls >= MAX_HTTP_CALLS_PER_PROBE) throw new Error('provider_http_call_limit_exceeded');
    httpCalls += 1;
    return originalFetch(...args);
  }) as typeof fetch;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('probe_watchdog_timeout')), watchdogMs);
    });
    try {
      return { result: await Promise.race([invocation(), timeout]), httpCalls };
    } catch (error) {
      throw new BoundedProbeError(error instanceof Error ? error.message : 'provider_invocation_failed', httpCalls);
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
    globalThis.fetch = originalFetch;
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
        () => dependencies.invokeAdapter(probe.provider, probe.language, probe.message),
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
    const persisted = await dependencies.persistAttempt({
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
    const rows = await readBackWithBound(dependencies, requestId, 0);
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

async function createLiveDependencies(): Promise<CertificationDependencies> {
  const [{ mapProviderErrorCategory, recordDabraProviderAttempt }, { supabaseAdmin }] = await Promise.all([
    import('@/lib/ai2/observability/provider-attempts'),
    import('@/lib/supabase/server'),
  ]);
  if (!supabaseAdmin) throw new Error('admin_client_unavailable');
  return {
    invokeAdapter: callCanonicalAdapter,
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' })}\n`);
    process.exitCode = 1;
  });
}
