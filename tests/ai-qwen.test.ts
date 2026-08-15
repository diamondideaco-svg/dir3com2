import assert from 'node:assert/strict';
import test from 'node:test';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callQwenWebSearch } from '@/lib/ai2/runtime/qwen-web';

const originalFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ['DASHSCOPE_API_KEY','QWEN_API_KEY','OPENAI_API_KEY','DABRA_GLOBAL_WEB_ENABLED','DABRA_AI_PROVIDER','DABRA_PROVIDER_FALLBACK_ENABLED']) delete process.env[key];
});

test('missing key is classified safely', async () => {
  const result=await callQwenWebSearch({message:'test',language:'en',prompt:AI2_DABRA_GLOBAL_WEB_PROMPT,apiKey:''});
  assert.equal(result.ok,false); assert.equal(result.errorCategory,'missing_key');
});

for (const [status,category] of [[401,'invalid_key'],[429,'insufficient_quota'],[503,'upstream_error']] as const) {
  test(`${status} is sanitized and classified`, async()=>{
    globalThis.fetch=(async()=>new Response(JSON.stringify({error:{message:'secret upstream detail'}}),{status})) as typeof fetch;
    const result=await callQwenWebSearch({message:'test',language:'en',prompt:AI2_DABRA_GLOBAL_WEB_PROMPT,apiKey:'test-only',model:'qwen-turbo'});
    assert.equal(result.ok,false); assert.equal(result.errorCategory,category); assert.equal(result.answer.includes('secret'),false);
  });
}

test('timeout is classified', async()=>{
  globalThis.fetch=(async()=>{throw new Error('aborted')}) as typeof fetch;
  const result=await callQwenWebSearch({message:'test',language:'en',prompt:AI2_DABRA_GLOBAL_WEB_PROMPT,apiKey:'test-only',model:'qwen-turbo',timeoutMs:1});
  assert.equal(result.ok,false); assert.equal(result.errorCategory,'timeout');
});

test('AR and EN parse safely', async()=>{
  globalThis.fetch=(async()=>new Response(JSON.stringify({choices:[{message:{content:'إجابة answer'}}]}),{status:200})) as typeof fetch;
  for(const language of ['ar','en'] as const) assert.equal((await callQwenWebSearch({message:'test',language,prompt:AI2_DABRA_GLOBAL_WEB_PROMPT,apiKey:'test-only',model:'qwen-turbo'})).ok,true);
});

test('router selects qwen and refusals prevent provider invocation', async()=>{
  process.env.DASHSCOPE_API_KEY='test-only'; process.env.DABRA_GLOBAL_WEB_ENABLED='true'; process.env.DABRA_AI_PROVIDER='qwen'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='false';
  let calls=0; globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'Qwen answer'}}]}),{status:200})}) as typeof fetch;
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91837')).provider,'qwen'); const before=calls;
  for(const prompt of ['book a room for me now','pay this invoice now','delete my profile now','update database records now']) assert.equal((await buildAI2ChatResponse(prompt)).provider,'local');
  assert.equal(calls,before);
});

test('fallback reaches OpenAI only when enabled', async()=>{
  process.env.DASHSCOPE_API_KEY='test-only'; process.env.OPENAI_API_KEY='openai-test'; process.env.DABRA_GLOBAL_WEB_ENABLED='true'; process.env.DABRA_AI_PROVIDER='qwen'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true';
  globalThis.fetch=(async(input)=>String(input).includes('dashscope')?new Response('{}',{status:503}):new Response(JSON.stringify({output_text:'fallback',output:[{content:[{type:'url_citation',url:'https://example.com'}]}]}),{status:200})) as typeof fetch;
  assert.equal((await buildAI2ChatResponse('qzvxx external topic 91837')).provider,'openai');
});
