import test from 'node:test';
import assert from 'node:assert/strict';
import { agentIntent, parseAgentTool, safeAgentRequest, type AgentContext, type AgentReadResult, type AgentRole } from '../lib/dabra/agent-contract';
import { runInternalAgent } from '../lib/dabra/agent';
import { platformLinkAllowed } from '../components/dabra/PlatformAnswer';

const ready: AgentReadResult = { kind: 'ready', scope: 'own', truncated: false, retrievedAt: '2026-09-28T12:00:00Z', requests: [{ reference: 'REQ-12345678', status: 'awaiting_payment', nextAction: 'payment_not_enabled', quote: {amount: 100, currency: 'USD', expiresAt: null} }] };
function run(message: string, role: AgentRole = 'guest', result: AgentReadResult = {kind:'authentication_required'}, locale: 'ar'|'en' = 'en') {
  const calls: Array<[string|null,boolean]> = [];
  const context: AgentContext = {role, readRequests:async(ref,ops)=>{calls.push([ref,ops]);return result;}};
  return { calls, promise: runInternalAgent({message,locale,history:[],context}) };
}
for(const [message,tool] of [
 ['طلبات العمليات في مصر','operations'],['my requests','my_requests'],['خدمة العملاء','support'],
 ['أعطني ملخص تنفيذي','executive'],['call center','call_center'],['شو بتقدر تعمل','capabilities'],
 ['جيتور T2 في القاهرة','discover'],['حالة REQ-12345678','my_requests'],
] as const) test(`intent ${tool}: ${message}`,()=>assert.equal(agentIntent(message).tool,tool));

test('provider cannot inject tool arguments, identity, scope, SQL or free answer',()=>{
 assert.equal(parseAgentTool({tool:'operations'}),'operations');
 for(const input of [null,[],{tool:'delete'}, {tool:'executive',role:'ceo'}, {tool:'operations',country:'ALL'}, {tool:'discover',answer:'booked'}, {tool:'operations',sql:'SELECT *'}]) assert.equal(parseAgentTool(input),null);
});
for(const role of ['guest','customer','partner','staff','admin'] as const) test(`CEO access denied for ${role} before database read`,async()=>{
 const r=run('CEO summary',role,ready);const response=await r.promise;
 assert.equal(r.calls.length,0);assert.match(response.answer,/approved CEO account/);assert.doesNotMatch(response.answer,/REQ-12345678/);
});
test('authorized CEO receives recent state counts, not revenue or total bookings',async()=>{
 const response=await run('executive summary','ceo',{...ready,scope:'egypt',truncated:true}).promise;
 assert.match(response.answer,/1 recent displayed requests/);assert.match(response.answer,/not the platform total/);
 assert.match(response.answer,/not bookings or revenue/);assert.equal(response.agent.mutations,0);
});
for(const locale of ['ar','en'] as const) test(`customer request read ${locale} preserves acceptance/payment distinction`,async()=>{
 const r=run('REQ-12345678','customer',ready,locale);const response=await r.promise;
 assert.deepEqual(r.calls,[['REQ-12345678',false]]);assert.match(response.answer,/100\.00 USD/);
 assert.match(response.answer,/لم يتم الدفع أو الحجز|not paid or booked/);assert.equal(response.sources[0].sourceId,'dir3com-authorized-requests');
});
test('operations draft uses a specific request and never sends or confirms',async()=>{
 const r=run('draft reply REQ-12345678','staff',{...ready,scope:'egypt'});const response=await r.promise;
 assert.deepEqual(r.calls,[['REQ-12345678',true]]);assert.match(response.answer,/Draft for review only — not sent/);assert.equal(response.agent.mutations,0);
});
test('draft without a selected reference asks for selection',async()=>{
 const response=await run('operations draft reply','admin',{...ready,scope:'egypt'}).promise;
 assert.match(response.answer,/Choose a specific REQ/);assert.doesNotMatch(response.answer,/Draft for review only — not sent/);
});
for(const role of ['guest','customer','staff','admin','ceo'] as const) test(`call center ${role} cannot claim a phone call`,async()=>{
 const r=run('Call Rami now',role,ready);const response=await r.promise;
 assert.equal(r.calls.length,0);assert.match(response.answer,/No call or message has been sent/);
});
test('a read error is not rendered as an empty queue',async()=>{
 const response=await run('my requests','customer',{kind:'unavailable'}).promise;
 assert.equal(response.groundingStatus,'fallback-no-source');assert.match(response.answer,/could not be read/);assert.doesNotMatch(response.answer,/No matching request/);
});
test('empty and forbidden do not leak existence of another customer record',async()=>{
 const empty=await run('REQ-12345678','customer',{...ready,requests:[]}).promise;
 assert.match(empty.answer,/authorized scope/);assert.doesNotMatch(empty.answer,/100.00/);
 const denied=await run('operations','customer',{kind:'forbidden'}).promise;
 assert.match(denied.answer,/cannot read this scope/);assert.doesNotMatch(denied.answer,/REQ-12345678/);
});
test('untrusted DB strings cannot become links or status claims',()=>{
 assert.equal(safeAgentRequest({request_reference:'[x](/admin)',status:'confirmed'}),null);
 const row=safeAgentRequest({request_reference:'REQ-12345678',status:'[paid](https://evil.invalid)',quote_amount:100,quote_currency:'USD<script>',next_action:'https://evil.invalid'});
 assert.equal(row?.quote,null);assert.equal(row?.nextAction,null);
});
test('source quote preserved while display currency changes',async()=>{
 const response=await runInternalAgent({message:'my requests',locale:'en',history:[],context:{role:'customer',readRequests:async()=>ready},pricing:{currency:'SAR',snapshot:{base:'USD',provider:'frankfurter',rates:{USD:1,SAR:3.75,EGP:50,EUR:.9,AED:3.67},asOf:'2026-09-28',expiresAt:Date.now()+60000}}});
 assert.match(response.answer,/375\.00 SAR/);assert.match(response.answer,/source: 100\.00 USD/);
});
test('expired quote is labelled and never offered as current',async()=>{
 const response=await run('my requests','customer',{...ready,requests:[{...ready.requests[0],quote:{amount:100,currency:'USD',expiresAt:'2020-01-01'}}]}).promise;
 assert.match(response.answer,/quote expired/);
});
test('only explicit read-only operations/support routes become links',()=>{
 assert.equal(platformLinkAllowed('/admin/operations/drive'),true);assert.equal(platformLinkAllowed('/support'),true);
 for(const href of ['/admin','/admin/operations/drive?execute=1','/admin/operations/drive/../team','https://budget.com']) assert.equal(platformLinkAllowed(href),false);
});
test('internal car discovery remains available without DB/model and does not fabricate a booking',async()=>{
 const response=await run('Jetour T2 in Cairo','guest').promise;
 assert.match(response.answer,/140\.25 USD/);assert.equal(response.agent.state,'catalogue');assert.doesNotMatch(response.answer,/Budget|Flynas|https?:/);
});

