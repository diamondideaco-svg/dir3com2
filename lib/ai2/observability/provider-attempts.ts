import { randomUUID } from 'node:crypto';
import { estimateProviderCostUsd } from '@/lib/ai2/observability/provider-pricing';
import { supabaseAdmin } from '@/lib/supabase/server';

export const DABRA_OBSERVED_PROVIDERS = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'] as const;
export type DabraObservedProvider = (typeof DABRA_OBSERVED_PROVIDERS)[number];
export type DabraProviderIntentClass = 'internal' | 'general' | 'fresh-web' | 'travel-plan' | 'other';
export type DabraProviderRoute = 'fast-chat' | 'web';
export type DabraProviderErrorCategory =
  | 'timeout'
  | 'upstream_503'
  | 'rate_limit'
  | 'authentication'
  | 'configuration'
  | 'model_access'
  | 'provider_error'
  | 'deadline_exceeded'
  | 'unknown';

export type DabraProviderAttemptRecord = {
  attempt_id: string;
  request_id: string;
  provider: DabraObservedProvider;
  model: string | null;
  intent_class: DabraProviderIntentClass;
  language: 'ar' | 'en';
  route: DabraProviderRoute;
  started_at: string;
  completed_at: string;
  latency_ms: number;
  success: boolean;
  error_category: DabraProviderErrorCategory | null;
  fallback_from: DabraObservedProvider | null;
  fallback_reason: DabraProviderErrorCategory | null;
  fallback_hop: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  pricing_version: string | null;
  grounding_status: 'grounded-global-web' | 'answered-general' | 'fallback-provider-unavailable';
  created_at: string;
};

export type DabraProviderAttemptInput = {
  requestId: string;
  provider: DabraObservedProvider;
  model?: string;
  intentClass: DabraProviderIntentClass;
  language: 'ar' | 'en';
  route: DabraProviderRoute;
  startedAtMs: number;
  completedAtMs: number;
  success: boolean;
  errorCategory?: DabraProviderErrorCategory;
  fallbackFrom?: DabraObservedProvider;
  fallbackReason?: DabraProviderErrorCategory;
  fallbackHop: number;
  inputTokens?: number;
  outputTokens?: number;
  groundingStatus: DabraProviderAttemptRecord['grounding_status'];
};

type AttemptWriter = (record: DabraProviderAttemptRecord, signal: AbortSignal) => Promise<void>;
let testWriter: AttemptWriter | null = null;
let warnedAdminUnavailable = false;

export const DABRA_TELEMETRY_PERSIST_TIMEOUT_MS = 1_000;

function safeTelemetryProvider(value: unknown): DabraObservedProvider | 'unknown' {
  return DABRA_OBSERVED_PROVIDERS.includes(value as DabraObservedProvider)
    ? value as DabraObservedProvider
    : 'unknown';
}

