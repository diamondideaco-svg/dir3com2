import { callAnthropicMessagesWeb } from '@/lib/ai2/runtime/anthropic-web';

function ok(label: string, value: boolean) {
  console.log(`${label}: ${value ? 'PASS' : 'FAIL'}`);
}

async function main() {
  const apiKey = String(process.env.ANTHROPIC_API_KEY ?? '').trim();
  const model = String(process.env.DABRA_ANTHROPIC_MODEL ?? '').trim() || 'claude-3-5-haiku-latest';

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
    maxRetries: 1,
  });

  const ar = await callAnthropicMessagesWeb({
    message: 'أجب فقط بهذه العبارة: ANTHROPIC_AR_PASS',
    language: 'ar',
    prompt: 'Return only the requested exact phrase.',
    model,
    apiKey,
    maxRetries: 1,
  });

  const authOk = en.errorCategory !== 'auth' && ar.errorCategory !== 'auth';
  const modelOk = Boolean(en.providerModel || ar.providerModel);
  const parsingOk = en.ok || ar.ok;
  const enPass = en.ok && en.answer.trim() === 'ANTHROPIC_EN_PASS';
  const arPass = ar.ok && ar.answer.trim() === 'ANTHROPIC_AR_PASS';

  ok('Anthropic Authentication', authOk);
  ok('Anthropic Model', modelOk);
  ok('Response Parsing', parsingOk);
  ok('English Live Smoke', enPass);
  ok('Arabic Live Smoke', arPass);

  const externalBlocker = en.externalBlocker || ar.externalBlocker;
  if (externalBlocker === 'EXTERNAL_BILLING_BLOCKER') {
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
