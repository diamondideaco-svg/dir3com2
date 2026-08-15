const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 90_000;

export type GeminiWebErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'insufficient_quota'
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
  if (status === 404 || code.includes('not_found')) return 'model_not_found';
  if (message.includes('google_search') || message.includes('tool')) return 'web_search_unavailable';
  return 'upstream_error';
}

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseResponse(payload: unknown, status: number): GeminiWebCallResult {
  if (!payload || typeof payload !== 'object') return { ok: false, answer: '', citations: [], errorCategory: 'upstream_error', status };
  const root = payload as Record<string, unknown>;
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
    const uri = typeof web?.uri === 'string' ? web.uri.trim() : '';
    return uri && isSafeWebUrl(uri) ? [uri] : [];
  }))];
  if (!answer) return { ok: false, answer: '', citations, errorCategory: 'upstream_error', status };
  return { ok: true, answer, citations, status };
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
      return { ok: false, answer: '', citations: [], errorCategory: classifyError(response.status, (payload ?? {}) as GeminiErrorPayload), status: response.status };
    }
    return parseResponse(payload, response.status);
  } catch (error) {
    const timeout = error instanceof Error && /abort/i.test(error.message);
    return { ok: false, answer: '', citations: [], errorCategory: timeout ? 'timeout' : 'upstream_error' };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFallbackModel(apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as GeminiModelsPayload;
    const available = (payload.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => String(model.name ?? '').replace(/^models\//, ''));
    const preferred = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest'];
    return preferred.find((model) => available.includes(model)) ?? available.find((model) => model.startsWith('gemini-')) ?? null;
  } catch {
    return null;
  }
}

export async function callGeminiGoogleSearch(params: GeminiWebCallParams): Promise<GeminiWebCallResult> {
  if (!params.apiKey.trim()) return { ok: false, answer: '', citations: [], errorCategory: 'missing_key' };
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_GEMINI_TIMEOUT_MS);
  const model = normalizeModel(params.model ?? process.env.DABRA_GEMINI_MODEL);
  let result = await executeRequest(params, model, timeoutMs);
  if (!result.ok && (result.errorCategory === 'timeout' || result.errorCategory === 'upstream_error')) {
    result = await executeRequest(params, model, Math.min(MAX_TIMEOUT_MS, timeoutMs + 15_000));
  }
  if (!result.ok && result.errorCategory === 'model_not_found') {
    const fallback = await discoverFallbackModel(params.apiKey);
    if (fallback && fallback !== model) result = await executeRequest(params, fallback, Math.min(MAX_TIMEOUT_MS, timeoutMs + 10_000));
  }
  return result;
}
