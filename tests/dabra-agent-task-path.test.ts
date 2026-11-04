import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server';
import ts from 'typescript';
import { runInternalAgentTask, AgentTaskCoordinator } from '../lib/dabra/agent-handoff';
import { agentIntent, type AgentContext, type AgentReadResult, type AgentRole, type AgentTaskAuthority, type AgentTool, type AgentTaskSpec, type AgentExecutiveReadResult, type AgentContactInboxReadResult } from '../lib/dabra/agent-contract';

const customer: AgentTaskAuthority = { kind: 'customer', actorId: 'customer-a', ownerId: 'customer-a' };
function context(role: AgentRole = 'customer', authority: AgentTaskAuthority = customer) {
  const queries: Array<{ reference: string | null; operational: boolean }> = [];
  const ctx: AgentContext = { role, taskAuthority: authority, isTaskAuthorityCurrent: async () => true,
    readRequests: async (reference, operational) => {
      queries.push({ reference, operational });
      return { kind: 'ready', requests: [], scope: operational ? 'egypt' : 'own', truncated: false, retrievedAt: '2026-10-27T00:00:00.000Z' };
    } };
  return { ctx, queries };
}
function routeFor(ctx: AgentContext, coordinator?: AgentTaskCoordinator) {
  const require = createRequire(import.meta.url); const exports = {};
  const dependencies: Record<string, unknown> = {
    'next/server': { NextRequest, NextResponse, after: () => { throw new Error('Unexpected background provider work'); } },
    '@/lib/dabra/agent-context': { resolveAgentContext: async () => ctx },
    ...(coordinator ? { '@/lib/dabra/agent-handoff': { runInternalAgentTask: (input: Parameters<typeof runInternalAgentTask>[0], options: Parameters<typeof runInternalAgentTask>[1]) => runInternalAgentTask(input, { ...options, coordinator }) } } : {}),
  };
  const source = readFileSync('app/api/ai2/chat/route.ts', 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id), process, Date }, { filename: 'Task217-chat-route' });
  return (exports as typeof import('../app/api/ai2/chat/route')).POST;
}
async function isolated<T>(run: () => Promise<T>) {
  const enabled = process.env.DABRA_INTERNAL_AI_ENABLED; const fetch = globalThis.fetch; let calls = 0;
  process.env.DABRA_INTERNAL_AI_ENABLED = 'false';
  globalThis.fetch = async () => { calls++; throw new Error('Task217 test attempted live network'); };
  try { const result = await run(); assert.equal(calls, 0, 'delta execution must not call a provider or live service'); return result; }
  finally { globalThis.fetch = fetch; if (enabled === undefined) delete process.env.DABRA_INTERNAL_AI_ENABLED; else process.env.DABRA_INTERNAL_AI_ENABLED = enabled; }
}
function request(message: string, locale: 'ar' | 'en', signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, locale, role: 'ceo', country: 'ALL', ownerId: 'other-customer' }), signal });
}
const scenarios: Array<{ role: AgentRole; tool: AgentTool; authority: AgentTaskAuthority; ar: string; en: string; reads: number }> = [
  { role: 'customer', tool: 'capabilities', authority: customer, ar: 'ماذا تستطيع', en: 'what can you do', reads: 0 },
  { role: 'customer', tool: 'my_requests', authority: customer, ar: 'طلباتي', en: 'my requests', reads: 1 },
  { role: 'customer', tool: 'call_center', authority: customer, ar: 'جهز رد مركز الاتصال', en: 'draft call center response', reads: 0 },
  { role: 'admin', tool: 'operations', authority: { kind: 'operator', actorId: 'operator-a', role: 'admin', country: 'EG' }, ar: 'العمليات', en: 'operations', reads: 1 },
  { role: 'ceo', tool: 'executive', authority: { kind: 'operator', actorId: 'executive-a', role: 'ceo', country: 'EG' }, ar: 'ملخص تنفيذي', en: 'executive', reads: 1 },
];
for (const scenario of scenarios) for (const locale of ['ar', 'en'] as const) {
  test('Task217: actual POST uses authorized Core handoff for ' + scenario.tool + '/' + locale, async () => isolated(async () => {
    const fixture = context(scenario.role, scenario.authority); const response = await routeFor(fixture.ctx)(request(scenario[locale], locale));
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
    const body = await response.json();
    assert.equal(body.language, locale); assert.equal(body.agent.tool, scenario.tool); assert.equal(body.agent.mutations, 0);
    assert.equal(fixture.queries.length, scenario.reads);
    for (const query of fixture.queries) assert.equal(query.operational, ['operations', 'executive'].includes(scenario.tool));
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /customer-a|operator-a|executive-a|other-customer|inputDigest|idempotencyKey|taskAuthority/);
    if (locale === 'ar') assert.match(body.answer, /[\u0600-\u06ff]/);
  }));
}

