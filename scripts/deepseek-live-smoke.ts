import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const apiKey = String(process.env.DEEPSEEK_API_KEY ?? '').trim();
  if (!apiKey) {
    console.log('WAIT_AUTH: DEEPSEEK_API_KEY is missing.');
    process.exit(2);
  }

  const modelsResponse = await fetch('https://api.deepseek.com/models', {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const modelsPayload = await modelsResponse.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
  if (!modelsResponse.ok) {
    console.log(`Authentication: FAIL (${modelsResponse.status})`);
    process.exit(1);
  }
  const modelIds = (modelsPayload?.data ?? []).map((model) => String(model.id ?? '')).filter(Boolean);
  const configured = String(process.env.DABRA_DEEPSEEK_MODEL ?? '').trim();
  const model = configured && modelIds.includes(configured)
    ? configured
    : ['deepseek-v4-flash', 'deepseek-v4-pro'].find((candidate) => modelIds.includes(candidate)) ?? modelIds[0];
  if (!model) {
    console.log('Model: FAIL (no chat model available)');
    process.exit(1);
  }

  process.env.DABRA_DEEPSEEK_MODEL = model;
  const { callDeepSeekChat } = await import('@/lib/ai2/runtime/deepseek-web');
  const { buildAI2ChatResponse } = await import('@/lib/ai2/runtime/chat');
  const checks = [
    { label: 'EN LIVE', language: 'en' as const, message: 'Reply with exactly: DEEPSEEK_EN_PASS', expected: 'DEEPSEEK_EN_PASS' },
    { label: 'AR LIVE', language: 'ar' as const, message: 'أجب فقط بهذه العبارة: DEEPSEEK_AR_PASS', expected: 'DEEPSEEK_AR_PASS' },
  ];
  for (const check of checks) {
    const result = await callDeepSeekChat({ message: check.message, language: check.language, prompt: 'Return only the exact requested phrase.', apiKey, model, maxRetries: 1 });
    console.log(`${check.label}: ${result.ok && result.answer.trim() === check.expected ? 'PASS' : `FAIL (${result.httpStatus ?? result.errorCategory ?? 'unknown'})`}`);
    if (!result.ok || result.answer.trim() !== check.expected) process.exit(1);
  }

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.DABRA_DEEPSEEK_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  const routed = await buildAI2ChatResponse('Give a brief informational overview of global aviation trends.');
  console.log(`DABRA DEEPSEEK ROUTING: ${routed.provider === 'deepseek' ? 'PASS' : 'FAIL'}`);
  if (routed.provider !== 'deepseek') process.exit(1);
  console.log(`Model: ${model}`);
}

void main().catch(() => {
  console.log('OTHER_EXTERNAL_BLOCKER');
  process.exit(1);
});
