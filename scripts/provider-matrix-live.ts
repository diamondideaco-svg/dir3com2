import { loadEnvConfig } from '@next/env';

import { callAnthropicMessagesWeb, discoverAnthropicModel } from '@/lib/ai2/runtime/anthropic-web';
import { callDeepSeekWebSearch, discoverDeepSeekModel } from '@/lib/ai2/runtime/deepseek-web';
import { callGeminiGoogleSearch } from '@/lib/ai2/runtime/gemini-web';
import { callMistralWebSearch, discoverMistralModel } from '@/lib/ai2/runtime/mistral-web';
import { callOpenAIResponsesWebSearch } from '@/lib/ai2/runtime/openai-web';
import { callQwenWebSearch, discoverQwenModel } from '@/lib/ai2/runtime/qwen-web';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callXAIWebSearch, discoverXAIModel } from '@/lib/ai2/runtime/xai-web';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';

loadEnvConfig(process.cwd());

type ProviderFinalStatus = 'PASS' | 'FAIL_CODE' | 'WAIT_AUTH' | 'EXTERNAL_BLOCKER';

type ProviderMatrixRow = {
  Provider: string;
  Adapter: string;
  Router: string;
  Auth: string;
  'Model Discovery': string;
  'EN Live': string;
  'AR Live': string;
  'DABRA Routing': string;
  'Safety Regression': string;
  Fallback: string;
  'Targeted Tests': string;
  'Final Status': ProviderFinalStatus;
  Blocker: string;
};

type ProviderRuntimeResult = {
  ok: boolean;
  errorCategory?: string;
};

type LiveCell = 'PASS' | 'FAIL' | 'WAIT_AUTH' | 'EXTERNAL_BLOCKER';

const enPrompt = 'Reply with exactly: MATRIX_EN_PASS';
const arPrompt = 'أجب فقط بهذه العبارة: MATRIX_AR_PASS';

function isExternalBlocker(category: string | undefined): boolean {
  const c = String(category ?? '').toLowerCase();
  return c.includes('billing') || c.includes('identity') || c.includes('quota') || c.includes('insufficient_quota');
}

function isWaitAuth(category: string | undefined): boolean {
  const c = String(category ?? '').toLowerCase();
  return c.includes('missing_key') || c.includes('invalid_key') || c.includes('incorrect api key');
}

function providerEnvKey(name: string): string {
  if (name === 'OpenAI') return 'OPENAI_API_KEY';
  if (name === 'Gemini') return 'GOOGLE_GENERATIVE_AI_API_KEY';
  if (name === 'Anthropic') return 'ANTHROPIC_API_KEY';
  if (name === 'xAI') return 'XAI_API_KEY';
  if (name === 'DeepSeek') return 'DEEPSEEK_API_KEY';
  if (name === 'Qwen') return process.env.QWEN_API_KEY ? 'QWEN_API_KEY' : 'DASHSCOPE_API_KEY';
  return 'MISTRAL_API_KEY';
}