test('private chat context is excluded from local persistence and stale responses after identity change', async()=>{
 const {readFileSync}=await import('node:fs');
 const ui=readFileSync('components/dabra/DabraChatCommerce.tsx','utf8');
 assert.match(ui,/privateConversationRef\.current[\s\S]*storage\.removeItem\(storageKey\(persistenceContext\.ownerId, 'context'\)\)/);
 assert.match(ui,/lifecycle !== lifecycleRef\.current \|\| controller\.signal\.aborted\) return;\s*if \(response\.headers\.get\('X-DABRA-Private-Context'\)/);
 const route=readFileSync('app/api/ai2/chat/route.ts','utf8');
 assert.match(route,/intent\.tool !== 'discover'\) streamed\.headers\.set\('X-DABRA-Private-Context', '1'\)/);
});

test('DABRA currency uses the existing FX service, not payment guidance or invented rates',async()=>{
 const {clearCurrencyCacheForTests}=await import('../lib/currency/service');clearCurrencyCacheForTests();
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async(url)=>{assert.match(String(url),/^https:\/\/api\.frankfurter\.dev\/v2\/rates\?/);return Response.json([['SAR',3.75],['EGP',50],['EUR',.9],['AED',3.67]].map(([quote,rate])=>({base:'USD',quote,rate,date:new Date().toISOString().slice(0,10)})));};
  const response=await run('حوّل ١٠٠ دولار إلى ريال','guest',undefined,'ar').promise;
  assert.match(response.answer,/100\.00 USD = 375\.00 SAR/);assert.equal(response.agent.tool,'currency');
  const invalid=await run('convert 1,000 USD to SAR').promise;assert.match(invalid.answer,/Specify the amount/);
 }finally{globalThis.fetch=previous;clearCurrencyCacheForTests();}
});
test('weather reads the current Cairo tool and does not substitute Dubai',async()=>{
 const {clearWeatherCacheForTests}=await import('../lib/weather/service');clearWeatherCacheForTests();const previous=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=async(url)=>{calls++;assert.match(String(url),/^https:\/\/api\.open-meteo\.com/);return Response.json({current:{temperature_2m:31,weather_code:0,time:'2026-09-28T12:00'}});};
  const cairo=await run('weather Cairo').promise;assert.match(cairo.answer,/31°C/);assert.match(cairo.answer,/not a forecast/);
  const dubai=await run('weather Dubai').promise;assert.match(dubai.answer,/will not substitute/);assert.equal(calls,1);
 }finally{globalThis.fetch=previous;clearWeatherCacheForTests();}
});
test('map tool stays inside platform until explicit navigation',async()=>{
 const response=await run('خريطة المطار','guest',undefined,'ar').promise;
 assert.match(response.answer,/\/#home-map/);assert.doesNotMatch(response.answer,/https?:/);assert.equal(platformLinkAllowed('/#home-map'),true);
 assert.equal(platformLinkAllowed('/?redirect=https://evil.invalid#home-map'),false);
});
