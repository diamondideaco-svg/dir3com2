import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const geminiProvider: AIProviderAdapter = {
  id: 'gemini',
  isEnabled(config) {
    return config.aiEnabled && config.providers.gemini.enabled && config.providers.gemini.apiKey.length > 0;
  },
  async search(context) {
    // DEV-020 foundation: no external API call yet.
    return createMockProviderResponse('gemini', context, 'Mock Gemini adapter (live integration disabled)');
  },
};
