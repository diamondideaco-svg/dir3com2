import { sanitizeCitationUrl } from '@/lib/ai2/runtime/openai-compatible';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 90_000;

export type OpenAIWebErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'invalid_request'
  | 'malformed_response'
  | 'insufficient_quota'
  | 'billing_or_identity'
  | 'model_not_found'
  | 'web_search_unavailable'
  | 'timeout'
  | 'upstream_error';

type OpenAIWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

type OpenAIWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: OpenAIWebErrorCategory;
  status?: number;
  requestId?: string | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

type OpenAIErrorPayload = {
  error?: {
    type?: string;
    code?: string;
    message?: string;
  };
};

type ModelsPayload = {
  data?: Array<{ id?: string }>;
};

function normalizeTimeout(input: string | undefined): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const bounded = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(parsed)));
  return bounded;
}

function normalizeModel(input: string | undefined): string {
  const candidate = (input ?? '').trim();
  return candidate || DEFAULT_MODEL;
}

function pickAvailableModel(ids: string[]): string | null {
  const preferred = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'];
  for (const model of preferred) {
    if (ids.includes(model)) {
      return model;
    }
  }

  const fallback = ids.find((id) => id.startsWith('gpt-'));
  return fallback ?? null;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const asRecord = payload as Record<string, unknown>;
  if (typeof asRecord.output_text === 'string') {
    return asRecord.output_text.trim();
  }

  const output = asRecord.output;
  if (!Array.isArray(output)) {
    return '';
  }

  const fragments: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const record = part as Record<string, unknown>;
      const text = record.text;
      if (typeof text === 'string' && text.trim()) {
        fragments.push(text.trim());
      }
    }
  }

  return fragments.join('\n').trim();
}

function extractTokenUsage(payload: unknown): Pick<OpenAIWebCallResult, 'inputTokens' | 'outputTokens'> {
  if (!payload || typeof payload !== 'object') return {};
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return {};
  const record = usage as Record<string, unknown>;
  const inputTokens = record.input_tokens;
  const outputTokens = record.output_tokens;
  return {
    ...(typeof inputTokens === 'number' && Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? { inputTokens } : {}),
    ...(typeof outputTokens === 'number' && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { outputTokens } : {}),
  };
}

function walkForCitationUrls(value: unknown, urls: string[]) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkForCitationUrls(item, urls);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  if (record.type === 'url_citation' && typeof record.url === 'string') {
    urls.push(record.url);
  }

  const sources = record.sources;
  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (source && typeof source === 'object') {
        const url = (source as Record<string, unknown>).url;
        if (typeof url === 'string') {
          urls.push(url);
        }
      }
    }
  }

  for (const nested of Object.values(record)) {
    walkForCitationUrls(nested, urls);
  }
}

export function extractValidWebCitations(payload: unknown): string[] {
  const raw: string[] = [];
  walkForCitationUrls(payload, raw);

  const unique = new Set<string>();
  for (const entry of raw) {
    const normalized = sanitizeCitationUrl(entry);
    if (!normalized) continue;
    unique.add(normalized);
  }

  return [...unique];
}

function classifyOpenAIError(status: number, payload: OpenAIErrorPayload): OpenAIWebErrorCategory {
  const type = String(payload.error?.type ?? '').toLowerCase();
  const code = String(payload.error?.code ?? '').toLowerCase();
  const message = String(payload.error?.message ?? '').toLowerCase();

  if (status === 401 || type.includes('authentication') || code.includes('invalid_api_key')) {
    return 'invalid_key';
  }

  if (status === 429 || code.includes('insufficient_quota')) {
    return 'insufficient_quota';
  }

  if (message.includes('billing') || message.includes('credit') || message.includes('identity verification')) {
    return 'billing_or_identity';
  }

  if (status === 404 || code.includes('model_not_found')) {
    return 'model_not_found';
  }

  if (code.includes('unsupported') || message.includes('web_search') || message.includes('tool')) {
    return 'web_search_unavailable';
  }

  if ((status >= 400 && status < 500) || message.includes('invalid request') || message.includes('bad request') || message.includes('malformed')) {
    return 'invalid_request';
  }

  return 'upstream_error';
}

export async function discoverOpenAIModel(apiKey: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(15_000, timeoutMs));
  try {
    const response = await fetch(OPENAI_MODELS_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
    signal: controller.signal,
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as ModelsPayload | null;
  const ids = (payload?.data ?? [])
    .map((item) => (typeof item.id === 'string' ? item.id : ''))
    .filter((id) => Boolean(id));

  if (ids.length === 0) {
    return null;
  }

    return pickAvailableModel(ids);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function executeResponsesWebRequest(
  apiKey: string,
  model: string,
  prompt: string,
  message: string,
  timeoutMs: number,
): Promise<OpenAIWebCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      instructions: prompt,
      input: message,
      tools: [{ type: 'web_search', search_context_size: 'low' }],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
    }),
  });

  const requestId = response.headers.get('x-request-id');

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as OpenAIErrorPayload | null;
    const category = classifyOpenAIError(response.status, payload ?? {});
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: category,
      status: response.status,
      requestId,
      model,
    };
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (payload === null) {
    return { ok: false, answer: '', citations: [], errorCategory: 'malformed_response', status: response.status, requestId, model };
  }
  const answer = extractOutputText(payload);
  const citations = extractValidWebCitations(payload);
  const usage = extractTokenUsage(payload);

  if (!answer) {
    return {
      ok: false,
      answer: '',
      citations,
      errorCategory: 'malformed_response',
      status: response.status,
      requestId,
      model,
      ...usage,
    };
  }

  return {
    ok: true,
    answer,
    citations,
    status: response.status,
    requestId,
    model,
    ...usage,
  };
  } catch (error) {
    const timedOut = error instanceof Error && /aborted|abort/i.test(error.message);
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: timedOut ? 'timeout' : 'upstream_error',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function callOpenAIResponsesWebSearch(params: OpenAIWebCallParams): Promise<OpenAIWebCallResult> {
  if (!params.apiKey.trim()) {
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: 'missing_key',
    };
  }

  const model = normalizeModel(params.model ?? process.env.DABRA_OPENAI_MODEL);
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_OPENAI_TIMEOUT_MS);
  const deadlineAt = Date.now() + timeoutMs;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());

  try {
    let firstAttempt = await executeResponsesWebRequest(params.apiKey, model, params.prompt, params.message, remainingMs());

    if (!firstAttempt.ok && (firstAttempt.errorCategory === 'timeout' || firstAttempt.errorCategory === 'upstream_error')) {
      if (remainingMs() <= 0) return { ...firstAttempt, errorCategory: 'timeout' };
      firstAttempt = await executeResponsesWebRequest(params.apiKey, model, params.prompt, params.message, remainingMs());
    }

    if (firstAttempt.ok) {
      return firstAttempt;
    }

    if (firstAttempt.errorCategory === 'model_not_found') {
      if (remainingMs() <= 0) return { ...firstAttempt, errorCategory: 'timeout' };
      const fallbackModel = await discoverOpenAIModel(params.apiKey, remainingMs());
      if (fallbackModel && fallbackModel !== model && remainingMs() > 0) {
        const retry = await executeResponsesWebRequest(
          params.apiKey,
          fallbackModel,
          params.prompt,
          params.message,
          remainingMs(),
        );
        if (retry.ok) {
          return retry;
        }
        return retry;
      }
    }

    return firstAttempt;
  } catch {
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: 'upstream_error',
    };
  }
}
