import { loadEnvConfig } from '@next/env';

import { callAnthropicMessagesWeb, discoverAnthropicModel } from '@/lib/ai2/runtime/anthropic-web';

loadEnvConfig(process.cwd());

function ok(label: string, value: boolean) {
  console.log(`${label}: ${value ? 'PASS' : 'FAIL'}`);
}

async function main() {
  const apiKey = String(process.env.ANTHROPIC_API_KEY ?? '').trim();
  const configuredModel = String(process.env.DABRA_ANTHROPIC_MODEL ?? '').trim();
  const discovered = await discoverAnthropicModel(apiKey);
  const model = configuredModel || discovered || 'claude-3-5-haiku-latest';


  if (!apiKey) {
    console.log('WAIT_AUTH: ANTHROPIC_API_KEY is missing.');
    process.exit(2);
  }

  const en = await callAnthropicMessagesWeb({
    message: 'Reply with exactly: ANTHROPIC_EN_PASS',
    language: 'en',
    prompt: 'Return only the requested exact phrase.',
    model,
    apiKey,
  });

  const ar = await callAnthropicMessagesWeb({
    message: 'أجب فقط بهذه العبارة: ANTHROPIC_AR_PASS',
    language: 'ar',
    prompt: 'Return only the requested exact phrase.',
    model,
    apiKey,
  });

  const authOk = en.errorCategory !== 'invalid_key' && ar.errorCategory !== 'invalid_key';
  const modelOk = Boolean(en.model || ar.model);
  const parsingOk = en.ok || ar.ok;
  const enPass = en.ok && en.answer.toUpperCase().includes('ANTHROPIC_EN_PASS');
  const arPass = ar.ok && ar.answer.includes('ANTHROPIC_AR_PASS');

  ok('Anthropic Authentication', authOk);
  ok('Anthropic Model', modelOk);
  ok('Response Parsing', parsingOk);
  ok('English Live Smoke', enPass);
  ok('Arabic Live Smoke', arPass);

  const externalBlocker = en.errorCategory === 'billing_or_identity' || ar.errorCategory === 'billing_or_identity';
  if (externalBlocker) {
    console.log('External Blocker: EXTERNAL_BILLING_BLOCKER');
    process.exit(3);
  }

  if (!en.ok || !ar.ok) {
    console.log('Live Result: FAIL');
    process.exit(1);
  }

  console.log('Live Result: PASS');
}

main().catch(() => {
  console.log('Live Result: FAIL');
  process.exit(1);
});
