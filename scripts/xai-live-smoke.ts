import { loadEnvConfig } from '@next/env';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callXAIWebSearch, discoverXAIModel } from '@/lib/ai2/runtime/xai-web';

loadEnvConfig(process.cwd());

async function main() {
  const apiKey = String(process.env.XAI_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('WAIT_AUTH: XAI_API_KEY missing');
  const model = await discoverXAIModel(apiKey);
  if (!model) throw new Error('XAI_MODEL_DISCOVERY_FAILED');
  process.env.DABRA_XAI_MODEL = model;

  const en = await callXAIWebSearch({ message: 'Reply with exactly XAI_EN_PASS', language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey, model });
  const ar = await callXAIWebSearch({ message: 'أجب فقط بهذه العبارة: XAI_AR_PASS', language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey, model });
  if (!en.ok || !ar.ok) throw new Error(`XAI_LIVE_FAILED:${en.errorCategory ?? ar.errorCategory ?? 'provider_error'}`);

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'xai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  const routed = await buildAI2ChatResponse('qzvxx external travel topic 91837');
  if (routed.provider !== 'xai') throw new Error('XAI_ROUTING_FAILED');

  console.log('AUTHENTICATION=PASS');
  console.log('MODELS_ENDPOINT=PASS');
  console.log(`MODEL=${model}`);
  console.log('EN_LIVE=PASS');
  console.log('AR_LIVE=PASS');
  console.log('DABRA_PROVIDER=xai');
  console.log('FALLBACK_DURING_LIVE=NONE');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') : 'XAI_SMOKE_FAILED');
  process.exitCode = 1;
});
