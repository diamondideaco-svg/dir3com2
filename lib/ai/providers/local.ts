import type { AIProviderAdapter } from '@/lib/ai/types';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';

export const localProvider: AIProviderAdapter = {
  id: 'local',
  isEnabled() {
    return true;
  },
  async search(context) {
    return createMockProviderResponse('local', context, 'Local deterministic fallback');
  },
};