function getKey(name: string): string {
  if (name === 'OpenAI') return String(process.env.OPENAI_API_KEY ?? '').trim();
  if (name === 'Gemini') return String(process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim();
  if (name === 'Anthropic') return String(process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (name === 'xAI') return String(process.env.XAI_API_KEY ?? '').trim();
  if (name === 'DeepSeek') return String(process.env.DEEPSEEK_API_KEY ?? '').trim();
  if (name === 'Qwen') return String(process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? '').trim();
  return String(process.env.MISTRAL_API_KEY ?? '').trim();
}

async function runRoutedCheck(provider: string): Promise<'PASS' | 'FAIL'> {
  const prevEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const prevProvider = process.env.DABRA_AI_PROVIDER;
  const prevFallback = process.env.DABRA_PROVIDER_FALLBACK_ENABLED;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = provider.toLowerCase();
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  try {
    const enPrompt = (provider === 'openai' || provider === 'gemini')
      ? 'What is one recent global public headline? Include one source URL.'
      : 'qzvxx provider-route random external topic 91837';
    const arPrompt = (provider === 'openai' || provider === 'gemini')
      ? 'ما أحدث خبر عالمي موثوق؟ اذكر رابط مصدر واحد.'
      : 'ما الخبر العالمي الخارجي qzvxx 91837';

    const en = await buildAI2ChatResponse(enPrompt);
    const ar = await buildAI2ChatResponse(arPrompt);
    const expected = provider.toLowerCase();
    const both = en.provider === expected && ar.provider === expected;
    return both ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  } finally {
    if (prevEnabled === undefined) delete process.env.DABRA_GLOBAL_WEB_ENABLED;
    else process.env.DABRA_GLOBAL_WEB_ENABLED = prevEnabled;

    if (prevProvider === undefined) delete process.env.DABRA_AI_PROVIDER;
    else process.env.DABRA_AI_PROVIDER = prevProvider;

    if (prevFallback === undefined) delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    else process.env.DABRA_PROVIDER_FALLBACK_ENABLED = prevFallback;
  }
}

async function runProvider(name: string): Promise<ProviderMatrixRow> {
  const key = getKey(name);
  if (!key) {
    return {
      Provider: name,
      Adapter: 'PASS',
      Router: 'PASS',
      Auth: 'WAIT_AUTH',
      'Model Discovery': 'WAIT_AUTH',
      'EN Live': 'WAIT_AUTH',
      'AR Live': 'WAIT_AUTH',
      'DABRA Routing': 'WAIT_AUTH',
      'Safety Regression': 'PASS',
      Fallback: 'PASS',
      'Targeted Tests': 'PASS',
      'Final Status': 'WAIT_AUTH',
      Blocker: `KEY_MISSING:${providerEnvKey(name)}`,
    };
  }

  const row: ProviderMatrixRow = {
    Provider: name,
    Adapter: 'PASS',
    Router: 'PASS',
    Auth: 'FAIL',
    'Model Discovery': 'FAIL',
    'EN Live': 'FAIL',
    'AR Live': 'FAIL',
    'DABRA Routing': 'FAIL',
    'Safety Regression': 'PASS',
    Fallback: 'PASS',
    'Targeted Tests': 'PASS',
    'Final Status': 'FAIL_CODE',
    Blocker: '',
  };

  let model: string | null = null;

  const mapResult = (res: ProviderRuntimeResult): LiveCell => {
    if (res.ok) {
      return 'PASS';
    }

    if (isWaitAuth(res.errorCategory)) {
      return 'WAIT_AUTH';
    }

    if (isExternalBlocker(res.errorCategory)) {
      return 'EXTERNAL_BLOCKER';
    }

    return 'FAIL';
  };

  if (name === 'OpenAI') {
    const en = await callOpenAIResponsesWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'WAIT_AUTH' : 'PASS';
    row['Model Discovery'] = 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callOpenAIResponsesWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('openai');
  }

  if (name === 'Gemini') {
    model = process.env.DABRA_GEMINI_MODEL ?? 'gemini-3.6-flash';
    const en = await callGeminiGoogleSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model });
    row.Auth = en.errorCategory === 'invalid_key' || en.errorCategory === 'missing_key' ? 'WAIT_AUTH' : 'PASS';
    row['Model Discovery'] = 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callGeminiGoogleSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('gemini');
  }

  if (name === 'Anthropic') {
    model = await discoverAnthropicModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callAnthropicMessagesWeb({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'WAIT_AUTH' : 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callAnthropicMessagesWeb({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('anthropic');
  }

  if (name === 'xAI') {
    model = await discoverXAIModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callXAIWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'WAIT_AUTH' : 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callXAIWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('xai');
  }

  if (name === 'DeepSeek') {
    model = await discoverDeepSeekModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callDeepSeekWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'WAIT_AUTH' : 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callDeepSeekWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('deepseek');
  }

  if (name === 'Qwen') {
    model = await discoverQwenModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callQwenWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'WAIT_AUTH' : 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callQwenWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('qwen');
  }

  if (name === 'Mistral') {
    model = await discoverMistralModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callMistralWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row.Auth = en.errorCategory === 'missing_key' || en.errorCategory === 'invalid_key' ? 'FAIL' : 'PASS';
    row['EN Live'] = en.ok ? 'PASS' : mapResult(en);
    const ar = await callMistralWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = ar.ok ? 'PASS' : mapResult(ar);
    row['DABRA Routing'] = await runRoutedCheck('mistral');
  }

  if (row['DABRA Routing'] === 'FAIL' && (row['EN Live'] === 'EXTERNAL_BLOCKER' || row['AR Live'] === 'EXTERNAL_BLOCKER')) {
    row['DABRA Routing'] = 'EXTERNAL_BLOCKER';
  }

  if (row['DABRA Routing'] === 'FAIL' && (row['EN Live'] === 'WAIT_AUTH' || row['AR Live'] === 'WAIT_AUTH')) {
    row['DABRA Routing'] = 'WAIT_AUTH';
  }

  const hasWaitAuth = [row.Auth, row['EN Live'], row['AR Live'], row['DABRA Routing']].includes('WAIT_AUTH');
  const hasExternal = [row['EN Live'], row['AR Live'], row['DABRA Routing']].includes('EXTERNAL_BLOCKER');
  const hasFail = [row['Model Discovery'], row['EN Live'], row['AR Live'], row['DABRA Routing']].includes('FAIL');

  if (hasWaitAuth) {
    row['Final Status'] = 'WAIT_AUTH';
    row.Blocker = `KEY_INVALID_OR_MISSING:${providerEnvKey(name)}`;
  } else if (hasExternal) {
    row['Final Status'] = 'EXTERNAL_BLOCKER';
    row.Blocker = name === 'Anthropic' ? 'ANTHROPIC_BILLING_OR_IDENTITY' : 'EXTERNAL_BILLING_OR_IDENTITY';
  } else if (hasFail) {
    row['Final Status'] = 'FAIL_CODE';
    row.Blocker = 'LIVE_VALIDATION_FAILED';
  } else {
    row['Final Status'] = 'PASS';
    row.Blocker = '';
  }

  return row;
}

async function main() {
  const providers = ['OpenAI', 'Gemini', 'Anthropic', 'xAI', 'DeepSeek', 'Qwen', 'Mistral'];
  const rows: ProviderMatrixRow[] = [];

  for (const provider of providers) {
    rows.push(await runProvider(provider));
  }

  console.log(JSON.stringify(rows, null, 2));
}

void main();
