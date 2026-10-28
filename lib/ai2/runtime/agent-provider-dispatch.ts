import 'server-only';
import { callOpenAICompatibleProvider } from './openai-compatible';
import { callAnthropicMessagesWeb } from './anthropic-web';
import { callGeminiGoogleSearch } from './gemini-web';
import type { AgentProviderId } from '../../dabra/agent-capabilities';
import { AGENT_TOOLS } from '../../dabra/agent-contract';

/** Shared existing seven transports. One attempt, fixed endpoints, no search/discovery. */
export async function callInternalAgentProvider(provider: AgentProviderId, config: { apiKey: string; model: string }, message: string, options: {
  prompt: string; language: 'ar' | 'en'; timeoutMs: number; signal?: AbortSignal; maxOutputTokens?: number;
  classifier?: boolean;
}) {
  if (options.signal?.aborted) return { ok: false, answer: '', citations: [], errorCategory: 'timeout' as const, model: config.model };
  const common = { ...config, message: options.classifier ? message.slice(0, 500) : message, prompt: options.prompt, timeoutMs: options.timeoutMs, singleAttempt: true,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}) };
  if (provider === 'gemini') return callGeminiGoogleSearch({ ...common, language: options.language, webSearch: false });
  if (provider === 'anthropic') return callAnthropicMessagesWeb({ ...common, language: options.language });
  const endpoints = {
    openai: 'https://api.openai.com/v1', xai: 'https://api.x.ai/v1', deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', mistral: 'https://api.mistral.ai/v1',
  };
  return callOpenAICompatibleProvider({ ...common, providerName: provider, baseUrl: endpoints[provider],
    retryCount: 0, preferredModels: [config.model],
    ...(provider === 'xai' && options.classifier ? { responseJsonSchema: { name: 'dir3com_read_tool', schema: {
      type: 'object', properties: { tool: { type: 'string', enum: [...AGENT_TOOLS] } }, required: ['tool'], additionalProperties: false,
    } } } : {}),
    ...(provider === 'openai' && /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(config.model)
      ? { chatProfile: 'gpt-5-classifier' as const } : {}),
  });
}


export function internalAgentConfiguration(provider: AgentProviderId) {
  const keyNames: Record<AgentProviderId, string[]> = {
    openai: ['OPENAI_API_KEY'], gemini: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'], xai: ['XAI_API_KEY'], deepseek: ['DEEPSEEK_API_KEY'],
    qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'], mistral: ['MISTRAL_API_KEY'],
  };
  const apiKey = keyNames[provider].map(key => process.env[key]?.trim()).find(Boolean);
  const model = (provider === 'openai' ? process.env.DABRA_INTERNAL_AI_MODEL : undefined)?.trim()
    || process.env[`DABRA_${provider.toUpperCase()}_MODEL`]?.trim();
  // No model discovery or arbitrary endpoint chosen by chat input.
  return apiKey && model && /^[a-zA-Z0-9._:/-]{1,120}$/.test(model) ? { apiKey, model } : null;
}
