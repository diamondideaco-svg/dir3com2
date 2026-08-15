import {
  callOpenAICompatibleProvider,
  discoverOpenAICompatibleModel,
  normalizeModel,
  normalizeRetries,
  normalizeTimeout,
  type OpenAICompatibleErrorCategory,
} from '@/lib/ai2/runtime/openai-compatible';

const QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_DEFAULT_MODEL = 'qwen-plus';
const QWEN_PREFERRED_MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];

export type QwenWebErrorCategory = OpenAICompatibleErrorCategory;

export type QwenWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: QwenWebErrorCategory;
  status?: number;
  model?: string;
};

type QwenWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

export async function discoverQwenModel(apiKey: string): Promise<string | null> {
  return discoverOpenAICompatibleModel(apiKey, QWEN_BASE_URL, QWEN_PREFERRED_MODELS);
}

export async function callQwenWebSearch(params: QwenWebCallParams): Promise<QwenWebCallResult> {
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_QWEN_TIMEOUT_MS);
  const retryCount = normalizeRetries(process.env.DABRA_QWEN_MAX_RETRIES);
  const model = normalizeModel(params.model ?? process.env.DABRA_QWEN_MODEL, QWEN_DEFAULT_MODEL);

  return callOpenAICompatibleProvider({
    providerName: 'qwen',
    baseUrl: QWEN_BASE_URL,
    apiKey: params.apiKey,
    prompt: params.prompt,
    message: params.message,
    model,
    timeoutMs,
    retryCount,
    preferredModels: QWEN_PREFERRED_MODELS,
  });
}
