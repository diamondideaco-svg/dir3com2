import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const openAIProvider: AIProviderAdapter = {
  id: 'openai',
  isEnabled(config) {
    return config.aiEnabled && config.providers.openai.enabled && config.providers.openai.apiKey.length > 0;
  },
  async search(context) {
    // DEV-020 foundation: no external API call yet.
    return createMockProviderResponse('openai', context, 'Mock OpenAI adapter (live integration disabled)');
  },
};
