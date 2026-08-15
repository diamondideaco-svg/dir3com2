import {
  callOpenAICompatibleProvider,
  discoverOpenAICompatibleModel,
  normalizeModel,
  normalizeRetries,
  normalizeTimeout,
  type OpenAICompatibleErrorCategory,
} from '@/lib/ai2/runtime/openai-compatible';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
const DEEPSEEK_PREFERRED_MODELS = ['deepseek-chat', 'deepseek-reasoner'];

export type DeepSeekWebErrorCategory = OpenAICompatibleErrorCategory;

export type DeepSeekWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: DeepSeekWebErrorCategory;
  status?: number;
  model?: string;
};

type DeepSeekWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

export async function discoverDeepSeekModel(apiKey: string): Promise<string | null> {
  return discoverOpenAICompatibleModel(apiKey, DEEPSEEK_BASE_URL, DEEPSEEK_PREFERRED_MODELS);
}

export async function callDeepSeekWebSearch(params: DeepSeekWebCallParams): Promise<DeepSeekWebCallResult> {
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_DEEPSEEK_TIMEOUT_MS);
  const retryCount = normalizeRetries(process.env.DABRA_DEEPSEEK_MAX_RETRIES);
  const explicitModelRaw = params.model ?? process.env.DABRA_DEEPSEEK_MODEL;
  const model = explicitModelRaw && explicitModelRaw.trim()
    ? normalizeModel(explicitModelRaw, DEEPSEEK_DEFAULT_MODEL)
    : undefined;

  return callOpenAICompatibleProvider({
    providerName: 'deepseek',
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: params.apiKey,
    prompt: params.prompt,
    message: params.message,
    model,
    timeoutMs,
    retryCount,
    preferredModels: DEEPSEEK_PREFERRED_MODELS,
  });
}
