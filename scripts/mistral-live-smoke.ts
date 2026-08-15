import { loadEnvConfig } from '@next/env';

import { buildAI2ChatResponse, isOutOfScopeIntent } from '@/lib/ai2/runtime/chat';
import { callMistralWebSearch, discoverMistralModel } from '@/lib/ai2/runtime/mistral-web';

loadEnvConfig(process.cwd());

const MISTRAL_BASE = 'https://api.mistral.ai/v1';

type SmokeReport = {
  keyConfigured: 'YES' | 'NO';
  auth: 'PASS' | 'FAIL';
  modelsEndpoint: 'PASS' | 'FAIL';
  discoveredModelsCount: number;
  selectedModel: string | null;
  englishLive: 'PASS' | 'FAIL';
  arabicLive: 'PASS' | 'FAIL';
  providerProof: 'PASS' | 'FAIL';
  fallbackDisabledProof: 'PASS' | 'FAIL';
  safetyRefusalNoInvocation: 'PASS' | 'FAIL';
  blocker?: string;
};

function failCodeFromStatus(status: number): string {
  if (status === 401 || status === 403) return 'AUTH_401_403';
  if (status === 429) return 'RATE_LIMIT_429';
  if (status >= 500) return 'UPSTREAM_5XX';
  return `HTTP_${status || 0}`;
}

async function fetchModelsCount(apiKey: string): Promise<{ ok: boolean; count: number; status: number }> {
  try {
    const response = await fetch(`${MISTRAL_BASE}/models`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    });

    const status = response.status;
    if (!response.ok) {
      return { ok: false, count: 0, status };
    }

    const payload = (await response.json().catch(() => null)) as { data?: Array<unknown> } | null;
    const count = Array.isArray(payload?.data) ? payload.data.length : 0;
    return { ok: true, count, status };
  } catch {
    return { ok: false, count: 0, status: 0 };
  }
}

async function main() {
  const key = String(process.env.MISTRAL_API_KEY ?? '').trim();
  const report: SmokeReport = {
    keyConfigured: key ? 'YES' : 'NO',
    auth: 'FAIL',
    modelsEndpoint: 'FAIL',
    discoveredModelsCount: 0,
    selectedModel: null,
    englishLive: 'FAIL',
    arabicLive: 'FAIL',
    providerProof: 'FAIL',
    fallbackDisabledProof: 'FAIL',
    safetyRefusalNoInvocation: 'FAIL',
  };

  if (!key) {
    report.blocker = 'KEY_MISSING:MISTRAL_API_KEY';
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
    return;
  }

  const models = await fetchModelsCount(key);
  report.modelsEndpoint = models.ok ? 'PASS' : 'FAIL';
  report.discoveredModelsCount = models.count;
  report.auth = (models.status === 401 || models.status === 403) ? 'FAIL' : (models.ok ? 'PASS' : 'FAIL');

  if (!models.ok) {
    report.blocker = `MISTRAL_MODELS_${failCodeFromStatus(models.status)}`;
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
    return;
  }

  const selectedModel = await discoverMistralModel(key);
  report.selectedModel = selectedModel;

  const en = await callMistralWebSearch({
    message: 'Reply with exactly: MISTRAL_EN_PASS',
    language: 'en',
    prompt: 'Return only the requested exact phrase.',
    apiKey: key,
    model: selectedModel ?? undefined,
  });

  report.englishLive = en.ok && en.answer.trim() === 'MISTRAL_EN_PASS' ? 'PASS' : 'FAIL';

  const ar = await callMistralWebSearch({
    message: 'أجب فقط بهذه العبارة: MISTRAL_AR_PASS',
    language: 'ar',
    prompt: 'Return only the requested exact phrase.',
    apiKey: key,
    model: selectedModel ?? undefined,
  });

  report.arabicLive = ar.ok && ar.answer.trim() === 'MISTRAL_AR_PASS' ? 'PASS' : 'FAIL';

  const prevEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const prevProvider = process.env.DABRA_AI_PROVIDER;
  const prevFallback = process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  const prevModel = process.env.DABRA_MISTRAL_MODEL;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'mistral';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  if (selectedModel) {
    process.env.DABRA_MISTRAL_MODEL = selectedModel;
  }

  try {
    const routedEn = await buildAI2ChatResponse('qzvxx mistral provider route check 9291');
    const routedAr = await buildAI2ChatResponse('ما الخبر العالمي qzvxx للتحقق من المزود 9291');
    report.providerProof = (routedEn.provider === 'mistral' && routedAr.provider === 'mistral') ? 'PASS' : 'FAIL';
    report.fallbackDisabledProof = report.providerProof;

    const nativeFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      providerCalls += 1;
      return nativeFetch(...args);
    }) as typeof fetch;

    const refusalPrompt = 'احجز وادفع لي الآن';
    const refused = await buildAI2ChatResponse(refusalPrompt);
    report.safetyRefusalNoInvocation =
      refused.provider === 'local'
      && refused.groundingStatus === 'fallback-no-source'
      && providerCalls === 0
      && isOutOfScopeIntent(refusalPrompt)
        ? 'PASS'
        : 'FAIL';

    globalThis.fetch = nativeFetch;
  } finally {
    if (prevEnabled === undefined) delete process.env.DABRA_GLOBAL_WEB_ENABLED;
    else process.env.DABRA_GLOBAL_WEB_ENABLED = prevEnabled;

    if (prevProvider === undefined) delete process.env.DABRA_AI_PROVIDER;
    else process.env.DABRA_AI_PROVIDER = prevProvider;

    if (prevFallback === undefined) delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    else process.env.DABRA_PROVIDER_FALLBACK_ENABLED = prevFallback;

    if (prevModel === undefined) delete process.env.DABRA_MISTRAL_MODEL;
    else process.env.DABRA_MISTRAL_MODEL = prevModel;
  }

  if (report.englishLive === 'FAIL') {
    report.blocker = `MISTRAL_EN_${failCodeFromStatus(en.status ?? 0)}`;
  } else if (report.arabicLive === 'FAIL') {
    report.blocker = `MISTRAL_AR_${failCodeFromStatus(ar.status ?? 0)}`;
  } else if (report.providerProof === 'FAIL') {
    report.blocker = 'MISTRAL_ROUTING_FAIL';
  } else if (report.safetyRefusalNoInvocation === 'FAIL') {
    report.blocker = 'MISTRAL_SAFETY_GATE_FAIL';
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.blocker) {
    process.exit(1);
  }
}

void main();