test('Task217: client role/country/owner fields cannot supply missing server task authority', async () => isolated(async () => {
  for (const authority of [
    { kind: 'customer', actorId: 'customer-a', ownerId: 'customer-b' },
    { kind: 'operator', actorId: 'operator-a', role: 'admin', country: null },
    { kind: 'guest' },
  ] satisfies AgentTaskAuthority[]) {
    const fixture = context(authority.kind === 'operator' ? 'admin' : authority.kind === 'guest' ? 'guest' : 'customer', authority);
    const message = authority.kind === 'customer' ? 'my requests' : 'operations';
    const response = await routeFor(fixture.ctx)(request(message, 'en'));
    const body = await response.json(); assert.equal(fixture.queries.length, 0);
    assert.ok(['forbidden', 'authentication_required'].includes(body.agent.state)); assert.notEqual(body.agent.state, 'ready');
  }
}));

test('Task217: authority revoked before a private handoff prevents its read', async () => isolated(async () => {
  const fixture = context(); fixture.ctx.isTaskAuthorityCurrent = async () => false;
  const response = await routeFor(fixture.ctx)(request('my requests', 'en'));
  assert.equal(response.status, 409); assert.equal(fixture.queries.length, 0);
}));

for (const stop of ['revocation', 'abort'] as const) test('Task217: actual POST discards a late private result after ' + stop, async () => isolated(async () => {
  const fixture = context(); const gate = Promise.withResolvers<AgentReadResult>(); const started = Promise.withResolvers<void>(); let current = true;
  fixture.ctx.isTaskAuthorityCurrent = async () => current;
  fixture.ctx.readRequests = async () => { started.resolve(); return gate.promise; };
  const controller = new AbortController(); const pending = routeFor(fixture.ctx)(request('my requests', 'en', controller.signal));
  await started.promise; if (stop === 'abort') controller.abort(); else current = false;
  gate.resolve({ kind: 'ready', requests: [{ reference: 'REQ-PRIVATE123', status: 'under_review', quote: null, nextAction: null }],
    scope: 'own', truncated: false, retrievedAt: '2026-10-27T00:00:00.000Z' });
  const response = await pending; assert.equal(response.status, 409);
  assert.doesNotMatch(await response.text(), /PRIVATE123|under_review|customer-a/);
}));

test('Task217: deterministic Core receipt binds input/output without storing the private prompt or claiming a model call', async () => isolated(async () => {
  const fixture = context(); const message = 'my requests synthetic-private-prompt'; const intent = agentIntent(message);
  const result = await runInternalAgentTask({ message, locale: 'en', history: [], context: fixture.ctx, intent });
  assert.equal(result.kind, 'response'); assert.equal(result.task.kind, 'completed');
  if (result.task.kind === 'completed') {
    assert.match(result.task.evidence.inputDigest, /^[a-f0-9]{64}$/); assert.match(result.task.evidence.outputDigest, /^[a-f0-9]{64}$/);
    assert.equal(result.task.evidence.source, 'dir3com-core');
    assert.deepEqual(result.task.accounting, { kind: 'known', consumption: { attempts: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 } });
    assert.doesNotMatch(JSON.stringify(result.task), /synthetic-private-prompt|customer-a/);
  }
}));

