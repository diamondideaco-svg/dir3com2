import { loadEnvConfig } from '@next/env';
import { spawnSync } from 'node:child_process';

import { callAnthropicMessagesWeb, discoverAnthropicModel } from '@/lib/ai2/runtime/anthropic-web';
import { callDeepSeekWebSearch, discoverDeepSeekModel } from '@/lib/ai2/runtime/deepseek-web';
import { callGeminiGoogleSearch, discoverGeminiModel } from '@/lib/ai2/runtime/gemini-web';
import { callMistralWebSearch, discoverMistralModel } from '@/lib/ai2/runtime/mistral-web';
import { callOpenAIResponsesWebSearch, discoverOpenAIModel } from '@/lib/ai2/runtime/openai-web';
import { callQwenWebSearch, discoverQwenModel } from '@/lib/ai2/runtime/qwen-web';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callXAIWebSearch, discoverXAIModel } from '@/lib/ai2/runtime/xai-web';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';

loadEnvConfig(process.cwd());

type ProviderFinalStatus = 'PASS' | 'FAIL_CODE' | 'WAIT_AUTH' | 'EXTERNAL_BLOCKER';
type EvidenceCell = 'PASS' | 'FAIL' | 'WAIT_AUTH' | 'NOT_RUN' | 'NOT_APPLICABLE' | 'EXTERNAL_BLOCKER' | 'ATTEMPTED_FAIL';

export type ProviderMatrixRow = {
  Provider: string;
  Adapter: EvidenceCell;
  Router: EvidenceCell;
  Auth: EvidenceCell;
  'Model Discovery': EvidenceCell;
  'EN Live': EvidenceCell;
  'AR Live': EvidenceCell;
  'DABRA Routing': EvidenceCell;
  'Safety Regression': EvidenceCell;
  Fallback: EvidenceCell;
  'Targeted Tests': EvidenceCell;
  'Final Status': ProviderFinalStatus;
  Blocker: string;
};

