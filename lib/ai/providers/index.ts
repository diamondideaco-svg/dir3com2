import { anthropicProvider } from '@/lib/ai/providers/anthropic';
import { azureOpenAIProvider } from '@/lib/ai/providers/azure-openai';
import { geminiProvider } from '@/lib/ai/providers/gemini';
import { localProvider } from '@/lib/ai/providers/local';
import { openAIProvider } from '@/lib/ai/providers/openai';
import type { AIProviderAdapter } from '@/lib/ai/types';

export const aiProviderRegistry: AIProviderAdapter[] = [
  openAIProvider,
  anthropicProvider,
  geminiProvider,
  azureOpenAIProvider,
  localProvider,
];
