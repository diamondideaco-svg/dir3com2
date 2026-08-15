const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 1;
const MAX_RETRIES = 2;

export type DeepSeekErrorCategory =
  | 'missing_key'
  | 'auth_failure'
  | 'rate_limit'
  | 'billing_blocker'
  | 'model_unavailable'
  | 'timeout'
  | 'network_error'
  | 'provider_error'
  | 'malformed_response';

export type DeepSeekCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
};

export type DeepSeekCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  providerModel?: string;
  errorCategory?: DeepSeekErrorCategory;
  httpStatus?: number;
  retryable?: boolean;
};

type ErrorPayload = { error?: { type?: string; code?: string; message?: string } };

function boundedInteger(value: number | string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

function classifyError(status: number, payload: ErrorPayload): DeepSeekErrorCategory {
  const probe = `${payload.error?.type ?? ''} ${payload.error?.code ?? ''} ${payload.error?.message ?? ''}`.toLowerCase();
  if (status === 401 || status === 403 || probe.includes('authentication') || probe.includes('invalid api key')) return 'auth_failure';
  if (status === 429 || probe.includes('rate limit')) return 'rate_limit';
  if (probe.includes('balance') || probe.includes('billing') || probe.includes('credit') || probe.includes('payment')) return 'billing_blocker';
  if (status === 404 || (probe.includes('model') && (probe.includes('unavailable') || probe.includes('not found')))) return 'model_unavailable';
  return 'provider_error';
}

function extractAnswer(payload: unknown): { answer: string; model?: string } {
  if (!payload || typeof payload !== 'object') return { answer: '' };
  const root = payload as Record<string, unknown>;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  return {
    answer: typeof message?.content === 'string' ? message.content.trim() : '',
    model: typeof root.model === 'string' ? root.model : undefined,
  };
}

function isRetryable(category: DeepSeekErrorCategory, status?: number) {
  return category === 'timeout' || category === 'network_error' || category === 'rate_limit' || (category === 'provider_error' && Boolean(status && status >= 500));
}

async function callOnce(params: DeepSeekCallParams, model: string, timeoutMs: number): Promise<DeepSeekCallResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  params.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.apiKey}` },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: params.prompt },
          { role: 'user', content: params.message },
        ],
        max_tokens: 1024,
        temperature: 0,
        thinking: { type: 'disabled' },
        stream: false,
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const errorCategory = classifyError(response.status, (payload ?? {}) as ErrorPayload);
      return { ok: false, answer: '', citations: [], providerModel: model, errorCategory, httpStatus: response.status, retryable: isRetryable(errorCategory, response.status) };
    }

    const parsed = extractAnswer(payload);
    if (!parsed.answer) {
      return { ok: false, answer: '', citations: [], providerModel: parsed.model ?? model, errorCategory: 'malformed_response', httpStatus: response.status, retryable: false };
    }
    return { ok: true, answer: parsed.answer, citations: [], providerModel: parsed.model ?? model, httpStatus: response.status, retryable: false };
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && /abort/i.test(error.message));
    const errorCategory: DeepSeekErrorCategory = aborted ? 'timeout' : 'network_error';
    return { ok: false, answer: '', citations: [], providerModel: model, errorCategory, retryable: true };
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function callDeepSeekChat(params: DeepSeekCallParams): Promise<DeepSeekCallResult> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) return { ok: false, answer: '', citations: [], errorCategory: 'missing_key', retryable: false };
  const model = (params.model ?? process.env.DABRA_DEEPSEEK_MODEL ?? '').trim() || DEFAULT_MODEL;
  const timeoutMs = params.timeoutMs ?? boundedInteger(process.env.DABRA_DEEPSEEK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const retries = params.maxRetries ?? boundedInteger(process.env.DABRA_DEEPSEEK_MAX_RETRIES, DEFAULT_RETRIES, 0, MAX_RETRIES);
  let result: DeepSeekCallResult = { ok: false, answer: '', citations: [], providerModel: model, errorCategory: 'provider_error', retryable: false };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    result = await callOnce({ ...params, apiKey }, model, timeoutMs);
    if (result.ok || !result.retryable || params.signal?.aborted) break;
  }
  return result;
}