const metricsFixture: AgentExecutiveReadResult = {kind:'ready',retrievedAt:'2026-11-04T00:00:00Z',metrics:{
 productionBookings:{status:'available',value:2},confirmedProductionRevenue:{status:'available',value:125},
 pendingSettlements:{status:'available',value:1},pendingRefunds:{status:'unavailable'},pendingVerifications:{status:'available',value:0},failedNotifications:{status:'unavailable'},
}};
const inboxFixture: AgentContactInboxReadResult = {kind:'ready',country:'EG',counts:{received:2,in_progress:1,closed:0},displayed:3,truncated:false,retrievedAt:'2026-11-04T00:00:00Z'};
for(const tool of ['executive_metrics','contact_inbox'] as const)for(const locale of ['ar','en'] as const)test('Task217 role delta: actual POST returns authorized '+tool+'/'+locale+' without a model',async()=>isolated(async()=>{
 const authority:AgentTaskAuthority=tool==='executive_metrics'?{kind:'operator',role:'ceo',actorId:'executive-a',country:null}:{kind:'operator',role:'staff',actorId:'operator-a',country:'EG'};
 const fixture=context(tool==='executive_metrics'?'ceo':'staff',authority);let reads=0;
 fixture.ctx.readExecutiveMetrics=async()=>{reads++;return metricsFixture;};fixture.ctx.readContactInbox=async()=>{reads++;return inboxFixture;};
 const c=new AgentTaskCoordinator(),specs:AgentTaskSpec[]=[];const prepare=c.prepare.bind(c);
 c.prepare=(...args)=>{specs.push(args[0]);return prepare(...args);};
 const message=tool==='executive_metrics'?(locale==='ar'?'مؤشرات المكتب التنفيذي':'executive metrics'):(locale==='ar'?'صندوق التواصل':'contact inbox');
 const response=await routeFor(fixture.ctx,c)(request(message,locale));const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.agent.tool,tool);assert.equal(body.agent.mutations,0);assert.equal(body.provider,'local');
 assert.equal(reads,1);assert.equal(fixture.queries.length,0);assert.equal(specs.length,1);
 assert.equal(specs[0].scope.kind,tool==='executive_metrics'?'executive':'country');
 assert.equal(specs[0].productRole,tool==='executive_metrics'?'ceo':'admin');
 assert.ok(body.sources.some((s:{sourceId:string})=>s.sourceId===(tool==='executive_metrics'?'dir3com-executive-dashboard':'dir3com-contact-inbox')));
 assert.match(body.answer,tool==='executive_metrics'?/125/:/3/);
 assert.doesNotMatch(JSON.stringify(body),/actorId|taskAuthority|executive-a|operator-a/);
 if(tool==='executive_metrics')assert.match(body.answer,locale==='ar'?/ليس.*شامل|ليست.*شامل/:/not a proven platform-wide total/);
}));
for(const [role,authority,tool]of [
 ['customer',customer,'executive_metrics'],['admin',{kind:'operator',actorId:'operator-a',role:'admin',country:'EG'},'executive_metrics'],
 ['customer',customer,'contact_inbox'],['staff',{kind:'operator',actorId:'operator-a',role:'staff',country:null},'contact_inbox'],
 ['ceo',customer,'executive_metrics'],
] satisfies Array<[AgentRole,AgentTaskAuthority,'executive_metrics'|'contact_inbox']>)test('Task217 role delta: actual POST denies crossed '+role+'/'+authority.kind+'/'+tool,async()=>isolated(async()=>{
 const fixture=context(role,authority);let reads=0;
 fixture.ctx.readExecutiveMetrics=async()=>{reads++;return metricsFixture;};fixture.ctx.readContactInbox=async()=>{reads++;return inboxFixture;};
 const response=await routeFor(fixture.ctx)(request(tool==='executive_metrics'?'executive metrics':'contact inbox','en'));const body=await response.json();
 assert.equal(reads,0);assert.equal(fixture.queries.length,0);assert.equal(body.agent.state,'forbidden');
 assert.doesNotMatch(body.answer,/125|Pending settlements: 1|Received: 2/);
}));
for(const tool of ['executive_metrics','contact_inbox'] as const)for(const stop of ['revocation','abort'] as const)test('Task217 role delta: actual POST discards '+tool+' after '+stop,async()=>isolated(async()=>{
 const fixture=context(tool==='executive_metrics'?'ceo':'staff',{kind:'operator',role:tool==='executive_metrics'?'ceo':'staff',actorId:'operator-a',country:'EG'});
 let current=true;const gate=Promise.withResolvers<void>(),started=Promise.withResolvers<void>();
 fixture.ctx.isTaskAuthorityCurrent=async()=>current;
 fixture.ctx.readExecutiveMetrics=async()=>{started.resolve();await gate.promise;return metricsFixture;};
 fixture.ctx.readContactInbox=async()=>{started.resolve();await gate.promise;return inboxFixture;};
 const controller=new AbortController(),pending=routeFor(fixture.ctx)(request(tool==='executive_metrics'?'executive metrics':'contact inbox','en',controller.signal));
 await started.promise;if(stop==='abort')controller.abort();else current=false;gate.resolve();
 const response=await pending;assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/125|Received|Pending settlements/);
}));
