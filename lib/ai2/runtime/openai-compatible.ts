export type OpenAICompatibleErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'insufficient_quota'
  | 'model_not_found'
  | 'web_search_unavailable'
  | 'timeout'
  | 'upstream_error'
  | 'billing_or_identity';

export type OpenAICompatibleResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: OpenAICompatibleErrorCategory;
  status?: number;
  model?: string;
};

export type OpenAICompatibleParams = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  prompt: string;
  message: string;
  model?: string;
  timeoutMs: number;
  retryCount: number;
  preferredModels: string[];
  extraHeaders?: Record<string, string>;
};

export const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
const MODEL_DISCOVERY_CACHE_TTL_MS = 5 * 60_000;
const discoveredModelCache = new Map<string, { model: string; expiresAt: number }>();

function discoveryCacheKey(apiKey: string, baseUrl: string): string {
  const credentialFingerprint = createHash('sha256').update(apiKey).digest('hex');
  return `${baseUrl}\u0000${credentialFingerprint}`;
}

export function clearOpenAICompatibleModelCacheForTests(): void {
  discoveredModelCache.clear();
}

type OpenAICompatibleErrorPayload = {
  code?: string;
  message?: string;
  error_description?: string;
  detail?: string;
  error_text?: string;
  error?: string | {
    type?: string;
    code?: string;
    message?: string;
  };
};

type OpenAICompatibleModelsPayload = {
  data?: Array<{ id?: string }>;
};

export function normalizeTimeout(value: string | undefined, defaultMs = 45_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultMs;
  }

  return Math.min(90_000, Math.max(10_000, Math.trunc(parsed)));
}

export function normalizeRetries(value: string | undefined, defaultRetries = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultRetries;
  }

  return Math.min(2, Math.max(0, Math.trunc(parsed)));
}

export function normalizeModel(value: string | undefined, fallback: string): string {
  const candidate = (value ?? '').trim().replace(/^models\//, '');
  return candidate || fallback;
}

function normalizeErrorString(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function extractErrorJoined(payload: OpenAICompatibleErrorPayload): string {
  const topCode = normalizeErrorString(payload.code);
  const topMessage = normalizeErrorString(payload.message);
  const topDesc = normalizeErrorString(payload.error_description);
  const topDetail = normalizeErrorString(payload.detail);
  const topText = normalizeErrorString(payload.error_text);
  const topError = normalizeErrorString(payload.error);

  const nestedType = typeof payload.error === 'object' ? normalizeErrorString(payload.error?.type) : '';
  const nestedCode = typeof payload.error === 'object' ? normalizeErrorString(payload.error?.code) : '';
  const nestedMessage = typeof payload.error === 'object' ? normalizeErrorString(payload.error?.message) : '';

  return [topCode, topMessage, topDesc, topDetail, topText, topError, nestedType, nestedCode, nestedMessage]
    .filter(Boolean)
    .join(' ');
}

function classifyError(status: number, payload: OpenAICompatibleErrorPayload): OpenAICompatibleErrorCategory {
  const joined = extractErrorJoined(payload);

  if (
    status === 401
    || status === 403
    || joined.includes('unauthorized')
    || joined.includes('invalid_api_key')
    || joined.includes('incorrect api key')
  ) {
    return 'invalid_key';
  }

  if (status === 429 || joined.includes('quota') || joined.includes('rate limit')) {
    return 'insufficient_quota';
  }

  if (joined.includes('billing') || joined.includes('payment') || joined.includes('identity verification') || joined.includes('credit')) {
    return 'billing_or_identity';
  }

  if (status === 404 || joined.includes('model_not_found') || joined.includes('model not found')) {
    return 'model_not_found';
  }

  if (joined.includes('web_search') || joined.includes('tool') || joined.includes('search is not available')) {
    return 'web_search_unavailable';
  }

  return 'upstream_error';
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const root = payload as Record<string, unknown>;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }

  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') {
    return '';
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      return String((item as Record<string, unknown>).text ?? '').trim();
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractCitations(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
  const unique = new Set<string>();
  for (const entry of matches) {
    const normalized = entry.trim();
    if (isSafeUrl(normalized)) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

async function callChatCompletions(
  params: OpenAICompatibleParams,
  model: string,
  timeoutMs: number,
): Promise<OpenAICompatibleResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        'content-type': 'application/json',
        ...(params.extraHeaders ?? {}),
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: params.prompt },
          { role: 'user', content: params.message },
        ],
        temperature: 0,
        max_tokens: 700,
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        answer: '',
        citations: [],
        errorCategory: classifyError(response.status, (payload ?? {}) as OpenAICompatibleErrorPayload),
        status: response.status,
        model,
      };
    }

    const answer = extractText(payload);
    const citations = extractCitations(answer);
    if (!answer) {
      return {
        ok: false,
        answer: '',
        citations: [],
        errorCategory: 'upstream_error',
        status: response.status,
        model,
      };
    }

    return {
      ok: true,
      answer,
      citations,
      status: response.status,
      model,
    };
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timed out/i.test(error.message);
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

export async function discoverOpenAICompatibleModel(
  apiKey: string,
  baseUrl: string,
  preferredModels: string[],
  extraHeaders?: Record<string, string>,
  timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS,
): Promise<string | null> {
  const cacheKey = discoveryCacheKey(apiKey, baseUrl);
  const cached = discoveredModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.model;
  if (cached) discoveredModelCache.delete(cacheKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(MODEL_DISCOVERY_TIMEOUT_MS, timeoutMs));
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(extraHeaders ?? {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as OpenAICompatibleModelsPayload | null;
    const ids = (payload?.data ?? [])
      .map((item) => String(item.id ?? '').replace(/^models\//, ''))
      .filter(Boolean);

    if (ids.length === 0) {
      return null;
    }

    for (const preferred of preferredModels) {
      if (ids.includes(preferred)) {
        discoveredModelCache.set(cacheKey, { model: preferred, expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS });
        return preferred;
      }
    }

    const selected = ids[0] ?? null;
    if (selected) discoveredModelCache.set(cacheKey, { model: selected, expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS });
    return selected;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(category: OpenAICompatibleErrorCategory | undefined): boolean {
  return category === 'timeout' || category === 'upstream_error';
}

export async function callOpenAICompatibleProvider(params: OpenAICompatibleParams): Promise<OpenAICompatibleResult> {
  if (!params.apiKey.trim()) {
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: 'missing_key',
    };
  }

  const discovered = params.model
    ? null
    : await discoverOpenAICompatibleModel(params.apiKey, params.baseUrl, params.preferredModels, params.extraHeaders, params.timeoutMs);

  const selectedModel = params.model ?? discovered ?? params.preferredModels[0];
  let result = await callChatCompletions(params, selectedModel, params.timeoutMs);

  for (let attempt = 0; attempt < params.retryCount && !result.ok && shouldRetry(result.errorCategory); attempt += 1) {
    result = await callChatCompletions(params, selectedModel, params.timeoutMs);
  }

  if (!result.ok && result.errorCategory === 'model_not_found' && !params.model) {
    const fallbackModel = await discoverOpenAICompatibleModel(
      params.apiKey,
      params.baseUrl,
      params.preferredModels,
      params.extraHeaders,
      params.timeoutMs,
    );

    if (fallbackModel && fallbackModel !== selectedModel) {
      result = await callChatCompletions(params, fallbackModel, params.timeoutMs);
    }
  }

  return result;
}
import { createHash } from 'node:crypto';
