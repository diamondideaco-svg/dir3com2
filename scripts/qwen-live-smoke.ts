import { loadEnvConfig } from '@next/env';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callQwenWebSearch, discoverQwenModel } from '@/lib/ai2/runtime/qwen-web';

loadEnvConfig(process.cwd());

async function main() {
  const apiKey = String(process.env.DASHSCOPE_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('WAIT_AUTH:DASHSCOPE_API_KEY_MISSING');
  const model = await discoverQwenModel(apiKey);
  if (!model) throw new Error('QWEN_MODEL_DISCOVERY_FAILED');
  process.env.DABRA_QWEN_MODEL = model;
  const en = await callQwenWebSearch({ message: 'Reply with exactly QWEN_EN_PASS', language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey, model });
  const ar = await callQwenWebSearch({ message: 'أعطني نصيحة سفر قصيرة وآمنة باللغة العربية.', language: 'ar', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey, model });
  if (!en.ok || !ar.ok || !/[\u0600-\u06ff]/.test(ar.answer)) throw new Error(`QWEN_LIVE_FAILED:${en.errorCategory ?? ar.errorCategory ?? 'semantic'}`);
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'qwen';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  const routed = await buildAI2ChatResponse('qzvxx external travel topic 91837');
  if (routed.provider !== 'qwen') throw new Error('QWEN_ROUTING_FAILED');
  console.log('AUTHENTICATION=PASS');
  console.log('MODELS_ENDPOINT=PASS');
  console.log(`MODEL=${model}`);
  console.log('EN_LIVE=PASS');
  console.log('AR_LIVE=PASS');
  console.log('DABRA_PROVIDER=qwen');
  console.log('FALLBACK_DURING_LIVE=NONE');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') : 'QWEN_SMOKE_FAILED');
  process.exitCode = 1;
});
