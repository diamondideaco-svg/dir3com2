import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const azureOpenAIProvider: AIProviderAdapter = {
  id: 'azure-openai',
  isEnabled(config) {
    return config.aiEnabled && config.providers['azure-openai'].enabled && config.providers['azure-openai'].apiKey.length > 0;
  },
  async search(context) {
    // DEV-020 foundation: no external API call yet.
    return createMockProviderResponse('azure-openai', context, 'Mock Azure OpenAI adapter (live integration disabled)');
  },
};
