import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { clearOpenAICompatibleModelCacheForTests, discoverOpenAICompatibleModel } from '@/lib/ai2/runtime/openai-compatible';

const originalFetch = globalThis.fetch;
const providerEnv = ['OPENAI_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','DEEPSEEK_API_KEY','DASHSCOPE_API_KEY','MISTRAL_API_KEY'];
const controlEnv = ['DABRA_GLOBAL_WEB_ENABLED','DABRA_AI_PROVIDER','DABRA_PROVIDER_FALLBACK_ENABLED','DABRA_AI_MAX_FALLBACK_HOPS','DABRA_AI_GLOBAL_DEADLINE_MS','DABRA_OPENAI_MODEL','DABRA_GEMINI_MODEL','DABRA_ANTHROPIC_MODEL','DABRA_XAI_MODEL','DABRA_DEEPSEEK_MODEL','DABRA_QWEN_MODEL','DABRA_MISTRAL_MODEL'];

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of [...providerEnv, ...controlEnv]) delete process.env[key];
  clearOpenAICompatibleModelCacheForTests();
});

function enable(keys: string[]) {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  for (const key of keys) process.env[key] = 'test-key';
}

function successFetch() {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini answer' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/gemini' } }] } }] }), { status: 200 });
    if (url.includes('api.openai.com')) return new Response(JSON.stringify({ output_text: 'OpenAI answer', output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }] }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'provider answer' } }] }), { status: 200 });
  }) as typeof fetch;
}

test('historical default remains OpenAI even when Gemini is configured', async () => {
  enable(['OPENAI_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY']);
  globalThis.fetch = successFetch();
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91837')).provider, 'openai');
});

test('explicit providers and explicit auto are deterministic', async () => {
  enable(['OPENAI_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY']);
  globalThis.fetch = successFetch();
  process.env.DABRA_AI_PROVIDER = 'gemini';
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91837')).provider, 'gemini');
  process.env.DABRA_AI_PROVIDER = 'openai';
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91838')).provider, 'openai');
  process.env.DABRA_AI_PROVIDER = 'auto';
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91839')).provider, 'openai');
});

