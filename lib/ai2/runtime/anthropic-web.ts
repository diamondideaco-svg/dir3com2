import { createHash } from 'node:crypto';

import { sanitizeCitationUrl } from '@/lib/ai2/runtime/openai-compatible';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
export const ANTHROPIC_DISCOVERY_CACHE_MAX_ENTRIES = 128;
const MODEL_DISCOVERY_CACHE_TTL_MS = 5 * 60_000;
const modelCache = new Map<string, { model: string; expiresAt: number }>();

type AnthropicErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'invalid_request'
  | 'malformed_response'
  | 'insufficient_quota'
  | 'model_not_found'
  | 'timeout'
  | 'upstream_error'
  | 'billing_or_identity';

export type AnthropicWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: AnthropicErrorCategory;
  status?: number;
  model?: string;
};

type AnthropicModelsPayload = {
  data?: Array<{ id?: string }>;
};

type AnthropicErrorPayload = {
  error?: {
    type?: string;
    message?: string;
  };
};

type AnthropicWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

const PREFERRED_MODELS = [
  'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-latest',
  'claude-sonnet-4-0',
  'claude-opus-4-0',
];

function normalizeModel(value: string | undefined): string {
  const candidate = (value ?? '').trim();
  return candidate || DEFAULT_MODEL;
}

function normalizeTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 45_000;
  }

  return Math.min(90_000, Math.max(10_000, Math.trunc(parsed)));
}

function classifyError(status: number, payload: AnthropicErrorPayload): AnthropicErrorCategory {
  const type = String(payload.error?.type ?? '').toLowerCase();
  const message = String(payload.error?.message ?? '').toLowerCase();
  const joined = `${type} ${message}`;

  if (status === 401 || status === 403 || joined.includes('authentication') || joined.includes('api key')) {
    return 'invalid_key';
  }

  if (status === 429 || joined.includes('rate') || joined.includes('quota')) {
    return 'insufficient_quota';
  }

  if (joined.includes('billing') || joined.includes('credit') || joined.includes('identity') || joined.includes('verification')) {
    return 'billing_or_identity';
  }

  if (status === 404 || joined.includes('model') && joined.includes('not found')) {
    return 'model_not_found';
  }

  if ((status >= 400 && status < 500) || joined.includes('invalid request') || joined.includes('bad request') || joined.includes('malformed')) {
    return 'invalid_request';
  }

  return 'upstream_error';
}

function extractCitations(answer: string): string[] {
  const matches = answer.match(/https?:\/\/[^\s)\]]+/g) ?? [];
  const unique = new Set<string>();
  for (const entry of matches) {
    const normalized = sanitizeCitationUrl(entry);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function extractAnswer(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const content = (payload as Record<string, unknown>).content;
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

export async function discoverAnthropicModel(apiKey: string, timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS): Promise<string | null> {
  const cacheKey = createHash('sha256').update(apiKey).digest('hex');
  pruneExpiredCacheEntries();
  const cached = modelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.model;
  if (cached) modelCache.delete(cacheKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(MODEL_DISCOVERY_TIMEOUT_MS, timeoutMs));
  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/models`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as AnthropicModelsPayload | null;
    const ids = (payload?.data ?? []).map((item) => String(item.id ?? '')).filter(Boolean);

    for (const model of PREFERRED_MODELS) {
      if (ids.includes(model)) {
        setCacheEntry(cacheKey, model);
        return model;
      }
    }

    const selected = ids[0] ?? null;
    if (selected) setCacheEntry(cacheKey, selected);
    return selected;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pruneExpiredCacheEntries(now = Date.now()): void {
  for (const [key, value] of modelCache.entries()) {
    if (value.expiresAt <= now) modelCache.delete(key);
  }
}

function setCacheEntry(cacheKey: string, model: string): void {
  const now = Date.now();
  pruneExpiredCacheEntries(now);
  if (modelCache.has(cacheKey)) modelCache.delete(cacheKey);
  modelCache.set(cacheKey, { model, expiresAt: now + MODEL_DISCOVERY_CACHE_TTL_MS });
  while (modelCache.size > ANTHROPIC_DISCOVERY_CACHE_MAX_ENTRIES) {
    const oldest = modelCache.keys().next().value;
    if (!oldest) break;
    modelCache.delete(oldest);
  }
}

export function clearAnthropicModelCacheForTests(): void {
  modelCache.clear();
}

export function getAnthropicModelCacheSizeForTests(): number {
  return modelCache.size;
}

export function getAnthropicModelCacheKeysForTests(): string[] {
  return [...modelCache.keys()];
}

async function callAnthropicOnce(
  apiKey: string,
  model: string,
  prompt: string,
  message: string,
  timeoutMs: number,
): Promise<AnthropicWebCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: prompt,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        answer: '',
        citations: [],
        errorCategory: classifyError(response.status, (payload ?? {}) as AnthropicErrorPayload),
        status: response.status,
        model,
      };
    }

    const answer = extractAnswer(payload);
    if (!answer) {
      return {
        ok: false,
        answer: '',
        citations: [],
        errorCategory: 'malformed_response',
        status: response.status,
        model,
      };
    }

    return {
      ok: true,
      answer,
      citations: extractCitations(answer),
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

export async function callAnthropicMessagesWeb(params: AnthropicWebCallParams): Promise<AnthropicWebCallResult> {
  if (!params.apiKey.trim()) {
    return {
      ok: false,
      answer: '',
      citations: [],
      errorCategory: 'missing_key',
    };
  }

  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_ANTHROPIC_TIMEOUT_MS);
  const deadlineAt = Date.now() + timeoutMs;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());
  const configuredModel = normalizeModel(params.model ?? process.env.DABRA_ANTHROPIC_MODEL);
  const discoveredModel = params.model ? null : await discoverAnthropicModel(params.apiKey, remainingMs());
  const model = discoveredModel ?? configuredModel;

  if (remainingMs() <= 0) return { ok: false, answer: '', citations: [], errorCategory: 'timeout', model };
  let result = await callAnthropicOnce(params.apiKey, model, params.prompt, params.message, remainingMs());
  if (!result.ok && (result.errorCategory === 'timeout' || result.errorCategory === 'upstream_error')) {
    if (remainingMs() <= 0) return { ...result, errorCategory: 'timeout' };
    result = await callAnthropicOnce(params.apiKey, model, params.prompt, params.message, remainingMs());
  }

  return result;
}
