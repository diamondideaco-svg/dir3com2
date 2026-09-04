import { createHash } from 'node:crypto';

import { sanitizeCitationUrl } from '@/lib/ai2/runtime/openai-compatible';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 90_000;
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
export const GEMINI_DISCOVERY_CACHE_MAX_ENTRIES = 128;
const MODEL_DISCOVERY_CACHE_TTL_MS = 5 * 60_000;
const fallbackModelCache = new Map<string, { model: string; expiresAt: number }>();

export type GeminiWebErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'invalid_request'
  | 'malformed_response'
  | 'insufficient_quota'
  | 'billing_or_identity'
  | 'model_not_found'
  | 'web_search_unavailable'
  | 'safety_blocked'
  | 'timeout'
  | 'upstream_error';

export type GeminiWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: GeminiWebErrorCategory;
  status?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

type GeminiWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

type GeminiErrorPayload = {
  error?: { code?: number; status?: string; message?: string };
};

type GeminiModelsPayload = {
  models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
};

function normalizeTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(parsed)));
}

function normalizeModel(value: string | undefined): string {
  return (value ?? '').trim().replace(/^models\//, '') || DEFAULT_MODEL;
}

function classifyError(status: number, payload: GeminiErrorPayload): GeminiWebErrorCategory {
  const code = String(payload.error?.status ?? '').toLowerCase();
  const message = String(payload.error?.message ?? '').toLowerCase();
  if (status === 401 || status === 403 || code.includes('unauthenticated') || code.includes('permission_denied')) return 'invalid_key';
  if (status === 429 || code.includes('resource_exhausted')) return 'insufficient_quota';
  if (message.includes('billing') || message.includes('credit') || message.includes('identity')) return 'billing_or_identity';
  if (status === 404 || code.includes('not_found')) return 'model_not_found';
  if (message.includes('google_search') || message.includes('tool')) return 'web_search_unavailable';
  if ((status >= 400 && status < 500) || message.includes('invalid request') || message.includes('bad request') || message.includes('malformed')) return 'invalid_request';
  return 'upstream_error';
}

function parseResponse(payload: unknown, status: number, model: string): GeminiWebCallResult {
  if (!payload || typeof payload !== 'object') return { ok: false, answer: '', citations: [], errorCategory: 'malformed_response', status, model };
  const root = payload as Record<string, unknown>;
  const usageMetadata = root.usageMetadata as Record<string, unknown> | undefined;
  const inputTokens = usageMetadata?.promptTokenCount;
  const outputTokens = usageMetadata?.candidatesTokenCount;
  const usage = {
    ...(typeof inputTokens === 'number' && Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? { inputTokens } : {}),
    ...(typeof outputTokens === 'number' && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? { outputTokens } : {}),
  };
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const candidate = candidates[0] as Record<string, unknown> | undefined;
  const finishReason = String(candidate?.finishReason ?? '').toUpperCase();
  if (finishReason === 'SAFETY' || finishReason === 'BLOCKLIST' || finishReason === 'PROHIBITED_CONTENT') {
    return { ok: false, answer: '', citations: [], errorCategory: 'safety_blocked', status };
  }
  const content = candidate?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const answer = parts
    .map((part) => (part && typeof part === 'object' ? String((part as Record<string, unknown>).text ?? '').trim() : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  const grounding = candidate?.groundingMetadata as Record<string, unknown> | undefined;
  const chunks = Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [];
  const citations = [...new Set(chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== 'object') return [];
    const web = (chunk as Record<string, unknown>).web as Record<string, unknown> | undefined;
    const uri = typeof web?.uri === 'string' ? sanitizeCitationUrl(web.uri) : null;
    return uri ? [uri] : [];
  }))];
  if (!answer) return { ok: false, answer: '', citations, errorCategory: 'malformed_response', status, model, ...usage };
  return { ok: true, answer, citations, status, model, ...usage };
}

function pruneExpiredCacheEntries(now = Date.now()): void {
  for (const [key, value] of fallbackModelCache.entries()) {
    if (value.expiresAt <= now) fallbackModelCache.delete(key);
  }
}

function setCacheEntry(cacheKey: string, model: string): void {
  const now = Date.now();
  pruneExpiredCacheEntries(now);
  if (fallbackModelCache.has(cacheKey)) fallbackModelCache.delete(cacheKey);
  fallbackModelCache.set(cacheKey, { model, expiresAt: now + MODEL_DISCOVERY_CACHE_TTL_MS });
  while (fallbackModelCache.size > GEMINI_DISCOVERY_CACHE_MAX_ENTRIES) {
    const oldest = fallbackModelCache.keys().next().value;
    if (!oldest) break;
    fallbackModelCache.delete(oldest);
  }
}

export function clearGeminiModelCacheForTests(): void {
  fallbackModelCache.clear();
}

export function getGeminiModelCacheSizeForTests(): number {
  return fallbackModelCache.size;
}

export function getGeminiModelCacheKeysForTests(): string[] {
  return [...fallbackModelCache.keys()];
}

async function executeRequest(params: GeminiWebCallParams, model: string, timeoutMs: number): Promise<GeminiWebCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': params.apiKey },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.prompt }] },
        contents: [{ role: 'user', parts: [{ text: params.message }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return { ok: false, answer: '', citations: [], errorCategory: classifyError(response.status, (payload ?? {}) as GeminiErrorPayload), status: response.status, model };
    }
    return parseResponse(payload, response.status, model);
  } catch (error) {
    const timeout = error instanceof Error && /abort/i.test(error.message);
    return { ok: false, answer: '', citations: [], errorCategory: timeout ? 'timeout' : 'upstream_error', model };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFallbackModel(apiKey: string, timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS): Promise<string | null> {
  const cacheKey = createHash('sha256').update(apiKey).digest('hex');
  pruneExpiredCacheEntries();
  const cached = fallbackModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.model;
  if (cached) fallbackModelCache.delete(cacheKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(MODEL_DISCOVERY_TIMEOUT_MS, timeoutMs));
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as GeminiModelsPayload;
    const available = (payload.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => String(model.name ?? '').replace(/^models\//, ''));
    const preferred = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest'];
    const selected = preferred.find((model) => available.includes(model)) ?? available.find((model) => model.startsWith('gemini-')) ?? null;
    if (selected) setCacheEntry(cacheKey, selected);
    return selected;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverGeminiModel(apiKey: string, timeoutMs = MODEL_DISCOVERY_TIMEOUT_MS): Promise<string | null> {
  return discoverFallbackModel(apiKey, timeoutMs);
}

export async function callGeminiGoogleSearch(params: GeminiWebCallParams): Promise<GeminiWebCallResult> {
  if (!params.apiKey.trim()) return { ok: false, answer: '', citations: [], errorCategory: 'missing_key' };
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_GEMINI_TIMEOUT_MS);
  const deadlineAt = Date.now() + timeoutMs;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());
  const model = normalizeModel(params.model ?? process.env.DABRA_GEMINI_MODEL);
  let result = await executeRequest(params, model, remainingMs());
  if (!result.ok && (result.errorCategory === 'timeout' || result.errorCategory === 'upstream_error')) {
    if (remainingMs() <= 0) return { ...result, errorCategory: 'timeout' };
    result = await executeRequest(params, model, remainingMs());
  }
  if (!result.ok && result.errorCategory === 'model_not_found') {
    if (remainingMs() <= 0) return { ...result, errorCategory: 'timeout' };
    const fallback = await discoverFallbackModel(params.apiKey, remainingMs());
    if (fallback && fallback !== model && remainingMs() > 0) result = await executeRequest(params, fallback, remainingMs());
  }
  return result;
}
