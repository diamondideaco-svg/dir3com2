import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const anthropicProvider: AIProviderAdapter = {
  id: 'anthropic',
  isEnabled(config) {
    return config.aiEnabled && config.providers.anthropic.enabled && config.providers.anthropic.apiKey.length > 0;
  },
  async search(context) {
    // DEV-020 foundation: no external API call yet.
    return createMockProviderResponse('anthropic', context, 'Mock Claude adapter (live integration disabled)');
  },
};
