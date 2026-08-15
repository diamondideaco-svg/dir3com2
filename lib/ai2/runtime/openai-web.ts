const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 90_000;

export type OpenAIWebErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'insufficient_quota'
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

function pickAvailableModel(ids: string[]): string {
  const preferred = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'];
  for (const model of preferred) {
    if (ids.includes(model)) {
      return model;
    }
  }

  const fallback = ids.find((id) => id.startsWith('gpt-'));
  return fallback ?? DEFAULT_MODEL;
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

function isValidCitationUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }

    if (!isValidCitationUrl(normalized)) {
      continue;
    }

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

  if (status === 404 || code.includes('model_not_found')) {
    return 'model_not_found';
  }

  if (code.includes('unsupported') || message.includes('web_search') || message.includes('tool')) {
    return 'web_search_unavailable';
  }

  return 'upstream_error';
}

async function getBestAvailableModel(apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
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
    };
  }

  const payload = (await response.json()) as unknown;
  const answer = extractOutputText(payload);
  const citations = extractValidWebCitations(payload);

  if (!answer) {
    return {
      ok: false,
      answer: '',
      citations,
      errorCategory: 'upstream_error',
      status: response.status,
      requestId,
    };
  }

  return {
    ok: true,
    answer,
    citations,
    status: response.status,
    requestId,
  };
  } catch (error) {
    const timedOut = error instanceof Error && /aborted|abort/i.test(error.message);
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: timedOut ? 'timeout' : 'upstream_error',
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

  try {
    let firstAttempt = await executeResponsesWebRequest(params.apiKey, model, params.prompt, params.message, timeoutMs);

    if (!firstAttempt.ok && (firstAttempt.errorCategory === 'timeout' || firstAttempt.errorCategory === 'upstream_error')) {
      firstAttempt = await executeResponsesWebRequest(params.apiKey, model, params.prompt, params.message, timeoutMs);
    }

    if (firstAttempt.ok) {
      return firstAttempt;
    }

    if (firstAttempt.errorCategory === 'model_not_found') {
      const fallbackModel = await getBestAvailableModel(params.apiKey);
      if (fallbackModel && fallbackModel !== model) {
        const retry = await executeResponsesWebRequest(
          params.apiKey,
          fallbackModel,
          params.prompt,
          params.message,
          timeoutMs,
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
