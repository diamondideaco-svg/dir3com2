import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const deepSeekProvider: AIProviderAdapter = {
  id: 'deepseek',
  isEnabled(config) {
    return config.aiEnabled && config.providers.deepseek.enabled && config.providers.deepseek.apiKey.length > 0;
  },
  async search(context) {
    return createMockProviderResponse('deepseek', context, 'Marketplace live ranking is not enabled');
  },
};
