import {
  callOpenAICompatibleProvider,
  discoverOpenAICompatibleModel,
  normalizeModel,
  normalizeRetries,
  normalizeTimeout,
  type OpenAICompatibleErrorCategory,
} from '@/lib/ai2/runtime/openai-compatible';

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const MISTRAL_DEFAULT_MODEL = 'mistral-small-latest';
const MISTRAL_PREFERRED_MODELS = ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'];

export type MistralWebErrorCategory = OpenAICompatibleErrorCategory;

export type MistralWebCallResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: MistralWebErrorCategory;
  status?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

type MistralWebCallParams = {
  message: string;
  language: 'ar' | 'en';
  prompt: string;
  model?: string;
  apiKey: string;
  timeoutMs?: number;
};

export async function discoverMistralModel(apiKey: string): Promise<string | null> {
  return discoverOpenAICompatibleModel(apiKey, MISTRAL_BASE_URL, MISTRAL_PREFERRED_MODELS);
}

export async function callMistralWebSearch(params: MistralWebCallParams): Promise<MistralWebCallResult> {
  const timeoutMs = params.timeoutMs ?? normalizeTimeout(process.env.DABRA_MISTRAL_TIMEOUT_MS);
  const retryCount = normalizeRetries(process.env.DABRA_MISTRAL_MAX_RETRIES);
  const explicitModelRaw = params.model ?? process.env.DABRA_MISTRAL_MODEL;
  const model = explicitModelRaw && explicitModelRaw.trim()
    ? normalizeModel(explicitModelRaw, MISTRAL_DEFAULT_MODEL)
    : undefined;

  return callOpenAICompatibleProvider({
    providerName: 'mistral',
    baseUrl: MISTRAL_BASE_URL,
    apiKey: params.apiKey,
    prompt: params.prompt,
    message: params.message,
    model,
    timeoutMs,
    retryCount,
    preferredModels: MISTRAL_PREFERRED_MODELS,
  });
}
