import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '../lib/dabra/agent-capabilities';

import { SYNTHETIC_PUBLIC_PRICING_BODIES as plain } from './fixtures/task217-public-pricing-synthetic';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const require = createRequire(import.meta.url), now = Date.parse('2026-11-03T20:00:00Z');
function fixture(provider: AgentProviderId = 'openai') {
  let clock = now, calls = 0, mode: 'ok' | 'http' | 'content-type' | 'redirect' | 'changed' | 'huge' | 'stalled' | 'ambiguous' | 'wrong-units' | 'missing-units' | 'wrong-currency' | 'wrong-tier' | 'regional' = 'ok';
  let canceled = 0;
  const requests: { url: string; init: RequestInit }[] = [];
  const modules = new Map<string, Record<string, unknown>>();
  class Clock extends Date { static now() { return clock; } }
  function load(name: string) {
    const cached = modules.get(name); if (cached) return cached;
    const output: Record<string, unknown> = {}, file = new URL('../lib/dabra/' + name + '.ts', import.meta.url);
    modules.set(name, output);
    runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
      + (name === 'dialogue-pricing-refresh' ? '\nexports.testSource = sources; exports.testFragment = fragment;' : ''), {
      exports: output, module: { exports: output }, require: (id: string) => id === 'server-only' ? {}
        : id === './dialogue-pricing-approvals' ? load('dialogue-pricing-approvals') : require(id),
      Date: Clock, AbortController, AbortSignal, TextDecoder,
      fetch: async (url: string, init: RequestInit) => {
        calls++; requests.push({ url, init });
        if (mode === 'http') return Object.defineProperty(new Response('', { status: 503 }), 'url', { value: url });
        const body = mode === 'changed' ? plain[provider].replace(/\$[0-9.]+/, '$99')
          : mode === 'ambiguous' ? plain[provider] + plain[provider]
          : mode === 'wrong-units' ? plain[provider].replace('Prices /M Tokens','Prices /K Tokens')
          : mode === 'missing-units' ? plain[provider].replace('Prices /M Tokens','')
          : mode === 'wrong-currency' ? plain[provider].replace('aria-pressed="true">USD','aria-pressed="false">USD').replace('aria-pressed="false">EUR','aria-pressed="true">EUR')
          : mode === 'wrong-tier' ? plain[provider].replace('aria-pressed="true">Standard','aria-pressed="false">Standard').replace('aria-pressed="false">Batch','aria-pressed="true">Batch')
          : mode === 'regional' ? plain[provider].replace('aria-checked="false"','aria-checked="true"') : plain[provider];
        const stream = mode === 'huge' || mode === 'stalled' ? new ReadableStream<Uint8Array>({
          start(controller) { if (mode === 'huge') controller.enqueue(new Uint8Array(2097153)); },
          cancel() { canceled++; },
        }) : body;
        const response = new Response(stream, { headers: { 'content-type': mode === 'content-type' ? 'application/json'
          : provider === 'openai' || provider === 'anthropic' ? 'text/markdown' : provider === 'gemini' ? 'text/plain' : 'text/html' } });
        return Object.defineProperty(response, 'url', { value: mode === 'redirect' ? 'https://untrusted.invalid/' : url });
      },
    });
    return output;
  }
  const api = load('dialogue-pricing-refresh');
  function call(name: string, ...args: unknown[]) {
    const fn = api[name]; if (typeof fn !== 'function') throw Error('MISSING_EXPORT');
    return Reflect.apply(fn, undefined, args);
  }
  const sources = api.testSource;
  if (!sources || typeof sources !== 'object') throw Error('MISSING_SOURCE_FIXTURE');
  const source = Reflect.get(sources, provider);
  if (!source || typeof source !== 'object') throw Error('MISSING_PROVIDER_FIXTURE');
  // Synthetic external source authority only. The runtime parser, private
  // constructor, transport guards, cache and brand checks run unchanged.
  const extracted = call('testFragment', provider, plain[provider]);
  if (typeof extracted !== 'string') throw Error('SYNTHETIC_SOURCE_NOT_PARSEABLE');
  Reflect.set(source, 'fragment', hash(extracted));
  const model: unknown = Reflect.get(source, 'model'), pricing: unknown = Reflect.get(source, 'pricing');
  const contract = call('approvedPublicPricingContract', provider, model, pricing);
  if (!contract || typeof contract !== 'object') throw Error('MISSING_APPROVED_CONTRACT');
  const proof = { provider, model, pricingEvidenceSha256: pricing, limitedOperation: { contractSha256: Reflect.get(contract, 'digest') } };
  return { requests, proof,
    calls: () => calls, canceled: () => canceled,
    mode: (value: typeof mode) => { mode = value; },
    advance: (ms: number) => { clock += ms; },
    refresh: (signal = new AbortController().signal) => call('refreshPublicDialoguePricing', proof, signal),
    current: (value: unknown) => call('publicPricingObservationCurrent', value, proof, clock),
  };
}

for (const provider of AGENT_PROVIDER_IDS) test('public pricing ' + provider + ': real parser and constructor, fixed public source, original cache time then actual renewal', async () => {
  const f = fixture(provider), first: unknown = await f.refresh();
  assert.ok(first && typeof first === 'object'); assert.equal(f.calls(),1); assert.equal(f.current(first),true);
  assert.equal(Reflect.get(first,'observedAtMs'),now);
  assert.equal(f.requests[0].init.credentials,'omit'); assert.equal(f.requests[0].init.redirect,'error');
  assert.equal(new Headers(f.requests[0].init.headers).has('Authorization'),false);
  f.advance(1000); assert.equal(await f.refresh(), first); assert.equal(f.calls(),1);
  assert.equal(f.current({ ...first }),false,'JSON-shaped values cannot mint a trusted observation');
  f.advance(900000); assert.equal(f.current(first),false);
  const renewed: unknown = await f.refresh(); assert.ok(renewed && typeof renewed === 'object');
  assert.equal(f.calls(),2); assert.equal(Reflect.get(renewed,'observedAtMs'),now+901000);
  assert.equal(Reflect.get(first,'observedAtMs'),now);
});

for (const mode of ['http','content-type','redirect','changed','huge','ambiguous'] as const)
test('public pricing fails closed without retry or stale fallback: ' + mode, async () => {
  const f=fixture(); await f.refresh(); f.advance(900001); f.mode(mode);
  assert.equal(await f.refresh(),null); assert.equal(f.calls(),2);
  if(mode==='huge') assert.ok(f.canceled()>0);
});

test('public pricing cancels a stalled decoded body within the original request signal', async () => {
  const f=fixture(); f.mode('stalled'); const started=Date.now();
  assert.equal(await f.refresh(AbortSignal.timeout(30)),null); assert.ok(Date.now()-started<1000);
  assert.ok(f.canceled()>0); assert.equal(f.calls(),1);
});
test('public pricing concurrent requests share only a public observation, not a customer context', async () => {
  const f=fixture(), values=await Promise.all([f.refresh(),f.refresh(),f.refresh()]);
  assert.equal(f.calls(),1); assert.ok(values[0]); assert.equal(values[0],values[1]); assert.equal(values[1],values[2]);
});

for(const mode of ['wrong-units','missing-units','wrong-currency','wrong-tier','regional'] as const)
test('public pricing mistral rejects changed billing contract state: '+mode,async()=>{
  const f=fixture('mistral');f.mode(mode);assert.equal(await f.refresh(),null);assert.equal(f.calls(),1);
});