function safeTelemetryFallbackHop(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeTokenCount(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function createDabraProviderRequestId(): string {
  return randomUUID();
}

export function mapProviderErrorCategory(error: string | undefined, status?: number): DabraProviderErrorCategory {
  if (status === 503) return 'upstream_503';
  if (error === 'timeout') return 'timeout';
  if (error === 'deadline_exceeded') return 'deadline_exceeded';
  if (error === 'invalid_key') return 'authentication';
  if (error === 'missing_key' || error === 'configuration_error') return 'configuration';
  if (error === 'insufficient_quota') return 'rate_limit';
  if (error === 'model_not_found' || error === 'web_search_unavailable' || error === 'billing_or_identity') return 'model_access';
  if (error === 'upstream_error' || error === 'invalid_request' || error === 'malformed_response' || error === 'safety_blocked') {
    return 'provider_error';
  }
  return 'unknown';
}

export function buildDabraProviderAttempt(input: DabraProviderAttemptInput): DabraProviderAttemptRecord {
  const inputTokens = safeTokenCount(input.inputTokens);
  const outputTokens = safeTokenCount(input.outputTokens);
  const completedAtMs = Math.max(input.startedAtMs, input.completedAtMs);
  const cost = estimateProviderCostUsd({
    provider: input.provider,
    model: input.model ?? null,
    inputTokens,
    outputTokens,
    attemptedAtMs: completedAtMs,
    pricingCheckedAtMs: completedAtMs,
  });

  // Explicit allow-list: prompts, answers, names, emails, headers and provider bodies cannot be persisted.
  return {
    attempt_id: randomUUID(),
    request_id: input.requestId,
    provider: input.provider,
    model: input.model ?? null,
    intent_class: input.intentClass,
    language: input.language,
    route: input.route,
    started_at: new Date(input.startedAtMs).toISOString(),
    completed_at: new Date(completedAtMs).toISOString(),
    latency_ms: completedAtMs - input.startedAtMs,
    success: input.success,
    error_category: input.success ? null : (input.errorCategory ?? 'unknown'),
    fallback_from: input.fallbackFrom ?? null,
    fallback_reason: input.fallbackReason ?? null,
    fallback_hop: Math.max(0, Math.trunc(input.fallbackHop)),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost.estimatedCostUsd,
    pricing_version: cost.pricingVersion,
    grounding_status: input.groundingStatus,
    created_at: new Date(completedAtMs).toISOString(),
  };
}

async function defaultWriter(record: DabraProviderAttemptRecord, signal: AbortSignal): Promise<void> {
  if (!supabaseAdmin) {
    if (!warnedAdminUnavailable) {
      warnedAdminUnavailable = true;
      console.warn('DABRA_PROVIDER_ATTEMPT_WRITE_SKIPPED', JSON.stringify({ reason: 'admin_client_unavailable' }));
    }
    return;
  }
  const { error } = await supabaseAdmin
    .from('dabra_provider_attempts')
    .insert(record)
    .abortSignal(signal);
  if (error?.code === '23505') {
    console.warn('DABRA_PROVIDER_ATTEMPT_DUPLICATE_SUPPRESSED', JSON.stringify({
      attemptId: record.attempt_id,
      provider: safeTelemetryProvider(record.provider),
      fallbackHop: safeTelemetryFallbackHop(record.fallback_hop),
    }));
    return;
  }
  if (error) throw new Error('telemetry_persist_insert_failed');
}

function logPersistenceFailure(
  record: DabraProviderAttemptRecord,
  failureCategory: 'insert_failure' | 'timeout',
): void {
  console.error('DABRA_TELEMETRY_PERSIST_FAILED', JSON.stringify({
    classification: 'telemetry_persist_failed',
    failureCategory,
    attemptId: record.attempt_id,
    provider: safeTelemetryProvider(record.provider),
    fallbackHop: safeTelemetryFallbackHop(record.fallback_hop),
    operation: 'insert',
    errorCategory: failureCategory === 'timeout' ? 'timeout' : 'persistence_failed',
    error: failureCategory === 'timeout' ? 'telemetry_persist_timeout' : 'telemetry_persist_failure',
  }));
}

export async function recordDabraProviderAttempt(
  input: DabraProviderAttemptInput,
  persistenceTimeoutMs = DABRA_TELEMETRY_PERSIST_TIMEOUT_MS,
): Promise<DabraProviderAttemptRecord> {
  const record = buildDabraProviderAttempt(input);
  const abortController = new AbortController();
  const timeoutMs = Number.isFinite(persistenceTimeoutMs) && persistenceTimeoutMs > 0
    ? Math.max(1, Math.trunc(persistenceTimeoutMs))
    : DABRA_TELEMETRY_PERSIST_TIMEOUT_MS;
  const writeOutcome = Promise.resolve()
    .then(() => (testWriter ?? defaultWriter)(record, abortController.signal))
    .then(
      () => ({ status: 'success' as const }),
      () => ({ status: 'failure' as const }),
    );
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutOutcome = new Promise<{ status: 'timeout' }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ status: 'timeout' });
      abortController.abort();
    }, timeoutMs);
  });
  const outcome = await Promise.race([writeOutcome, timeoutOutcome]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (outcome.status === 'timeout') {
    logPersistenceFailure(record, 'timeout');
  } else if (outcome.status === 'failure') {
    logPersistenceFailure(record, 'insert_failure');
  }
  return record;
}

export type DabraProviderAttemptScheduler = (input: DabraProviderAttemptInput) => void;
export type DabraAfterResponseRegistrar = (task: () => void | Promise<void>) => void;

export function createDabraProviderAttemptAfterResponseScheduler(
  registerAfterResponse: DabraAfterResponseRegistrar,
  persistenceTimeoutMs = DABRA_TELEMETRY_PERSIST_TIMEOUT_MS,
): DabraProviderAttemptScheduler {
  return (input) => {
    try {
      registerAfterResponse(async () => { await recordDabraProviderAttempt(input, persistenceTimeoutMs); });
    } catch {
      console.error('DABRA_TELEMETRY_SCHEDULE_FAILED', JSON.stringify({
        classification: 'telemetry_schedule_failed',
        provider: safeTelemetryProvider(input.provider),
        fallbackHop: safeTelemetryFallbackHop(input.fallbackHop),
        operation: 'schedule',
        errorCategory: 'schedule_failed',
      }));
    }
  };
}

export function setDabraProviderAttemptWriterForTests(writer: AttemptWriter | null): void {
  testWriter = writer;
}

export async function getDabraProviderMetrics(sinceIso: string) {
  if (!supabaseAdmin) return { data: null, error: 'admin_client_unavailable' } as const;
  return supabaseAdmin.rpc('get_dabra_provider_metrics', { p_since: sinceIso });
}
