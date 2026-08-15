const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;
const MODEL_DISCOVERY_CACHE_TTL_MS = 5 * 60_000;
const modelCache = new Map<string, { model: string; expiresAt: number }>();

type AnthropicErrorCategory =
  | 'missing_key'
  | 'invalid_key'
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

  return 'upstream_error';
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractCitations(answer: string): string[] {
  const matches = answer.match(/https?:\/\/[^\s)\]]+/g) ?? [];
  const unique = new Set<string>();
  for (const entry of matches) {
    const normalized = entry.trim();
    if (isSafeUrl(normalized)) {
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
        modelCache.set(cacheKey, { model, expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS });
        return model;
      }
    }

    const selected = ids[0] ?? null;
    if (selected) modelCache.set(cacheKey, { model: selected, expiresAt: Date.now() + MODEL_DISCOVERY_CACHE_TTL_MS });
    return selected;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
        errorCategory: 'upstream_error',
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
  const configuredModel = normalizeModel(params.model ?? process.env.DABRA_ANTHROPIC_MODEL);
  const discoveredModel = params.model ? null : await discoverAnthropicModel(params.apiKey, timeoutMs);
  const model = discoveredModel ?? configuredModel;

  let result = await callAnthropicOnce(params.apiKey, model, params.prompt, params.message, timeoutMs);
  if (!result.ok && (result.errorCategory === 'timeout' || result.errorCategory === 'upstream_error')) {
    result = await callAnthropicOnce(params.apiKey, model, params.prompt, params.message, timeoutMs);
  }

  return result;
}
import { createHash } from 'node:crypto';
