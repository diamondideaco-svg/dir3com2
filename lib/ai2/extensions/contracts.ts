import type { AI2RagMatch } from '@/lib/ai2/rag/index-design';

export type AI2PromptVersion = {
  family: string;
  version: string;
};

export type AI2AnswerEnvelope = {
  answer: string;
  language: 'ar' | 'en';
  groundingStatus: 'grounded' | 'grounded-global-web' | 'grounded-external' | 'fallback-no-source' | 'fallback-provider-unavailable';
  retrievalMode: 'internal-rag' | 'openai-web-search' | 'deepseek-chat-completions';
  provider: 'local' | 'openai' | 'deepseek';
  sourceTrace: readonly AI2RagMatch[];
  promptVersion: AI2PromptVersion;
};

export type AI2ProviderHealth = {
  providerName: string;
  configured: boolean;
  available: boolean;
  checkedAt: string;
};

export type AI2ObservabilityEvent = {
  requestId: string;
  latencyMs: number;
  retrievalCount: number;
  fallbackReason?: string;
  provider: AI2ProviderHealth;
};

export const AI2_PROMPT_VERSION: AI2PromptVersion = {
  family: 'dabra-core',
  version: '2.0.0-prep',
};