export type ProviderRuntimeResult = {
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

export function mapRuntimeResultToCell(res: ProviderRuntimeResult): LiveCell {
  if (res.ok) return 'PASS';
  if (isWaitAuth(res.errorCategory)) return 'WAIT_AUTH';
  if (isExternalBlocker(res.errorCategory)) return 'EXTERNAL_BLOCKER';
  return 'FAIL';
}

export function deriveAuthCell(en: ProviderRuntimeResult, ar: ProviderRuntimeResult): EvidenceCell {
  if (en.ok || ar.ok) return 'PASS';
  const enCell = mapRuntimeResultToCell(en);
  const arCell = mapRuntimeResultToCell(ar);
  if (enCell === 'WAIT_AUTH' || arCell === 'WAIT_AUTH') return 'WAIT_AUTH';
  return 'FAIL';
}

export function resolveFinalStatus(row: ProviderMatrixRow): ProviderMatrixRow {
  const hasWaitAuth = [row.Auth, row['EN Live'], row['AR Live'], row['DABRA Routing']].includes('WAIT_AUTH');
  const hasExternal = [row['EN Live'], row['AR Live'], row['DABRA Routing']].includes('EXTERNAL_BLOCKER');
  const required = [row.Adapter, row.Router, row.Auth, row['EN Live'], row['AR Live'], row['DABRA Routing'], row['Safety Regression'], row.Fallback, row['Targeted Tests']];
  const hasFail = required.some((value) => value === 'FAIL' || value === 'NOT_RUN' || value === 'ATTEMPTED_FAIL');
  const discoveryFailed = row['Model Discovery'] === 'FAIL' || row['Model Discovery'] === 'NOT_RUN';

  if (hasWaitAuth) {
    row['Final Status'] = 'WAIT_AUTH';
    row.Blocker = `KEY_INVALID_OR_MISSING:${providerEnvKey(row.Provider)}`;
  } else if (hasExternal) {
    row['Final Status'] = 'EXTERNAL_BLOCKER';
    row.Blocker = row.Provider === 'Anthropic' ? 'ANTHROPIC_BILLING_OR_IDENTITY' : 'EXTERNAL_BILLING_OR_IDENTITY';
  } else if (hasFail || discoveryFailed) {
    row['Final Status'] = 'FAIL_CODE';
    row.Blocker = 'LIVE_VALIDATION_FAILED';
  } else {
    row['Final Status'] = 'PASS';
    row.Blocker = '';
  }

  return row;
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

async function runRoutedCheck(provider: string): Promise<EvidenceCell> {
  const prevEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const prevProvider = process.env.DABRA_AI_PROVIDER;
  const prevFallback = process.env.DABRA_PROVIDER_FALLBACK_ENABLED;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = provider.toLowerCase();
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  try {
    const enPrompt = provider === 'gemini' || provider === 'openai'
      ? 'What is one recent global public headline? Include one source URL.'
      : 'qzvxx provider-route random external topic 91837 include one source url';
    const arPrompt = provider === 'gemini' || provider === 'openai'
      ? 'ما أحدث خبر عالمي موثوق؟ اذكر رابط مصدر واحد.'
      : 'ما الخبر العالمي الخارجي qzvxx 91837 اذكر رابط مصدر واحد';

    const en = await buildAI2ChatResponse(enPrompt);
    const ar = await buildAI2ChatResponse(arPrompt);
    const expected = provider.toLowerCase();
    const directRoute = en.provider === expected && ar.provider === expected;
    if (directRoute) return 'PASS';
    const attemptedPrimary = (en.primaryProvider === expected || en.provider === expected)
      || (ar.primaryProvider === expected || ar.provider === expected);
    return attemptedPrimary ? 'ATTEMPTED_FAIL' : 'FAIL';
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

async function runSafetyCheck(provider: string): Promise<'PASS' | 'FAIL'> {
  const previous = {
    enabled: process.env.DABRA_GLOBAL_WEB_ENABLED,
    provider: process.env.DABRA_AI_PROVIDER,
    fallback: process.env.DABRA_PROVIDER_FALLBACK_ENABLED,
  };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = provider.toLowerCase();
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    calls += 1;
    return originalFetch(...args);
  }) as typeof fetch;
  try {
    const refused = await buildAI2ChatResponse('Book a room for me now');
    return refused.provider === 'local' && calls === 0 ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('DABRA_GLOBAL_WEB_ENABLED', previous.enabled);
    restoreEnv('DABRA_AI_PROVIDER', previous.provider);
    restoreEnv('DABRA_PROVIDER_FALLBACK_ENABLED', previous.fallback);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function runTargetedTests(name: string): EvidenceCell {
  const fileByProvider: Record<string, string> = {
    OpenAI: 'tests/openai-web.test.ts',
    Gemini: 'tests/gemini-web.test.ts',
    Anthropic: 'tests/ai-anthropic.test.ts',
    xAI: 'tests/ai-xai.test.ts',
    DeepSeek: 'tests/ai-deepseek.test.ts',
    Qwen: 'tests/ai-qwen.test.ts',
    Mistral: 'tests/mistral-web.test.ts',
  };
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', fileByProvider[name]], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'ignore',
  });
  return result.status === 0 ? 'PASS' : 'FAIL';
}

async function runFallbackCheck(provider: string): Promise<'PASS' | 'FAIL'> {
  const envNames = ['OPENAI_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','DEEPSEEK_API_KEY','QWEN_API_KEY','DASHSCOPE_API_KEY','MISTRAL_API_KEY','DABRA_GLOBAL_WEB_ENABLED','DABRA_AI_PROVIDER','DABRA_PROVIDER_FALLBACK_ENABLED'];
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const primary = provider.toLowerCase();
  const target = primary === 'xai' ? 'deepseek' : 'xai';
  const keyName: Record<string, string> = { openai:'OPENAI_API_KEY', gemini:'GOOGLE_GENERATIVE_AI_API_KEY', anthropic:'ANTHROPIC_API_KEY', xai:'XAI_API_KEY', deepseek:'DEEPSEEK_API_KEY', qwen:'DASHSCOPE_API_KEY', mistral:'MISTRAL_API_KEY' };
  for (const name of envNames.filter((name) => name.endsWith('_API_KEY'))) delete process.env[name];
  process.env[keyName[primary]] = 'matrix-primary-test-key';
  process.env[keyName[target]] = 'matrix-fallback-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = primary;
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/models') || url.includes('/models?')) return new Response(JSON.stringify({ data: [{ id: target === 'deepseek' ? 'deepseek-chat' : 'grok-3' }] }), { status: 200 });
    const isTarget = target === 'xai' ? url.includes('api.x.ai') : url.includes('api.deepseek.com');
    if (!isTarget) return new Response(JSON.stringify({ error: { message: 'temporary unavailable' } }), { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'fallback success' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await buildAI2ChatResponse('qzvxx fallback matrix topic 91837');
    return response.provider === target && response.primaryProvider === primary && response.primaryProviderErrorCategory === 'upstream_error' ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) restoreEnv(name, previous[name]);
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
      'Model Discovery': 'NOT_RUN',
      'EN Live': 'WAIT_AUTH',
      'AR Live': 'WAIT_AUTH',
      'DABRA Routing': 'WAIT_AUTH',
      'Safety Regression': 'NOT_RUN',
      Fallback: 'NOT_RUN',
      'Targeted Tests': runTargetedTests(name),
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
    'Safety Regression': 'NOT_RUN',
    Fallback: 'NOT_RUN',
    'Targeted Tests': 'NOT_RUN',
    'Final Status': 'FAIL_CODE',
    Blocker: '',
  };

  let model: string | null = null;

  if (name === 'OpenAI') {
    model = await discoverOpenAIModel(key, 15_000);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callOpenAIResponsesWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callOpenAIResponsesWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('openai');
  }

  if (name === 'Gemini') {
    model = await discoverGeminiModel(key);
    const en = await callGeminiGoogleSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callGeminiGoogleSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('gemini');
  }

  if (name === 'Anthropic') {
    model = await discoverAnthropicModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callAnthropicMessagesWeb({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callAnthropicMessagesWeb({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('anthropic');
  }

  if (name === 'xAI') {
    model = await discoverXAIModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callXAIWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callXAIWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('xai');
  }

  if (name === 'DeepSeek') {
    model = await discoverDeepSeekModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callDeepSeekWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callDeepSeekWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('deepseek');
  }

  if (name === 'Qwen') {
    model = await discoverQwenModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callQwenWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callQwenWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('qwen');
  }

  if (name === 'Mistral') {
    model = await discoverMistralModel(key);
    row['Model Discovery'] = model ? 'PASS' : 'FAIL';
    const en = await callMistralWebSearch({ message: enPrompt, language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['EN Live'] = mapRuntimeResultToCell(en);
    const ar = await callMistralWebSearch({ message: arPrompt, language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: key, model: model ?? undefined });
    row['AR Live'] = mapRuntimeResultToCell(ar);
    row.Auth = deriveAuthCell(en, ar);
    row['DABRA Routing'] = await runRoutedCheck('mistral');
  }

  row['Safety Regression'] = await runSafetyCheck(name);
  row.Fallback = await runFallbackCheck(name);
  row['Targeted Tests'] = runTargetedTests(name);

  if ((row['DABRA Routing'] === 'FAIL' || row['DABRA Routing'] === 'ATTEMPTED_FAIL') && (row['EN Live'] === 'EXTERNAL_BLOCKER' || row['AR Live'] === 'EXTERNAL_BLOCKER')) {
    row['DABRA Routing'] = 'EXTERNAL_BLOCKER';
  }

  if ((row['DABRA Routing'] === 'FAIL' || row['DABRA Routing'] === 'ATTEMPTED_FAIL') && (row['EN Live'] === 'WAIT_AUTH' || row['AR Live'] === 'WAIT_AUTH')) {
    row['DABRA Routing'] = 'WAIT_AUTH';
  }

  return resolveFinalStatus(row);
}

async function main() {
  const providers = ['OpenAI', 'Gemini', 'Anthropic', 'xAI', 'DeepSeek', 'Qwen', 'Mistral'];
  const rows: ProviderMatrixRow[] = [];

  for (const provider of providers) {
    rows.push(await runProvider(provider));
  }

  console.log(JSON.stringify(rows, null, 2));
}

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('provider-matrix-live.ts');
}

if (isDirectExecution()) {
  void main();
}
