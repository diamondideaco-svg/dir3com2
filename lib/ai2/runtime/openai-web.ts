const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_TIMEOUT_MS = 20_000;

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
};

function normalizeTimeout(input: string | undefined): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const bounded = Math.min(30_000, Math.max(5_000, Math.trunc(parsed)));
  return bounded;
}

function normalizeModel(input: string | undefined): string {
  const candidate = (input ?? '').trim();
  return candidate || DEFAULT_MODEL;
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

export async function callOpenAIResponsesWebSearch(params: OpenAIWebCallParams): Promise<OpenAIWebCallResult> {
  const model = normalizeModel(params.model ?? process.env.DABRA_OPENAI_MODEL);
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_OPENAI_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: params.prompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: params.message,
              },
            ],
          },
        ],
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        answer: '',
        citations: [],
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
      };
    }

    return {
      ok: true,
      answer,
      citations,
    };
  } catch {
    return {
      ok: false,
      answer: '',
      citations: [],
    };
  } finally {
    clearTimeout(timer);
  }
}