test('unsupported provider fails closed without invocation', async () => {
  enable(['OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER = 'unsupported';
  let calls = 0; globalThis.fetch = (async () => { calls += 1; throw new Error('must not call'); }) as typeof fetch;
  const result = await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(result.provider, 'local'); assert.equal(result.providerErrorCategory, 'configuration_error'); assert.equal(calls, 0);
});

async function assertFatalStops(status: number, body: unknown, expected: string) {
  enable(['XAI_API_KEY','OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER='xai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_XAI_MODEL='grok-test';
  let calls=0; globalThis.fetch=(async()=>{calls+=1; return new Response(JSON.stringify(body),{status})}) as typeof fetch;
  const result=await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(result.provider,'local'); assert.equal(result.primaryProviderErrorCategory,expected); assert.equal(result.fallbackAttempts?.length,0); assert.equal(calls,1);
}

test('invalid credentials forbid fallback',()=>assertFatalStops(401,{error:{message:'invalid key'}},'invalid_key'));
test('billing failure forbids fallback',()=>assertFatalStops(400,{error:{message:'billing required'}},'billing_or_identity'));
test('invalid model forbids fallback',()=>assertFatalStops(404,{error:{message:'model not found'}},'model_not_found'));

test('safety rejection forbids fallback', async()=>{
  enable(['GOOGLE_GENERATIVE_AI_API_KEY','OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER='gemini'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_GEMINI_MODEL='gemini-test';
  let calls=0; globalThis.fetch=(async()=>{calls+=1;return new Response(JSON.stringify({candidates:[{finishReason:'SAFETY'}]}),{status:200})}) as typeof fetch;
  const result=await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(result.primaryProviderErrorCategory,'safety_blocked'); assert.equal(result.fallbackAttempts?.length,0); assert.equal(calls,1);
});

for (const status of [503] as const) test(`transient HTTP ${status} permits fallback and preserves primary error`, async()=>{
  enable(['XAI_API_KEY','OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER='xai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_XAI_MODEL='grok-test';
  globalThis.fetch=(async(input)=>String(input).includes('api.x.ai')?new Response('{}',{status}):successFetch()(input)) as typeof fetch;
  const result=await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(result.provider,'openai'); assert.equal(result.primaryProvider,'xai'); assert.equal(result.primaryProviderErrorCategory,'upstream_error'); assert.deepEqual(result.fallbackAttempts,['openai']);
});

test('timeout permits fallback', async()=>{
  enable(['XAI_API_KEY','OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER='xai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_XAI_MODEL='grok-test';
  globalThis.fetch=(async(input)=>{if(String(input).includes('api.x.ai')) throw new Error('The operation was aborted.'); return successFetch()(input)}) as typeof fetch;
  const result=await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(result.provider,'openai'); assert.equal(result.primaryProviderErrorCategory,'timeout');
});

test('all seven transient failures terminate once per router hop and preserve primary error', async()=>{
  enable(providerEnv); process.env.DABRA_AI_PROVIDER='openai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_AI_MAX_FALLBACK_HOPS='6';
  for(const provider of ['OPENAI','GEMINI','ANTHROPIC','XAI','DEEPSEEK','QWEN','MISTRAL']) process.env[`DABRA_${provider}_MODEL`]='test-model';
  const hosts=new Set<string>(); globalThis.fetch=(async(input)=>{hosts.add(new URL(String(input)).host);return new Response('{}',{status:503})}) as typeof fetch;
  const result=await buildAI2ChatResponse('qzvxx external topic 91837');
  assert.equal(hosts.size,7); assert.equal(result.fallbackAttempts?.length,6); assert.equal(result.primaryProviderErrorCategory,'upstream_error'); assert.equal(result.finalProviderErrorCategory,'upstream_error');
});

test('global deadline stops additional provider hops', async()=>{
  enable(['XAI_API_KEY','OPENAI_API_KEY']); process.env.DABRA_AI_PROVIDER='xai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true'; process.env.DABRA_AI_GLOBAL_DEADLINE_MS='5000'; process.env.DABRA_XAI_MODEL='grok-test';
  const realNow=Date.now; let reads=0; Date.now=()=>{reads+=1;return reads <= 2 ? 1_000 : 7_000};
  let calls=0; globalThis.fetch=(async()=>{calls+=1;return new Response('{}',{status:503})}) as typeof fetch;
  try { const result=await buildAI2ChatResponse('qzvxx external topic 91837'); assert.equal(result.finalProviderErrorCategory,'deadline_exceeded'); assert.equal(result.fallbackAttempts?.length,0); assert.equal(calls,2); } finally { Date.now=realNow; }
});

test('model discovery is abortable and successful results are cached', async()=>{
  let calls=0; let sawSignal=false;
  globalThis.fetch=(async(_input,init)=>{calls+=1;sawSignal=Boolean(init?.signal);return new Response(JSON.stringify({data:[{id:'model-a'}]}),{status:200})}) as typeof fetch;
  assert.equal(await discoverOpenAICompatibleModel('key-a','https://provider.test/v1',['model-a']),'model-a');
  assert.equal(await discoverOpenAICompatibleModel('key-a','https://provider.test/v1',['model-a']),'model-a');
  assert.equal(sawSignal,true); assert.equal(calls,1);
});

test('hanging model discovery is aborted and returns a classified safe failure', async()=>{
  const originalSetTimeout=globalThis.setTimeout;
  let sawAbort=false;
  globalThis.setTimeout=((callback: (...args: unknown[])=>void)=>{queueMicrotask(callback);return 1 as unknown as NodeJS.Timeout}) as typeof setTimeout;
  globalThis.fetch=(async(_input,init)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>{sawAbort=true;reject(new Error('aborted'))},{once:true});
  })) as typeof fetch;
  try {
    assert.equal(await discoverOpenAICompatibleModel('key-timeout','https://provider.test/v1',['model-a']),null);
    assert.equal(sawAbort,true);
  } finally {
    globalThis.setTimeout=originalSetTimeout;
  }
});
