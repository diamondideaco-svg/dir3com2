import type { AIProviderId, AISearchConfig } from '@/lib/ai/types';

function isTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function key(value: string | undefined) {
  return value?.trim() ?? '';
}

function providerEnvEnabled(providerId: string) {
  return isTrue(process.env[`AI_SEARCH_${providerId.toUpperCase().replace(/-/g, '_')}_ENABLED`]);
}

function providerConfig(provider: AIProviderId, apiKey: string) {
  const explicit = providerEnvEnabled(provider);
  const enabled = explicit || (isTrue(process.env.AI_SEARCH_ENABLED) && apiKey.length > 0);

  return {
    enabled,
    apiKey,
  };
}

export function getAISearchConfig(): AISearchConfig {
  const aiEnabled = isTrue(process.env.AI_SEARCH_ENABLED) || isTrue(process.env.NEXT_PUBLIC_AI_SEARCH_ENABLED);

  const openaiKey = key(process.env.OPENAI_API_KEY);
  const anthropicKey = key(process.env.ANTHROPIC_API_KEY);
  const geminiKey = key(process.env.GOOGLE_GEMINI_API_KEY);
  const deepSeekKey = key(process.env.DEEPSEEK_API_KEY);
  const azureOpenAIKey = key(process.env.AZURE_OPENAI_API_KEY);

  const provider = (process.env.AI_SEARCH_PROVIDER?.trim() as AIProviderId | undefined) ?? 'local';

  return {
    aiEnabled,
    provider,
    providers: {
      openai: providerConfig('openai', openaiKey),
      anthropic: providerConfig('anthropic', anthropicKey),
      gemini: providerConfig('gemini', geminiKey),
      deepseek: providerConfig('deepseek', deepSeekKey),
      'azure-openai': providerConfig('azure-openai', azureOpenAIKey),
      local: {
        enabled: true,
        apiKey: '',
      },
    },
  };
}

export function isPublicAISearchEnabled() {
  return isTrue(process.env.NEXT_PUBLIC_AI_SEARCH_ENABLED);
}
