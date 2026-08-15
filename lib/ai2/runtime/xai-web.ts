import {
  callOpenAICompatibleProvider,
  discoverOpenAICompatibleModel,
  normalizeModel,
  normalizeRetries,
  normalizeTimeout,
  type OpenAICompatibleErrorCategory,
} from '@/lib/ai2/runtime/openai-compatible';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_DEFAULT_MODEL = 'grok-4-0709';
const XAI_PREFERRED_MODELS = ['grok-4-0709', 'grok-4', 'grok-3', 'grok-3-mini'];

export type XAIWebErrorCategory = OpenAICompatibleErrorCategory;

export type XAIWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: XAIWebErrorCategory;
  status?: number;
  model?: string;
};

type XAIWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

export async function discoverXAIModel(apiKey: string): Promise<string | null> {
  return discoverOpenAICompatibleModel(apiKey, XAI_BASE_URL, XAI_PREFERRED_MODELS);
}

export async function callXAIWebSearch(params: XAIWebCallParams): Promise<XAIWebCallResult> {
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_XAI_TIMEOUT_MS);
  const retryCount = normalizeRetries(process.env.DABRA_XAI_MAX_RETRIES);
  const model = normalizeModel(params.model ?? process.env.DABRA_XAI_MODEL, XAI_DEFAULT_MODEL);

  const result = await callOpenAICompatibleProvider({
    providerName: 'xai',
    baseUrl: XAI_BASE_URL,
    apiKey: params.apiKey,
    prompt: params.prompt,
    message: params.message,
    model,
    timeoutMs,
    retryCount,
    preferredModels: XAI_PREFERRED_MODELS,
  });

  return result;
}
