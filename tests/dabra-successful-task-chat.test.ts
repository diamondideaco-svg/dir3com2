import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { successfulTaskProductionGate, parseSuccessfulTaskProductionPolicy, readSuccessfulTaskProductionPolicy } from '../lib/dabra/successful-task-production-policy';
import { successfulTaskChatResponse } from '../lib/dabra/successful-task-chat';
import { successfulTaskInputDigest } from '../lib/dabra/successful-task-development';
import { DEFAULT_AGENT_DIALOGUE_POLICY } from '../lib/dabra/agent-dialogue';
import { consumeDabraChatResponse, approvedAssistantAnswer } from '../lib/dabra/chat-response-contract';
import { ConversationSession } from '../lib/dabra/conversation-session';
import { interpretSuccessfulTaskDecisions } from '../lib/dabra/successful-task-decision-contract';
import type { runSuccessfulTaskProduction, SuccessfulTaskProductionInput } from '../lib/dabra/successful-task-production-runtime';
import type { resolveSuccessfulTaskCoreDecisions } from '../lib/dabra/successful-task-core-decisions';
import { CEO_USER_ID } from '../lib/auth/team-access';
import type { FundingRpc } from '../lib/dabra/dialogue-funding-store';
import type { FxSnapshot } from '../lib/currency/display';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import { successfulTaskRuntimeFixture, syntheticProviderEnvironment } from './fixtures/task237-runtime-synthetic';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
type ChatResponseArgs = Parameters<typeof successfulTaskChatResponse>;
const require = createRequire(import.meta.url);
function assertRouteHasNoSuccessfulTaskDependencies(source: string) {
  const route = ts.createSourceFile('route.ts', source, ts.ScriptTarget.ES2022, true);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'successfulTaskChatResponse') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(route);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.length, 4, 'actual POST must pass only four arguments, without synthetic dependencies');
  return calls[0];
}
/** Execute the actual unchanged POST source, substituting explicit synthetic IO
 * at module boundaries. There is no registration hook in the deployed handler.
 */
function fixture(options: { continuityServer?: Record<string, unknown>; productionRun?: typeof runSuccessfulTaskProduction; coreResolve?: typeof resolveSuccessfulTaskCoreDecisions; productionPolicy?: unknown; inject?: boolean; fault?: string; trip?: SavedTrip; revokeDuringAllowance?: boolean; totalHeldCostMicros?: number;
  snapshot?: () => FxSnapshot | null; beforePolicy?: () => void; beforeTaskRead?: () => void; beforeAuthority?: () => void; hangAfterSaveAt?: number; hangAllowance?: boolean } = {}) {
  const f = successfulTaskRuntimeFixture('customer', options.fault === 'denied' ? 'denied' : '');
  let row: Record<string, unknown> | null = null, legacyReads = 0, rpcReads = 0;
  let continuityCurrent = true;
  const inputs: Input[] = [];
  const routeCalls: ChatResponseArgs[] = [];
  let authorityCallsAfterSave = 0;
  const checkAuthority = f.context.isTaskAuthorityCurrent!;
  f.context.isTaskAuthorityCurrent = async () => {
    options.beforeAuthority?.();
    if (row?.state === 'succeeded' && options.hangAfterSaveAt && ++authorityCallsAfterSave >= options.hangAfterSaveAt) return new Promise(() => {});
    return checkAuthority();
  };
  const rpc: FundingRpc = async (name, p, signal) => {
    rpcReads++;
    if (name === 'get_dabra_successful_task_allowance') {
      if (options.hangAllowance) return new Promise(() => {});
      if (options.revokeDuringAllowance) f.revoke();
      return { error: null, data: { dailySucceeded: row?.state === 'succeeded' ? 1 : 0, monthlySucceeded: row?.state === 'succeeded' ? 1 : 0,
        dailyPending: row?.state === 'pending' ? 1 : 0, monthlyPending: row?.state === 'pending' ? 1 : 0,
        accountHeldCostMicros: f.stats().holds.reduce((n, h) => n + h.cost, 0),
        totalHeldCostMicros: options.totalHeldCostMicros ?? f.stats().holds.reduce((n, h) => n + h.cost, 0) } };
    }
    if (name === 'read_dabra_successful_task') {
      options.beforeTaskRead?.();
      return { error: null, data: !row ? { state: 'absent' }
        : row.actor !== p.p_actor_id ? { state: 'absent' } : row.digest !== p.p_input_digest ? { state: 'conflict' } : row };
    }
    if (name === 'get_dabra_successful_task_policy') { options.beforePolicy?.(); return f.rpc('get_dabra_public_dialogue_policy', p, signal); }
    if (name === 'reserve_dabra_successful_task') {
      const result = await f.rpc('reserve_dabra_public_dialogue_attempt', p, signal);
      if (options.fault === 'denied') return result;
      row = { state: 'pending', digest: p.p_input_digest, actor: p.p_actor_id };
      return options.fault === 'lost-admission' ? { error: 'SYNTHETIC lost admission', data: null } : result;
    }
    assert.equal(name, 'finish_dabra_successful_task');
    row = { ...row, state: p.p_outcome, answer: p.p_answer, language: p.p_language };
    return options.fault === 'lost-save' ? { error: 'SYNTHETIC lost save', data: null } : { error: null, data: { state: p.p_outcome } };
  };
  const deps = {
    '@/lib/dabra/successful-task-production-policy': { successfulTaskProductionGate: (policy: unknown, request: NextRequest, _resolve: undefined, execution: SuccessfulTaskProductionInput) => successfulTaskProductionGate(policy, request, options.coreResolve ?? (async () => null), options.productionRun ? execution : undefined, options.productionRun), readSuccessfulTaskProductionPolicy: () => Object.hasOwn(options, 'productionPolicy') ? options.productionPolicy : readSuccessfulTaskProductionPolicy() },
    '@/lib/dabra/successful-task-chat': { successfulTaskChatResponse: (...args: ChatResponseArgs) => {
      routeCalls.push(args);
      const [resolve, ...rest] = args;
      const resolveInput = async () => { const input = await resolve(); inputs.push(input); return input; };
      // Keep input observation while forwarding the complete remaining argument
      // list, including any fifth dependency the real route might supply.
      if (options.inject === false) return successfulTaskChatResponse(resolveInput, ...rest);
      assert.equal(args.length, 4, 'actual POST must not supply successful-task dependencies');
      const [id, signal, stream] = rest;
      // Only this explicit test branch adds the isolated synthetic transport.
      return successfulTaskChatResponse(resolveInput, id, signal, stream, { dataScope: 'synthetic-only', rpc });
    } },
    '@/lib/dabra/agent-context': { resolveAgentContext: async () => f.context },
    '@/lib/dabra/continuity-chat-server': options.continuityServer ?? { resolveContinuityChatTrip: async () => continuityCurrent ? options.trip ?? null : null },
    '@/lib/currency/service': { getCurrencySnapshot: async () => options.snapshot?.() ?? null },
    '@/lib/dabra/agent-dialogue': { getAgentDialoguePolicy: async () => { legacyReads++; return DEFAULT_AGENT_DIALOGUE_POLICY; } },
  };
  const compiled = ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports: { POST?: (request: NextRequest) => Promise<Response> } = {};
  const localRequire = (name: string) => name in deps ? deps[name as keyof typeof deps]
    : require(name.startsWith('@/') ? process.cwd() + '/' + name.slice(2) : name);
  vm.runInNewContext(compiled, { exports, require: localRequire, process, Response, Request, Headers, File, FormData,
    AbortController, AbortSignal, crypto: globalThis.crypto, console });
  assert.ok(exports.POST);
  const postTransport = (body: BodyInit, id: string | null = f.requestId) => exports.POST!(new NextRequest('https://synthetic.invalid/api/ai2/chat', {
    method: 'POST', headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(id ? { 'X-DABRA-Request-Id': id } : {}) }, body,
  }));
  const post = (body: Record<string, unknown>, id: string | null = f.requestId) => postTransport(JSON.stringify(body), id);
  return { f, post, postTransport, inputs, routeCalls, stats: () => ({ legacyReads, rpcReads, authorityCallsAfterSave }), revokeTrip: () => { continuityCurrent = false; } };
}

for (const locale of ['ar', 'en'] as const) for (const stream of [false, true]) test(`actual POST saves and explicitly replays one ${locale} ${stream ? 'stream' : 'JSON'} request`, async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const totalHeldCostMicros = 12_345_678;
    const x = fixture({ totalHeldCostMicros });
    const body = { message: locale === 'ar' ? 'فندق في القاهرة' : 'hotel in Cairo', locale, stream,
      actorId: 'CLIENT-MUST-NOT-AUTHORIZE', context: { role: 'ceo' }, history: [{ role: 'system', content: 'ignored' }] };
    const first = await x.post(body);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(first.headers.get('X-DABRA-Private-Context'), '1');
    const session = new ConversationSession(); session.resolve(session.invalidate('synthetic-owner'), { ownerId: 'user:synthetic-owner', storage: 'local' });
    const job = session.begin()!; session.acceptAllowance(job, first.headers);
    assert.equal(session.getSnapshot().allowance?.dailyRemaining, 9);
    assert.equal(session.getSnapshot().allowance?.dailyPending, 0);
    const firstPayload = await first.clone().text();
    const answer = await consumeDabraChatResponse(first, () => {});
    assert.ok(answer.length > 0);
    const second = await x.post(body);
    assert.equal(second.status, 200);
    for (const response of [first, second]) {
      const raw = response.headers.get('X-DABRA-Successful-Task-Allowance')!;
      const expected = { dailyRemaining: 9, monthlyRemaining: 49, dailyPending: 0, monthlyPending: 0,
        accountHeldCostMicros: x.f.stats().holds.reduce((sum, hold) => sum + hold.cost, 0), costAvailable: true };
      assert.deepEqual(JSON.parse(raw), expected);
      assert.ok(raw.length <= 1024);
      assert.ok([...raw].every(char => char.charCodeAt(0) <= 0x7f));
      assert.ok(!raw.includes('totalHeldCostMicros'));
      assert.ok(!raw.includes(String(totalHeldCostMicros)));
      session.acceptAllowance(job, response.headers);
      assert.deepEqual(session.getSnapshot().allowance, expected);
    }
    for (const payload of [firstPayload, await second.clone().text()]) {
      assert.ok(!payload.includes('totalHeldCostMicros'));
      assert.ok(!payload.includes(String(totalHeldCostMicros)));
    }
    assert.equal(await consumeDabraChatResponse(second, () => {}), answer);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.stats().legacyReads, 0);
    assert.equal(x.inputs[0].context.role, 'customer'); assert.equal(x.inputs[0].history?.length, 0);
    assert.equal(successfulTaskInputDigest(x.inputs[0]), successfulTaskInputDigest(x.inputs[1]));
    assert.equal((await x.post({ ...body, message: 'different input' })).status, 409);
    assert.equal(x.f.stats().models, 1);
  } finally { restore(); }
});

test('default POST cannot enable synthetic storage through an ENV or request field and keeps Core available', async () => {
  const restore = syntheticProviderEnvironment(); const prior = process.env.DABRA_SUCCESSFUL_TASK_ENABLED;
  try {
    process.env.DABRA_SUCCESSFUL_TASK_ENABLED = 'true';
    const x = fixture({ inject: false });
    const response = await x.post({ message: 'hello', locale: 'en', successfulTask: true, dataScope: 'synthetic-only' });
    assert.equal(x.routeCalls.length, 1); assert.equal(x.routeCalls[0].length, 4);
    assert.equal(response.status, 200); assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
    assert.equal(x.inputs.length, 0); assert.equal(x.stats().rpcReads, 0); assert.equal(x.stats().legacyReads, 1);
    assert.equal(x.f.stats().models, 0);
  } finally { if (prior === undefined) delete process.env.DABRA_SUCCESSFUL_TASK_ENABLED; else process.env.DABRA_SUCCESSFUL_TASK_ENABLED = prior; restore(); }
});

test('default POST source guard rejects even an undefined fifth dependency argument', () => {
  const source = readFileSync('app/api/ai2/chat/route.ts', 'utf8');
  const call = assertRouteHasNoSuccessfulTaskDependencies(source);
  const mutated = source.slice(0, call.end - 1) + ', undefined' + source.slice(call.end - 1);
  assert.throws(() => assertRouteHasNoSuccessfulTaskDependencies(mutated), /actual POST must pass only four arguments/);
});

for (const fault of ['lost-save', 'lost-admission', 'denied']) test(`actual POST ${fault} preserves one-attempt accounting`, async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const x = fixture({ fault }); const body = { message: 'hotel in Cairo', locale: 'en' };
    const first = await x.post(body);
    assert.equal(first.status, fault === 'denied' ? 200 : 409);
    if (fault === 'denied') {
      assert.equal((await first.json()).saved, false); assert.equal(x.f.stats().holds.length, 0);
    } else {
      assert.equal((await first.json()).state, fault === 'lost-save' ? 'unknown' : 'pending');
      const retry = await x.post(body);
      assert.equal(retry.status, fault === 'lost-save' ? 200 : 409);
      assert.equal(x.f.stats().holds.length, 1); assert.equal(x.f.stats().claims, 1);
    }
    assert.equal(x.f.stats().models, fault === 'lost-save' ? 1 : 0); assert.equal(x.stats().legacyReads, 0);
  } finally { restore(); }
});

test('canonical POST binds authenticated continuity receipt and server trip, not client fields', async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const trip: SavedTrip = { id: randomUUID(), origin: null, destination: 'Cairo', startDate: null, endDate: null,
      adults: 1, children: 0, rooms: 1, budget: null, currency: 'USD', families: ['stay'] };
    const x = fixture({ trip }); const body = { message: 'resume my saved trip', locale: 'en',
      continuityTrip: { revision: 2, generation: 3, trip: { ...trip, destination: 'CLIENT-FAKE-DESTINATION' } } };
    assert.equal((await x.post(body)).status, 200);
    assert.equal(x.inputs[0].trip?.destination, 'Cairo');
    assert.equal(x.inputs[0].continuityBinding?.revision, 2); assert.equal(x.inputs[0].continuityBinding?.generation, 3);
    const calls = x.f.stats().models; x.revokeTrip();
    assert.equal((await x.post(body)).status, 409); assert.equal(x.f.stats().models, calls);
  } finally { restore(); }
});

test('revocation during final allowance read prevents answer delivery', async () => {
  const restore = syntheticProviderEnvironment();
  try { const x = fixture({ revokeDuringAllowance: true });
    const response = await x.post({ message: 'hotel in Cairo', locale: 'en' });
    assert.equal(response.status, 503); assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
    assert.equal((await response.json()).saved, false); assert.equal(x.f.stats().models, 1);
  } finally { restore(); }
});

test('injected adapter rejects production and absent identities before resolving input or reading storage', async () => {
  const restore = syntheticProviderEnvironment();
  try {
    let reads = 0;
    const resolve = async (): Promise<Input> => { reads++; throw Error('must not resolve'); };
    const rpc: FundingRpc = async () => { reads++; throw Error('must not read'); };
    const deps = { dataScope: 'synthetic-only' as const, rpc };
    assert.equal((await successfulTaskChatResponse(resolve, undefined, new AbortController().signal, false, deps))?.status, 400);
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.equal((await successfulTaskChatResponse(resolve, randomUUID(), new AbortController().signal, false, deps))?.status, 503);
    assert.equal(reads, 0);
  } finally { restore(); }
});

for (const transportKind of ['json', 'multipart']) test(`interrupted ${transportKind} transport explicitly retries the original saved POST without a second model attempt`, async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const x = fixture(); const session = new ConversationSession();
    session.resolve(session.invalidate('synthetic-owner'), { ownerId: 'user:synthetic-owner', storage: 'local' });
    const payload = { message: 'hotel in Cairo', history: [], locale: 'en', currency: 'USD', ...(transportKind === 'multipart' ? { stream: true } : {}) };
    const form = new FormData(); for (const [key, value] of Object.entries(payload)) form.set(key, key === 'history' ? JSON.stringify(value) : String(value));
    const body = transportKind === 'json' ? JSON.stringify(payload) : form;
    const firstJob = session.begin()!;
    const firstTransport = session.transport(firstJob, 'same-original-input', body);
    const first = await x.postTransport(firstTransport.body, firstTransport.id);
    assert.equal(first.status, 200);
    const raw = await first.text();
    const answer = transportKind === 'json' ? JSON.parse(raw).answer : raw;
    const interrupted = new Response(raw.slice(0, 4), { headers: first.headers });
    let invalid = false;
    if (transportKind === 'json') {
      // FloatingDibrah actually parses a nonstream JSON response and fails if
      // the interrupted body has no answer. Do not substitute stream parsing.
      assert.match(first.headers.get('Content-Type') ?? '', /application\/json/);
      const payload = await interrupted.json().catch(() => ({})) as { answer?: string };
      if (!approvedAssistantAnswer(payload)) { invalid = true; session.fail(firstJob, 'interrupted'); }
    } else {
      await consumeDabraChatResponse(interrupted, () => {}, 'SYNTHETIC interrupted', () => { invalid = true; session.fail(firstJob, 'interrupted'); });
    }
    assert.equal(invalid, true); session.finish(firstJob);
    const retryJob = session.begin()!;
    const retryTransport = session.transport(retryJob, 'same-original-input', 'MUST-NOT-REPLACE-ORIGINAL');
    assert.equal(retryTransport.id, firstTransport.id); assert.equal(retryTransport.body, body);
    const retry = await x.postTransport(retryTransport.body, retryTransport.id);
    assert.equal(retry.status, 200);
    assert.equal(transportKind === 'json' ? (await retry.json()).answer : await consumeDabraChatResponse(retry, () => {}), answer);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1);
    assert.equal(successfulTaskInputDigest(x.inputs[0]), successfulTaskInputDigest(x.inputs[1]));
  } finally { restore(); }
});


for (const hang of ['runner-identity', 'delivery-identity', 'final-delivery-identity', 'allowance'] as const) test(`post-save ${hang} has a finite deadline and never redispatches`, async () => {
  const restore = syntheticProviderEnvironment(); const keepAlive = setTimeout(() => {}, 2500);
  try {
    // Post-save authority reads: runner replay, delivery start, allowance pre-
    // and post-read, then the final delivery fence.
    const hangAfterSaveAt = { 'runner-identity': 1, 'delivery-identity': 2, 'final-delivery-identity': 5, allowance: undefined }[hang];
    const x = fixture({ hangAfterSaveAt, hangAllowance: hang === 'allowance' });
    const started = Date.now();
    const response = await x.post({ message: 'hotel in Cairo', locale: 'en' });
    assert.equal(response.status, 503); assert.ok(Date.now() - started < 1800);
    const payload = await response.json();
    assert.equal(payload.saved, false); assert.equal(payload.answer, undefined);
    assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
    if (hangAfterSaveAt) assert.equal(x.stats().authorityCallsAfterSave, hangAfterSaveAt);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
  } finally { clearTimeout(keepAlive); restore(); }
});

test('equivalent fresh FX refetch replays; expired, repriced, redated and recurrency inputs conflict', async () => {
  const restore = syntheticProviderEnvironment();
  try {
    let snapshot: FxSnapshot = { base: 'USD', provider: 'frankfurter', asOf: '2026-11-11', expiresAt: Date.now() + 600000,
      rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 } };
    const x = fixture({ snapshot: () => snapshot });
    const body = { message: 'plan a trip to Cairo', locale: 'en', currency: 'SAR' };
    const first = await x.post(body); assert.equal(first.status, 200); const answer = (await first.json()).answer;
    const originalDigest = successfulTaskInputDigest(x.inputs[0]);
    snapshot = { ...snapshot, expiresAt: Date.now() + 1200000, rates: { AED: 3.67, EUR: 0.9, EGP: 50, SAR: 3.75, USD: 1 } };
    const refreshed = await x.post(body); assert.equal(refreshed.status, 200); assert.equal((await refreshed.json()).answer, answer);
    assert.equal(successfulTaskInputDigest(x.inputs[1]), originalDigest);
    const fresh = snapshot;
    for (const changed of [{ ...fresh, expiresAt: Date.now() - 1 }, { ...fresh, rates: { ...fresh.rates, SAR: 3.8 } }, { ...fresh, asOf: '2026-11-10' }]) {
      snapshot = changed; assert.equal((await x.post(body)).status, 409);
    }
    snapshot = fresh; assert.equal((await x.post({ ...body, currency: 'EUR' })).status, 409);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
  } finally { restore(); }
});


for (const expiryAt of ['policy', 'provider']) test(`FX expiry during ${expiryAt} cannot save under the earlier fresh digest or redispatch`, async () => {
  const restore = syntheticProviderEnvironment(), actualNow = Date.now;
  let now = actualNow(); Date.now = () => now;
  try {
    let snapshot: FxSnapshot = { base: 'USD', provider: 'frankfurter', asOf: '2026-11-11', expiresAt: now + 100,
      rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 } };
    let expired = false;
    const expire = () => { if (!expired) { now += 200; expired = true; } };
    const x = fixture({ snapshot: () => snapshot, beforePolicy: expiryAt === 'policy' ? expire : undefined });
    const providerFetch = globalThis.fetch;
    if (expiryAt === 'provider') globalThis.fetch = async (url, init) => {
      const response = await providerFetch(url, init);
      if (String(url) === 'https://api.openai.com/v1/chat/completions') expire();
      return response;
    };
    const body = { message: 'plan a trip to Cairo', locale: 'en', currency: 'SAR' };
    const first = await x.post(body);
    assert.equal(first.status, expiryAt === 'policy' ? 503 : 409);
    const payload = await first.json(); assert.equal(payload.saved, false); assert.equal(payload.answer, undefined);
    assert.equal(x.f.stats().models, expiryAt === 'policy' ? 0 : 1);
    assert.equal(x.f.stats().claims, expiryAt === 'policy' ? 0 : 1);
    assert.equal(x.f.stats().holds.length, expiryAt === 'policy' ? 0 : 1);
    const heldCost = x.f.stats().holds.reduce((sum, hold) => sum + hold.cost, 0);
    snapshot = { ...snapshot, expiresAt: now + 600000 };
    const retry = await x.post(body);
    if (expiryAt === 'policy') {
      // The first request never admitted or executed. Explicit retry may make
      // its first, and only, admission after refreshing the equivalent quote.
      assert.equal(retry.status, 200); assert.equal((await retry.json()).saved, true);
    } else {
      assert.equal(payload.state, 'failed'); assert.equal(retry.status, 409);
      assert.equal((await retry.json()).state, 'failed');
      const allowance = JSON.parse(retry.headers.get('X-DABRA-Successful-Task-Allowance')!);
      assert.equal(allowance.dailyRemaining, 10); assert.equal(allowance.monthlyRemaining, 50); assert.equal(allowance.dailyPending, 0);
      assert.equal(x.f.stats().holds.reduce((sum, hold) => sum + hold.cost, 0), heldCost);
    }
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
  } finally { Date.now = actualNow; restore(); }
});


test('FX expiry during saved-task lookup rejects that replay without another attempt', async () => {
  const restore = syntheticProviderEnvironment(), actualNow = Date.now;
  let now = actualNow(); Date.now = () => now;
  try {
    let snapshot: FxSnapshot = { base: 'USD', provider: 'frankfurter', asOf: '2026-11-11', expiresAt: now + 600000,
      rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 } };
    let expireDuringRead = false;
    const x = fixture({ snapshot: () => snapshot, beforeTaskRead: () => { if (expireDuringRead) { now += 200; expireDuringRead = false; } } });
    const body = { message: 'plan a trip to Cairo', locale: 'en', currency: 'SAR' };
    const first = await x.post(body); assert.equal(first.status, 200); const answer = (await first.json()).answer;
    snapshot = { ...snapshot, expiresAt: now + 100 }; expireDuringRead = true;
    const interruptedValidity = await x.post(body); assert.equal(interruptedValidity.status, 409);
    assert.equal((await interruptedValidity.json()).state, 'conflict');
    snapshot = { ...snapshot, expiresAt: now + 600000 };
    const replay = await x.post(body); assert.equal(replay.status, 200); assert.equal((await replay.json()).answer, answer);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
  } finally { Date.now = actualNow; restore(); }
});


test('FX expiry in the first identity check before digest creation cannot admit or charge', async () => {
  const restore = syntheticProviderEnvironment(), actualNow = Date.now;
  let now = actualNow(); Date.now = () => now;
  try {
    let snapshot: FxSnapshot = { base: 'USD', provider: 'frankfurter', asOf: '2026-11-11', expiresAt: now + 100,
      rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 } };
    let snapshotRead = false, expired = false;
    const x = fixture({ snapshot: () => { snapshotRead = true; return snapshot; }, beforeAuthority: () => {
      if (snapshotRead && !expired) { now += 200; expired = true; }
    } });
    const body = { message: 'plan a trip to Cairo', locale: 'en', currency: 'SAR' };
    const first = await x.post(body); assert.equal(expired, true);
    assert.equal(first.status, 503); assert.equal((await first.json()).saved, false);
    assert.equal(x.f.stats().models, 0); assert.equal(x.f.stats().claims, 0); assert.equal(x.f.stats().holds.length, 0);
    snapshot = { ...snapshot, expiresAt: now + 600000 };
    const retry = await x.post(body); assert.equal(retry.status, 200); assert.equal((await retry.json()).saved, true);
    assert.equal(x.f.stats().models, 1); assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
  } finally { Date.now = actualNow; restore(); }
});

const decisionReferences = Object.freeze({ schema: 'dabra-successful-task-production-policy-v1',
  revision: 'fixture-revision', retentionDecision: 'fixture-retention', consentDecision: 'fixture-consent',
  deletionDecision: 'fixture-deletion', audienceDecision: 'fixture-audience', spendingDecision: 'fixture-spending' });
test('production policy requires every explicit decision and never treats references as activation', async () => {
  assert.ok(parseSuccessfulTaskProductionPolicy(decisionReferences));
  assert.equal(parseSuccessfulTaskProductionPolicy(null), null);
  for (const key of Object.keys(decisionReferences)) {
    const incomplete: Record<string, unknown> = { ...decisionReferences }; delete incomplete[key];
    assert.equal(parseSuccessfulTaskProductionPolicy(incomplete), null);
  }
  assert.equal(parseSuccessfulTaskProductionPolicy({ ...decisionReferences, consentDecision: 'task187-v1', extra: true }), null);
  let getterCalls = 0;
  assert.equal(parseSuccessfulTaskProductionPolicy({ ...decisionReferences, get revision() { getterCalls++; return 'changed'; } }), null);
  assert.equal(getterCalls, 0);
  const parsed = parseSuccessfulTaskProductionPolicy({ ...decisionReferences })!;
  assert.ok(Object.isFrozen(parsed));
  assert.equal(await successfulTaskProductionGate(null), null);
  assert.equal(await successfulTaskProductionGate(undefined), null);
  assert.equal((await successfulTaskProductionGate(decisionReferences))?.status, 503);
});

test('actual POST production policy boundary blocks incomplete and unresolved policies before any task or legacy IO', async () => {
  for (const productionPolicy of [{}, { schema: decisionReferences.schema }, decisionReferences]) {
    const x = fixture({ productionPolicy });
    const response = await x.post({ message: 'hotel in Cairo', locale: 'en' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
    assert.equal(x.routeCalls.length, 0); assert.equal(x.inputs.length, 0);
    assert.equal(x.stats().rpcReads, 0); assert.equal(x.stats().legacyReads, 0);
    assert.equal(x.f.stats().models, 0); assert.equal(x.f.stats().claims, 0);
    assert.equal(x.f.stats().holds.length, 0);
  }
});


function coreDecisionFixture(actorId = '11111111-1111-4111-8111-111111111111') {
  const profile = { id: actorId, role: 'customer', sourceRole: 'customer' };
  const kinds = ['retention', 'consent', 'deletion', 'audience', 'spending'] as const;
  const result = { schema: 'dabra-successful-task-core-decisions-v1', purpose: 'dabra-successful-task',
    actorId, role: 'customer', revision: String(decisionReferences.revision),
    decisions: Object.fromEntries(kinds.map(kind => [kind, {
      reference: String(decisionReferences[`${kind}Decision`]), approvedBy: kind === 'consent' ? actorId : CEO_USER_ID,
      approvalReference: 'synthetic-evidence', approvedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000,
      revokedAtMs: null, document: { syntheticOnly: true },
      fundingGrantId: kind === 'spending' ? '22222222-2222-4222-8222-222222222222' : null,
      fundingProofSha256: kind === 'spending' ? 'a'.repeat(64) : null,
    }])) };
  const state = { actorId, role: 'customer', project: true, error: false, hangs: false, throws: false,
    onRpc: () => {}, authCalls: 0, profiles: 0, calls: [] as Array<{ name: string; params: Record<string, unknown>; signal: AbortSignal }> };
  const client = { auth: { getUser: async () => ({ error: null, data: { user: { id: state.actorId } } }) } };
  const deps: Record<string, unknown> = {
    'server-only': {},
    '../supabase/server': {
      createSupabaseRequestClient: async () => { state.authCalls++; return { user: { id: actorId }, supabase: client }; },
      getSupabaseClientHostname: () => state.project ? 'synthetic-core' : 'other', getSupabaseAdminHostname: () => 'synthetic-core',
      supabaseAdmin: { rpc: (name: string, params: Record<string, unknown>) => ({ abortSignal: async (signal: AbortSignal) => {
        state.calls.push({ name, params, signal }); state.onRpc();
        if (state.throws) throw new Error('synthetic failure');
        if (state.hangs) return new Promise(() => {});
        return { error: state.error ? 'synthetic error' : null, data: result };
      } }) },
    },
    '../auth/identity': { resolveCanonicalActiveProfile: async (actual: unknown, id: string) => {
      assert.equal(actual, client); assert.equal(id, actorId); state.profiles++;
      return { ...profile, role: state.role, sourceRole: state.role };
    } },
    '../auth/team-access': { CEO_USER_ID },
    './credential-binding': { isCredentialBindingCoreProject: (host: string) => host === 'synthetic-core' },
  };
  const exports: { resolveSuccessfulTaskCoreDecisions?: typeof resolveSuccessfulTaskCoreDecisions } = {};
  const compiled = ts.transpileModule(readFileSync('lib/dabra/successful-task-core-decisions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (id: string) => { assert.ok(Object.hasOwn(deps, id), id); return deps[id]; },
    AbortSignal, structuredClone, Date, Promise, Set, Object, JSON });
  assert.ok(exports.resolveSuccessfulTaskCoreDecisions);
  return { state, result, resolve: exports.resolveSuccessfulTaskCoreDecisions };
}

test('Core decisions actual POST resolves server-owned approvals once without funding or legacy fallback', async () => {
  const c = coreDecisionFixture();
  const x = fixture({ productionPolicy: decisionReferences, coreResolve: c.resolve });
  const response = await x.post({ message: 'hotel in Cairo', locale: 'en', actorId: 'attacker', role: 'admin' });
  assert.equal(response.status, 503); assert.equal((await response.json()).state, 'policy_unavailable', 'opaque documents are not executable decisions');
  assert.equal(c.state.calls.length, 1); assert.equal(c.state.calls[0].name, 'resolve_dabra_successful_task_decisions');
  assert.equal(c.state.calls[0].params.p_actor_id, c.state.actorId);
  assert.equal(c.state.calls[0].params.p_actor_role, 'customer');
  assert.equal(JSON.stringify(c.state.calls[0].params.p_policy), JSON.stringify(decisionReferences));
  assert.equal(c.state.profiles, 2); assert.equal(x.stats().rpcReads, 0); assert.equal(x.stats().legacyReads, 0);
  assert.equal(x.f.stats().models, 0); assert.equal(x.f.stats().claims, 0); assert.equal(x.f.stats().holds.length, 0);
  assert.equal(x.routeCalls.length, 0);
  const route = ts.createSourceFile('route.ts', readFileSync('app/api/ai2/chat/route.ts', 'utf8'), ts.ScriptTarget.ES2022, true);
  const calls: ts.CallExpression[] = []; const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'successfulTaskProductionGate') calls.push(n);
    ts.forEachChild(n, visit);
  }; visit(route);
  assert.equal(calls.length, 1); assert.equal(calls[0].arguments.length, 4, 'actual route supplies canonical input but no test resolver/runtime');
  assert.equal(calls[0].arguments[2].getText(route), 'undefined');
  assert.equal(calls[0].arguments[1].getText(route), 'request');
});

test('Core decisions rejects missing, stale, withdrawn, cross-owner or conflicting approvals and spending evidence', async () => {
  for (const mutate of [
    (c: ReturnType<typeof coreDecisionFixture>) => { delete c.result.decisions.retention; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.revision = 'other'; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.actorId = 'other'; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.purpose = 'other'; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.decisions.consent.approvedBy = CEO_USER_ID; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.decisions.retention.expiresAtMs = Date.now() - 1; },
    (c: ReturnType<typeof coreDecisionFixture>) => { Object.assign(c.result.decisions.consent, { revokedAtMs: Date.now() }); },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.decisions.spending.fundingGrantId = null; },
    (c: ReturnType<typeof coreDecisionFixture>) => { c.result.decisions.deletion.reference = 'other'; },
  ]) {
    const c = coreDecisionFixture(); mutate(c);
    assert.equal(await c.resolve(new NextRequest('https://synthetic.invalid'), decisionReferences), null);
    assert.equal(c.state.calls.length, 1);
  }
});

test('Core decisions fences identity/project changes and errors with one read, aborts without retry', async () => {
  for (const fault of ['actor', 'role', 'project', 'error', 'throw'] as const) {
    const c = coreDecisionFixture(); c.state.onRpc = () => {
      if (fault === 'actor') c.state.actorId = '33333333-3333-4333-8333-333333333333';
      if (fault === 'role') c.state.role = 'admin';
      if (fault === 'project') c.state.project = false;
      if (fault === 'error') c.state.error = true;
      if (fault === 'throw') c.state.throws = true;
    };
    assert.equal(await c.resolve(new NextRequest('https://synthetic.invalid'), decisionReferences), null);
    assert.equal(c.state.calls.length, 1);
  }
  const c = coreDecisionFixture(), controller = new AbortController(); controller.abort();
  assert.equal(await c.resolve(new NextRequest('https://synthetic.invalid', { signal: controller.signal }), decisionReferences), null);
  assert.equal(c.state.authCalls, 0); assert.equal(c.state.calls.length, 0);
  c.state.hangs = true;
  const alive = setTimeout(() => {}, 1500);
  try { assert.equal(await c.resolve(new NextRequest('https://synthetic.invalid'), decisionReferences), null); }
  finally { clearTimeout(alive); }
  assert.equal(c.state.calls.length, 1); assert.ok(c.state.calls[0].signal.aborted);
});

test('Core decisions migration is empty, private, read-only and leaves synthetic lifecycle untouched', () => {
  const sql = readFileSync('supabase/migrations/20261112090000_task237_production_decision_resolution.sql', 'utf8');
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE FROM|CREATE OR REPLACE|DEFAULT)\b/i);
  assert.match(sql, /REVOKE ALL ON private\.dabra_successful_task_decisions FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resolve_dabra_successful_task_decisions\(uuid,text,jsonb\) TO service_role/);
  assert.doesNotMatch(sql, /GRANT[^;]+TO (?:anon|authenticated)/i);
  assert.match(sql, /d\.actor_id<>p_actor_id/); assert.match(sql, /d\.revoked_at_ms IS NOT NULL/);
  assert.match(sql, /funding_proof_sha256/); assert.match(sql, /FOR SHARE NOWAIT/);
  const relationLocks = sql.indexOf('LOCK TABLE auth.users,public.profiles,private.dabra_successful_task_decisions,');
  assert.ok(relationLocks >= 0 && relationLocks < sql.indexOf('PERFORM 1 FROM auth.users'));
  assert.match(sql, /private\.dabra_dialogue_funding_grants IN ROW SHARE MODE NOWAIT/);
  assert.equal((sql.match(/GET DIAGNOSTICS locked_count = ROW_COUNT/g) ?? []).length, 3);
  assert.equal((sql.match(/IF locked_count<>expected_identities THEN RETURN NULL/g) ?? []).length, 2);
  const guardText = 'IF locked_count<>5 THEN RETURN NULL';
  const assertCompleteLockGuard = (source: string) => {
    const guard = source.indexOf(guardText), loop = source.indexOf('FOR k IN SELECT unnest');
    assert.ok(guard >= 0 && loop >= 0 && guard < loop, 'complete-lock guard must exist before the decision loop');
  };
  assertCompleteLockGuard(sql);
  const withoutGuard = sql.replace(guardText, '');
  assert.throws(() => assertCompleteLockGuard(withoutGuard), /complete-lock guard must exist/);
  assert.throws(() => assertCompleteLockGuard(withoutGuard + '\n' + guardText), /complete-lock guard must exist/);

});

function executableDocuments(c: ReturnType<typeof coreDecisionFixture>, grantId: string) {
  const actorId = c.result.actorId, revision = c.result.revision;
  const documents = {
    retention: { schema: 'dabra-answer-retention-v1', answerRetentionMs: 60000 },
    consent: { schema: 'dabra-answer-consent-v1', actorId, revision, noticeVersion: 'synthetic-answer-v1',
      noticeSha256: 'c'.repeat(64), grantedAtMs: c.result.decisions.consent.approvedAtMs, generation: 0 },
    deletion: { schema: 'dabra-answer-deletion-v1', policyReference: 'synthetic-purge', purgeWithinMs: 1000, backupPolicyReference: 'synthetic-backup' },
    audience: { schema: 'dabra-task-audience-v1', actorId, role: 'customer', revision },
    spending: { schema: 'dabra-task-spending-v1', currency: 'USD', timeZone: 'Asia/Riyadh', grantId, maxAttempts: 1,
      dailySuccesses: 2, monthlySuccesses: 4, accountMonthlyCostMicros: 10000, monthlyCostMicros: 20000,
      attemptCostMicros: 5000, inputTokenCeiling: 4096, outputTokenCeiling: 1024, leaseMs: 12000 },
  };
  for (const [kind, document] of Object.entries(documents)) Object.assign(c.result.decisions[kind], { document });
  c.result.decisions.spending.fundingGrantId = grantId;
  return documents;
}

for (const lostAdmission of [false, true, 'continuity'] as const) test(`production lifecycle actual POST single admission and replay lost=${lostAdmission}`, async () => {
  const restore = syntheticProviderEnvironment();
  const lost = lostAdmission === true, withTrip = lostAdmission === 'continuity';
  const originalTrip = { id: randomUUID(), origin: 'Cairo', destination: 'Riyadh', startDate: null, endDate: null, adults: 2, children: 0, rooms: 1, budget: null, currency: 'USD', families: ['stay'] };
  const tripExpiry = Date.now() + 600000;
  let continuityRevoked = false, revokeOnFinalRead = false;
  const continuityServer: Record<string, unknown> = {};
  const continuityDeps: Record<string, unknown> = {
    '../supabase/server': { createSupabaseRequestClient: async () => ({ user: { id: c.result.actorId }, supabase: { rpc: async () => ({ error: null, data: { revision: 1, generation: continuityRevoked ? 1 : 0, consentEnabled: !continuityRevoked, consentVersion: continuityRevoked ? null : 'task187-v1', preferences: null, preferencesExpiresAt: null, trip: continuityRevoked ? null : originalTrip, tripExpiresAt: continuityRevoked ? null : new Date(tripExpiry).toISOString(), updatedAt: null } }) } }) },
    '../auth/identity': { resolveCanonicalActiveProfile: async () => ({ role: 'customer' }) },
  };
  let c: ReturnType<typeof coreDecisionFixture>;
  try {
    vm.runInNewContext(ts.transpileModule(readFileSync('lib/dabra/continuity-chat-server.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {exports:continuityServer,require:(id:string)=>Object.hasOwn(continuityDeps,id)?continuityDeps[id]:require(process.cwd()+'/lib/dabra/'+id),process:{env:{DABRA_CONTINUITY_ENABLED:'true'}},Date});
    const x = fixture({ continuityServer: withTrip ? continuityServer : undefined, productionPolicy: decisionReferences, coreResolve: (...args) => c.resolve(...args),
      productionRun: (...args) => runtime(...args) });
    c = coreDecisionFixture(x.f.context.taskAuthority!.kind === 'guest' ? '' : x.f.context.taskAuthority!.actorId);
    executableDocuments(c, x.f.proof.grantId);
    let row: Record<string, unknown> | null = null;
    const calls: string[] = [];
    const rpc: FundingRpc = async (name, p, signal) => {
      calls.push(name);
      if (withTrip && name !== 'finish_dabra_production_task') {
        const binding = p.p_continuity_binding as Record<string,unknown>;
        assert.equal(binding.ownerId,c.result.actorId); assert.equal(binding.tripExpiresAtMs,tripExpiry);
        assert.equal(JSON.stringify(binding.originalTrip),JSON.stringify(originalTrip));
      }
      assert.equal(p.p_actor_id, c.result.actorId);
      if (name !== 'finish_dabra_production_task') {
        assert.equal(p.p_actor_role, 'customer');
        assert.equal(JSON.stringify(p.p_policy), JSON.stringify(decisionReferences));
        assert.equal(JSON.stringify(p.p_expected_decisions), JSON.stringify(c.result));
      }
      if (name === 'get_dabra_production_task_policy') return x.f.rpc('get_dabra_public_dialogue_policy', { p_actor_id: p.p_actor_id }, signal);
      if (withTrip && revokeOnFinalRead && p.p_confirm_read === true) { continuityRevoked = true; return { error: null, data: null }; }
      if (name === 'read_dabra_production_task') return { error: null, data: row ?? { state: 'absent' } };
      if (name === 'reserve_dabra_production_task') {
        assert.equal(row, null, 'one atomic admission per UUID');
        const admitted = await x.f.rpc('reserve_dabra_public_dialogue_attempt', p, signal);
        row = { state: 'pending' };
        return lost ? { error: 'synthetic-lost-after-commit', data: null } : admitted;
      }
      assert.equal(name, 'finish_dabra_production_task');
      assert.equal(p.p_outcome, 'succeeded');
      row = { state: p.p_outcome, answer: p.p_answer, language: p.p_language, expiresAtMs: Date.now() + 60000, tripValidUntilMs: withTrip ? tripExpiry : null };
      return { error: null, data: { state: p.p_outcome } };
    };
    const deps: Record<string, unknown> = {
      'server-only': {},
      '../supabase/server': { supabaseAdmin: { rpc: (name: string, p: Record<string, unknown>) => ({ abortSignal: (signal: AbortSignal) => rpc(name, p, signal) }) }, getSupabaseAdminHostname: () => 'synthetic-core' },
      './credential-binding': { isCredentialBindingCoreProject: (host: string) => host === 'synthetic-core' },
    };
    const exported: { runSuccessfulTaskProduction?: typeof runSuccessfulTaskProduction } = {};
    const compiled = ts.transpileModule(readFileSync('lib/dabra/successful-task-production-runtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports: exported, require: (id: string) => Object.hasOwn(deps, id) ? deps[id] : require(process.cwd() + '/lib/dabra/' + id), Response, JSON, Object, structuredClone });
    assert.ok(exported.runSuccessfulTaskProduction); const runtime = exported.runSuccessfulTaskProduction;
    const body = { message: 'hotel in Cairo', locale: 'en', ...(withTrip ? { continuityTrip: { revision:1,generation:0,trip:{...originalTrip,destination:'Dubai'} } } : {}) };
    const first = await x.post(body), second = await x.post(body);
    assert.equal(first.status, lost ? 409 : 200);
    assert.equal(second.status, first.status);
    if (!lost) {
      const a = await first.json(), b = await second.json();
      assert.equal(a.saved, true); assert.equal(b.answer, a.answer); assert.equal(b.replay, true);
      assert.equal(calls.filter(n => n === 'finish_dabra_production_task').length, 1);
    }
    if (withTrip) { revokeOnFinalRead = true; const withdrawn = await x.post(body); assert.equal(withdrawn.status,503); }
    assert.equal(x.f.stats().claims, 1); assert.equal(x.f.stats().holds.length, 1);
    assert.equal(x.f.stats().models, lost ? 0 : 1); assert.equal(x.stats().legacyReads, 0);
    assert.equal(calls.filter(n => n === 'reserve_dabra_production_task').length, 1);
  } finally { restore(); }
});

test('production decision interpretation requires explicit values and binds consent account/revision', () => {
  const c = coreDecisionFixture(); const docs = executableDocuments(c, '22222222-2222-4222-8222-222222222222');
  assert.ok(interpretSuccessfulTaskDecisions(c.result));
  for (const kind of Object.keys(docs)) {
    const prior = c.result.decisions[kind].document;
    Object.assign(c.result.decisions[kind], { document: {} });
    assert.equal(interpretSuccessfulTaskDecisions(c.result), null);
    Object.assign(c.result.decisions[kind], { document: prior });
  }
  docs.consent.actorId = 'other'; assert.equal(interpretSuccessfulTaskDecisions(c.result), null);
  docs.consent.actorId = c.result.actorId; docs.consent.noticeVersion = 'task187-v1';
  assert.equal(interpretSuccessfulTaskDecisions(c.result), null);
});

 test('production review fixes: independent approved ceilings and stricter documents', () => {
  const c = coreDecisionFixture(); const docs = executableDocuments(c, '22222222-2222-4222-8222-222222222222');
  Object.assign(docs.spending, { dailySuccesses: 10, monthlySuccesses: 50, accountMonthlyCostMicros: 500000, monthlyCostMicros: 25000000 });
  assert.ok(interpretSuccessfulTaskDecisions(c.result));
  for (const [key, maximum] of Object.entries({ dailySuccesses: 10, monthlySuccesses: 50, accountMonthlyCostMicros: 500000, monthlyCostMicros: 25000000 })) {
    const prior = docs.spending[key as keyof typeof docs.spending];
    Object.assign(docs.spending, { [key]: maximum + 1 });
    assert.equal(interpretSuccessfulTaskDecisions(c.result), null, key);
    Object.assign(docs.spending, { [key]: prior });
  }
  Object.assign(docs.spending, { dailySuccesses: 1, monthlySuccesses: 2, accountMonthlyCostMicros: 5000, monthlyCostMicros: 10000 });
  assert.ok(interpretSuccessfulTaskDecisions(c.result));
  const sql = readFileSync('supabase/migrations/20261112100000_task237_production_lifecycle.sql', 'utf8');
  for (const [key, maximum] of Object.entries({ dailySuccesses: 10, monthlySuccesses: 50, accountMonthlyCostMicros: 500000, monthlyCostMicros: 25000000 }))
    assert.ok(sql.includes(`(s->>'${key}')::numeric>${maximum}`));
  assert.ok(sql.includes("n+t.retention_ms<=checked_ms"));
  assert.ok(sql.includes("SET state='failed',read_verified_at_ms=NULL"));
 });

for (const fault of ['none', 'callback-replaced', 'context-replaced', 'consent-withdrawn', 'consent-expired', 'answer-expired', 'ceo', 'impostor-ceo', 'ceo-authority-revoked', 'trip-blocked', 'trip-added-during-read', 'fx-expired-during-read', 'operations-eg-blocked', 'operations-eg-during-read']) test(`production review final read boundary: ${fault}`, async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const f = successfulTaskRuntimeFixture();
    const c = coreDecisionFixture();
    const ceo = fault.includes('ceo');
    if (ceo) {
      c.result.actorId = fault === 'impostor-ceo' ? c.result.actorId : CEO_USER_ID;
      c.result.role = 'admin';
      f.context.role = 'ceo';
      f.context.taskAuthority = { kind: 'operator', actorId: c.result.actorId, role: 'ceo', country: null };
    } else f.context.taskAuthority = { kind: 'customer', actorId: c.result.actorId, ownerId: c.result.actorId };
    if (fault.startsWith('operations-eg')) {
      c.result.role = 'admin'; f.context.role = 'admin';
      f.context.taskAuthority = { kind: 'operator', actorId: c.result.actorId, role: 'admin', country: fault === 'operations-eg-blocked' ? 'EG' : null };
    }
    const docs = executableDocuments(c, f.proof.grantId);
    Object.assign(docs.audience, { role: c.result.role });
    Object.assign(c.result.decisions.consent, { approvedBy: c.result.actorId });
    const terms = interpretSuccessfulTaskDecisions(c.result); assert.ok(terms);
    const input: Input = { context: f.context, message: 'hotel', history: [], locale: 'en' };
    let checks = 0, reads = 0, clock = Date.now(), storedExpiry: unknown = null;
    const originalExpiry = clock + 60000;
    if (fault === 'trip-blocked') input.continuityBinding = { revision: 1, generation: 0 };
    if (fault === 'fx-expired-during-read') input.pricing = { currency: 'SAR', snapshot: { base: 'USD', provider: 'frankfurter', asOf: '2026-11-11', expiresAt: originalExpiry,
      rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 } } };
    class Clock extends Date { static now() { return fault === 'fx-expired-during-read' ? clock : Date.now(); } }
    // Original callback is fixed before construction; the second wait is the final fence.
    f.context.isTaskAuthorityCurrent = async () => {
      checks++;
      await Promise.resolve();
      if (checks === 2 && fault === 'callback-replaced') f.context.isTaskAuthorityCurrent = async () => true;
      if (checks === 2 && fault === 'context-replaced') input.context = { ...f.context };
      if (checks === 2 && fault === 'consent-withdrawn') revoked = true;
      return fault !== 'ceo-authority-revoked';
    };
    let revoked = false;
    const lifecycle = require(process.cwd() + '/lib/dabra/successful-task-lifecycle');
    const deps: Record<string, unknown> = {
      'server-only': {},
      '../supabase/server': { getSupabaseAdminHostname: () => 'synthetic-core', supabaseAdmin: { rpc: (_name: string, p: Record<string, unknown>) => ({ abortSignal: async () => {
        if (_name === 'reserve_dabra_production_task') {
          storedExpiry = p.p_input_valid_until_ms; assert.equal(storedExpiry, originalExpiry);
          return { error: null, data: { decision: 'admitted' } };
        }
        if (fault === 'operations-eg-during-read' && f.context.taskAuthority?.kind === 'operator') f.context.taskAuthority.country = 'EG';
        if (fault === 'trip-added-during-read') input.continuityBinding = { revision: 2, generation: 0 };
        if (fault === 'fx-expired-during-read') { clock = originalExpiry + 1; revoked = typeof storedExpiry === 'number' && storedExpiry <= clock; }
        reads++; assert.equal(p.p_confirm_read, true);
        if (fault === 'consent-expired') Object.assign(c.result.decisions.consent, { expiresAtMs: Date.now() - 1 });
        return { error: null, data: revoked ? null : { state: 'succeeded', answer: 'saved', language: 'en', expiresAtMs: Date.now() + (fault === 'answer-expired' ? -1 : 60000) } };
      } }) } },
      './credential-binding': { isCredentialBindingCoreProject: () => true },
      './successful-task-lifecycle': { ...lifecycle, createSuccessfulTaskLifecycle: (deps: { rpc: FundingRpc }) => async () => {
        if (fault === 'fx-expired-during-read') await deps.rpc('reserve_dabra_successful_task', { p_actor_id: c.result.actorId }, new AbortController().signal);
        return { kind: 'answer', answer: 'saved', language: 'en', saved: true, replay: true };
      } },
    };
    const exported: { runSuccessfulTaskProduction?: typeof runSuccessfulTaskProduction } = {};
    const compiled = ts.transpileModule(readFileSync('lib/dabra/successful-task-production-runtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports: exported, require: (id: string) => Object.hasOwn(deps, id) ? deps[id] : require(process.cwd() + '/lib/dabra/' + id), Response, JSON, Object, structuredClone, Date: Clock });
    assert.ok(exported.runSuccessfulTaskProduction);
    const response = await exported.runSuccessfulTaskProduction(new NextRequest('https://example.test/api/ai2/chat'),
      { resolveInput: async () => input, requestId: randomUUID(), stream: false }, decisionReferences, c.result, terms);
    assert.equal(response.status, ['none', 'ceo'].includes(fault) ? 200 : 503);
    assert.equal(reads, ['callback-replaced', 'context-replaced', 'impostor-ceo', 'ceo-authority-revoked', 'trip-blocked', 'operations-eg-blocked'].includes(fault) ? 0 : 1);
    assert.equal(f.stats().models, 0); assert.equal(f.stats().claims, 0);
  } finally { restore(); }
});

for (const fault of ['trip-switch-off', 'trip-switch-on', 'unbound-switch-off', 'trip-expired-before-proof', 'owner', 'foreign', 'revoked', 'fx-expired', 'answer-expired', 'context-changed', 'extra-identity', 'disabled', 'failed-before-proof', 'get', 'navigation', 'prefetch', 'missing-origin', 'cross-origin', 'bad-content-type', 'bad-json', 'oversized']) test(`production UUID POST: ${fault}`, async () => {
 const restore=syntheticProviderEnvironment();
 try {
  const f=successfulTaskRuntimeFixture(),c=coreDecisionFixture();
  f.context.taskAuthority={kind:'customer',actorId:c.result.actorId,ownerId:c.result.actorId};
  executableDocuments(c,f.proof.grantId);
  let reads=0,contexts=0,synthetic=0;
  const policyModule=require(process.cwd()+'/lib/dabra/successful-task-production-policy');
  const dependencies:Record<string,unknown>={
   'server-only':{},
   './successful-task-production-policy':{...policyModule,readSuccessfulTaskProductionPolicy:()=>fault==='disabled'?null:decisionReferences},
   './successful-task-core-decisions':{resolveSuccessfulTaskCoreDecisions:c.resolve},
   './agent-context':{resolveAgentContext:async()=>{contexts++;return f.context;}},
   './credential-binding':{isCredentialBindingCoreProject:()=>true},
   '../supabase/server':{getSupabaseAdminHostname:()=> 'core',supabaseAdmin:{rpc:(name:string,p:Record<string,unknown>)=>({abortSignal:async()=>{
    reads++;assert.equal(name,'retrieve_dabra_production_task');assert.equal(p.p_actor_id,c.result.actorId);
    assert.equal(Object.hasOwn(p,'p_input_digest'),false);assert.equal(Object.hasOwn(p,'p_input_valid_until_ms'),false);
    assert.equal(p.p_continuity_enabled,fault==='trip-switch-on');
    if(fault==='trip-switch-off')return {error:null,data:null};
    if(fault==='trip-expired-before-proof')return {error:null,data:{state:'failed',answer:null,language:null,tripValidUntilMs:Date.now()-1}};
    if(fault==='context-changed')f.context.isTaskAuthorityCurrent=async()=>true;
    return {error:null,data:fault==='revoked'?null:fault==='foreign'?{state:'absent'}:fault==='failed-before-proof'?{state:'failed',answer:null,language:null,expiresAtMs:null,inputValidUntilMs:Date.now()-1}:{state:'succeeded',answer:'SYNTHETIC saved',language:'en',tripValidUntilMs:fault==='trip-switch-on'?Date.now()+60000:null,expiresAtMs:Date.now()+(fault==='answer-expired'?-1:60000),inputValidUntilMs:Date.now()+(fault==='fx-expired'?-1:60000)}};
   }})}},
  };
  const exported:{successfulTaskProductionReplay?:typeof import('../lib/dabra/successful-task-production-replay').successfulTaskProductionReplay}={};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/dabra/successful-task-production-replay.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
   {exports:exported,require:(id:string)=>Object.hasOwn(dependencies,id)?dependencies[id]:require(process.cwd()+'/lib/dabra/'+id),Response,JSON,Object,structuredClone,TextDecoder,process:{env:{DABRA_CONTINUITY_ENABLED:fault==='trip-switch-on'?'true':'false'}}});
  const route:{GET?:(request:NextRequest)=>Promise<Response>;POST?:(request:NextRequest)=>Promise<Response>}={};
  vm.runInNewContext(ts.transpileModule(readFileSync('app/api/dabra/tasks/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
   {exports:route,Response,require:(id:string)=>id==='next/server'?{NextRequest}:id==='@/lib/dabra/successful-task-production-policy'?dependencies['./successful-task-production-policy']:id==='@/lib/dabra/successful-task-production-replay'?exported:id==='@/lib/dabra/successful-task-replay'?{successfulTaskReplayResponse:()=>{synthetic++;return Response.json({enabled:false},{status:503,headers:{'Cache-Control':'private, no-store'}});}}:(()=>{throw new Error('Unexpected route dependency '+id);})()});
  assert.ok(route.GET);assert.ok(route.POST);
  const get=['get','navigation','prefetch'].includes(fault);
  const headers:Record<string,string>={'origin':fault==='cross-origin'?'https://other.test':'https://example.test','content-type':fault==='bad-content-type'?'text/plain':'application/json'};
  if(fault==='missing-origin')delete headers.origin;
  if(fault==='navigation')headers['sec-fetch-mode']='navigate';
  if(fault==='prefetch')headers.purpose='prefetch';
  const body=fault==='bad-json'?'not-json':fault==='oversized'?' '.repeat(300):JSON.stringify({requestId:randomUUID(),...(fault==='extra-identity'?{actorId:'other'}:{})});
  const request=new NextRequest('https://example.test/api/dabra/tasks',{method:get?'GET':'POST',headers,...(get?{}:{body})});
  const response=await (get?route.GET(request):route.POST(request));
  const expected=get?405:['owner','trip-switch-on','unbound-switch-off'].includes(fault)?200:fault==='foreign'?404:['fx-expired','answer-expired'].includes(fault)?410:['failed-before-proof','trip-expired-before-proof'].includes(fault)?409:['extra-identity','bad-json'].includes(fault)?400:['missing-origin','cross-origin','bad-content-type'].includes(fault)?403:fault==='oversized'?413:503;
  assert.equal(response.status,expected);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  const blocked=get||['extra-identity','disabled','missing-origin','cross-origin','bad-content-type','bad-json','oversized'].includes(fault);
  assert.equal(reads,blocked?0:1);if(blocked)assert.equal(contexts,0);
  assert.equal(synthetic,fault==='disabled'?1:0);
  if(['failed-before-proof','trip-expired-before-proof'].includes(fault))assert.deepEqual(await response.json(),{saved:false,state:'failed'});
  if(fault==='owner')assert.deepEqual(await response.json(),{answer:'SYNTHETIC saved',language:'en',saved:true,replay:true});
  assert.equal(f.stats().models,0);assert.equal(f.stats().claims,0);
 } finally {restore();}
});

test('production UUID body deadline cancels real stream and releases reader without awaiting cancel', async () => {
 for(const mode of ['deadline','request-abort'] as const){
  let cancels=0,pulls=0,core=0;
  const stream=new ReadableStream<Uint8Array>({
   start(controller){controller.enqueue(new TextEncoder().encode('{"requestId":'));},
   pull(){pulls++;return new Promise<void>(()=>{});},
   cancel(){cancels++;return mode==='deadline'?new Promise<void>(()=>{}):Promise.reject(new Error('synthetic cancel rejection'));},
  });
  const controller=new AbortController();
  const init={method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:stream,signal:controller.signal,duplex:'half' as const};
  const request=new NextRequest('https://example.test/api/dabra/tasks',init);
  const policy=require(process.cwd()+'/lib/dabra/successful-task-production-policy');
  const dependencies:Record<string,unknown>={
   'server-only':{},'./successful-task-production-policy':{...policy,readSuccessfulTaskProductionPolicy:()=>decisionReferences},
   './successful-task-core-decisions':{resolveSuccessfulTaskCoreDecisions:async()=>{core++;throw new Error('No Core before complete body');}},
   './agent-context':{resolveAgentContext:async()=>{throw new Error('No context read');}},
   '../supabase/server':{supabaseAdmin:{rpc:()=>{core++;throw new Error('No RPC');}}},
  };
  const exported:{successfulTaskProductionReplay?:typeof import('../lib/dabra/successful-task-production-replay').successfulTaskProductionReplay}={};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/dabra/successful-task-production-replay.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
   {exports:exported,require:(id:string)=>Object.hasOwn(dependencies,id)?dependencies[id]:require(process.cwd()+'/lib/dabra/'+id),Response,JSON,Object,structuredClone,TextDecoder});
  assert.ok(exported.successfulTaskProductionReplay);
  const keepAlive=setTimeout(()=>{},1800),start=Date.now();
  try {
   const pending=exported.successfulTaskProductionReplay(request);
   if(mode==='request-abort')controller.abort();
   const response=await pending;
   assert.equal(response.status,503);assert.ok(Date.now()-start<1600);
   await new Promise(resolve=>setTimeout(resolve,20));
   assert.equal(cancels,1);assert.equal(stream.locked,false);assert.equal(core,0);
   const before=pulls;controller.abort();await new Promise(resolve=>setTimeout(resolve,20));
   assert.equal(pulls,before);assert.equal(cancels,1);assert.equal(core,0);
  } finally {clearTimeout(keepAlive);}
 }
});

test('production consent actual owner route sequence selects actor policy and revokes with gate absent', async () => {
 const restore=syntheticProviderEnvironment();
 try {
  const actor='11111111-1111-4111-8111-111111111111',program={schema:'dabra-successful-task-program-v1',revision:'synthetic-revision'};
  let configured:unknown=program,granted=false,generation=0,content=false,proofWrites=0,foreign=false;
  const calls:string[]=[];const receipts=new Map<string,{state:string;generation:number}>();
  const notice={noticeVersion:'synthetic-notice',noticeSha256:'a'.repeat(64),text:'SYNTHETIC approved notice only',expiresAtMs:Date.now()+60000};
  const client={auth:{getUser:async()=>({error:null,data:{user:{id:foreign?'other':actor}}})}};
  const server={createSupabaseRequestClient:async()=>({user:{id:actor},supabase:client}),getSupabaseClientHostname:()=> 'core',getSupabaseAdminHostname:()=> 'core',supabaseAdmin:{rpc:(name:string,p:Record<string,unknown>)=>({abortSignal:async()=>{
   calls.push(name+':'+(p.p_action??''));assert.equal(p.p_actor_id,actor);assert.equal(p.p_actor_role,'customer');
   if(name==='select_dabra_production_task_policy')return {error:null,data:granted?{...decisionReferences,revision:program.revision}:null};
   assert.equal(name,'dabra_task_consent');
   if(p.p_action==='status')return {error:null,data:{generation,granted,hasConsent:granted,hasContent:content}};
   if(p.p_action==='notice')return {error:null,data:{...notice,generation}};
   const prior=receipts.get(String(p.p_mutation));if(prior)return {error:null,data:prior.state==='revoked'||prior.generation===generation?prior:null};
   if(p.p_generation!==generation)return {error:null,data:null};
   generation++;
   if(p.p_action==='grant') {assert.equal(p.p_notice_sha256,notice.noticeSha256);granted=true;proofWrites++;}
   else {assert.equal(p.p_action,'revoke');granted=false;content=false;}
   const receipt={state:granted?'granted':'revoked',generation};receipts.set(String(p.p_mutation),receipt);return {error:null,data:receipt};
  }})}};
  const deps:Record<string,unknown>={'server-only':{},'../supabase/server':server,'../auth/identity':{resolveCanonicalActiveProfile:async()=>({id:actor,role:'customer',sourceRole:'customer'})},'./credential-binding':{isCredentialBindingCoreProject:()=>true}};
  const compile=(file:string,extra:Record<string,unknown>={})=>{const exported:Record<string,unknown>={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
   {exports:exported,require:(id:string)=>Object.hasOwn(extra,id)?extra[id]:Object.hasOwn(deps,id)?deps[id]:require(process.cwd()+'/lib/dabra/'+id),Response,TextDecoder,AbortSignal,structuredClone,Date,JSON,Object,Promise,Set});return exported;};
  const owner=compile('lib/dabra/successful-task-owner.ts');
  const policy=require(process.cwd()+'/lib/dabra/successful-task-production-policy');
  const policySource={...policy,readSuccessfulTaskProductionPolicy:()=>configured};
  const consent=compile('lib/dabra/successful-task-consent.ts',{'./successful-task-owner':owner,'./successful-task-production-policy':policySource});
  const route=compile('app/api/dabra/tasks/consent/route.ts',{'@/lib/dabra/successful-task-consent':consent}) as {GET:(r:NextRequest)=>Promise<Response>;POST:(r:NextRequest)=>Promise<Response>};
  const req=(body?:unknown,origin='https://example.test')=>new NextRequest('https://example.test/api/dabra/tasks/consent',body===undefined?{}:{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  const wrongOwner=await route.POST(req({action:'revoke',expectedOwner:'22222222-2222-4222-8222-222222222222',mutationId:randomUUID(),generation:0}));assert.equal(wrongOwner.status,503);assert.equal(calls.length,0,'owner equality rejects before Core mutation');
  const shown=await (await route.GET(req())).json();assert.equal(shown.notice.text,notice.text);assert.equal(proofWrites,0);
  const grant={action:'grant',expectedOwner:actor,generation:0,noticeVersion:notice.noticeVersion,noticeSha256:notice.noticeSha256,mutationId:randomUUID()};
  const before=calls.length;assert.equal((await route.POST(req({...grant,actorId:'other'}))).status,400);assert.equal((await route.POST(req(grant,'https://other.test'))).status,403);assert.equal(calls.length,before);
  assert.equal((await route.POST(req(grant))).status,200);assert.equal((await route.POST(req(grant))).status,200);assert.equal(proofWrites,1);
  const core=compile('lib/dabra/successful-task-core-decisions.ts',{'./successful-task-owner':owner,'./successful-task-production-policy':policySource,'../auth/team-access':{CEO_USER_ID}}) as {selectSuccessfulTaskPolicy:(r:NextRequest,v:string)=>Promise<unknown>};
  assert.equal((await core.selectSuccessfulTaskPolicy(req(),program.revision) as {revision:string}).revision,program.revision);
  const c=coreDecisionFixture(actor),f=successfulTaskRuntimeFixture();c.result.revision=program.revision;executableDocuments(c,f.proof.grantId);
  const gateModule=compile('lib/dabra/successful-task-production-policy.ts',{'./successful-task-core-decisions':{...core,resolveSuccessfulTaskCoreDecisions:async()=>c.result}}) as {successfulTaskProductionGate:typeof successfulTaskProductionGate};
  let dispatched=0;
  const gateResponse=await gateModule.successfulTaskProductionGate(program,req(),undefined,{resolveInput:async()=>{throw new Error('No model input in consent gate test');},requestId:randomUUID(),stream:false},async(_request,_input,selected)=>{dispatched++;assert.equal(selected.revision,program.revision);return Response.json({selected:true});});
  assert.equal(gateResponse?.status,200);assert.equal(dispatched,1);
  content=true;configured=null;
  const withdrawal={action:'revoke',expectedOwner:actor,mutationId:randomUUID(),generation:1};
  assert.equal((await route.POST(req(withdrawal))).status,200);assert.equal(content,false);assert.equal(granted,false);assert.equal(proofWrites,1);
  assert.equal((await route.POST(req(withdrawal))).status,200);assert.equal(generation,2);
  const absent=await (await route.GET(req())).json();assert.equal(absent.notice,null);
  assert.equal((await route.POST(req(grant))).status,503);assert.equal(await core.selectSuccessfulTaskPolicy(req(),program.revision),null);
  configured=program;assert.equal((await route.POST(req({...grant,generation:2,mutationId:randomUUID()}))).status,200);
  content=true;assert.equal((await route.POST(req(withdrawal))).status,200);assert.equal(granted,true);assert.equal(content,true);assert.equal(generation,3);
  foreign=true;assert.equal((await route.GET(req())).status,503);
 } finally {restore();}
});

test('consent component pins SSR owner and discards late responses after focus reset', async () => {
 type Node = {type:unknown;props:Record<string,unknown>};
 const states:unknown[]=[],refs:Array<{current:unknown}>=[];let si=0,ri=0,effect:(()=>void)|undefined;
 const events=new Map<string,()=>void>();const requests:Array<{resolve:(v:unknown)=>void;init:RequestInit}>=[];
 const react={useState:(initial:unknown)=>{const i=si++;if(!(i in states))states[i]=initial;return [states[i],(v:unknown)=>{states[i]=v;}];},useRef:(initial:unknown)=>{const i=ri++;return refs[i]??=( {current:initial});},useEffect:(fn:()=>()=>void)=>{effect??=fn();}};
 const jsx=(type:unknown,props:Record<string,unknown>):Node=>({type,props});
 const exported:{SuccessfulTaskConsent?:(p:{ar:boolean;ownerId:string})=>Node}={};
 vm.runInNewContext(ts.transpileModule(readFileSync('components/dabra/SuccessfulTaskConsent.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:exported,require:(id:string)=>id==='react'?react:{jsx,jsxs:jsx},window:{addEventListener:(e:string,f:()=>void)=>events.set(e,f),removeEventListener:()=>{}},document:{addEventListener:(e:string,f:()=>void)=>events.set(e,f),removeEventListener:()=>{}},fetch:(_url:string,init:RequestInit)=>new Promise(resolve=>requests.push({resolve,init})),AbortSignal,AbortController,crypto:{randomUUID},Date});
 assert.ok(exported.SuccessfulTaskConsent);
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const render=()=>{si=0;ri=0;return exported.SuccessfulTaskConsent!({ar:false,ownerId:owner});};
 const buttons=(v:unknown):Node[]=>{if(!v||typeof v!=='object')return [];if(Array.isArray(v))return v.flatMap(buttons);const n=v as Node;return [...(n.type==='button'?[n]:[]),...buttons(n.props?.children)];};
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 let view=render();(buttons(view)[0].props.onClick as ()=>void)();assert.equal(requests.length,1);
 events.get('focus')!();requests[0].resolve({ok:true,json:async()=>({ownerId:owner,generation:1,granted:true,hasConsent:true,hasContent:true,notice:null})});await tick();
 assert.equal(states[0],null,'late old-account response cannot restore cleared state');
 view=render();(buttons(view)[0].props.onClick as ()=>void)();requests[1].resolve({ok:true,json:async()=>({ownerId:other,generation:1,granted:true,hasConsent:true,hasContent:true,notice:null})});await tick();
 assert.equal(states[0],null,'new session owner cannot replace SSR page owner');assert.equal(buttons(render()).length,1);assert.equal(requests.filter(r=>r.init.method==='POST').length,0);
 view=render();(buttons(view)[0].props.onClick as ()=>void)();requests[2].resolve({ok:true,json:async()=>({ownerId:owner,generation:1,granted:true,hasConsent:true,hasContent:true,notice:null})});await tick();
 view=render();(buttons(view)[1].props.onClick as ()=>void)();assert.equal(JSON.parse(String(requests[3].init.body)).expectedOwner,owner);
 events.get('visibilitychange')!();requests[3].resolve({ok:true});await tick();assert.equal(states[0],null);assert.equal(requests.length,4,'invalidated POST completion cannot start a new load');effect?.();
 assert.match(readFileSync('app/my-account/page.tsx','utf8'),/ownerId=\{user\.id\}/);
 assert.match(readFileSync('components/account/MyAccountContent.tsx','utf8'),/<SuccessfulTaskConsent key=\{ownerId\} ownerId=\{ownerId\}/);
});


test('consent effective revision preserves JSON string type for numeric-looking program versions', () => {
 const c=coreDecisionFixture();const docs=executableDocuments(c,'22222222-2222-4222-8222-222222222222');
 c.result.revision='123';Object.assign(docs.audience,{revision:'123'});Object.assign(docs.consent,{revision:'123'});
 assert.ok(interpretSuccessfulTaskDecisions(c.result),'string revision matches');
 Object.assign(docs.consent,{revision:123});assert.equal(interpretSuccessfulTaskDecisions(c.result),null,'number is not the program string');
 const sql=readFileSync('supabase/migrations/20261112110000_task237_consent_capture.sql','utf8');
 const helper=sql.slice(sql.indexOf('CREATE FUNCTION private.dabra_task_consent_effective'),sql.indexOf('REVOKE ALL ON FUNCTION private.dabra_task_consent_effective'));
 const exact=(source:string)=>source.includes("d.document->'revision'=to_jsonb(p_revision)")&&!source.includes("d.document->>'revision'=p_revision");
 assert.ok(exact(helper));assert.equal(exact(helper.replace("d.document->'revision'=to_jsonb(p_revision)","d.document->>'revision'=p_revision")),false,'negative source mutation catches coercion regression');
});


test('content erasure source binds exact old trip and only stored expiry with bounded purge', () => {
 const sql=readFileSync('supabase/migrations/20261112120000_task237_content_erasure.sql','utf8');
 const shared=readFileSync('supabase/migrations/20261112110000_task237_consent_capture.sql','utf8');
 assert.match(sql,/Required Task187 contract is absent/);assert.doesNotMatch(sql,/CREATE TABLE public\.dabra_|INSERT INTO public\.dabra_|cron\./i);
 assert.match(sql,/AFTER UPDATE OR DELETE ON public\.dabra_account_continuity/);
 const trigger=sql.slice(sql.indexOf('CREATE FUNCTION private.dabra_task_continuity_erasure'),sql.indexOf('CREATE TRIGGER'));
 const bound=(source:string)=>source.includes('actor_id=OLD.owner_id')&&source.includes('continuity_binding=original')&&source.includes('IF ids IS NOT NULL THEN PERFORM private.dabra_task_remove_content(OLD.owner_id,ids)');
 assert.ok(bound(trigger));assert.equal(bound(trigger.replace('continuity_binding=original','true')),false);
 assert.match(trigger,/ERRCODE='55P03'/);assert.doesNotMatch(trigger,/EXCEPTION WHEN/);
 const purge=sql.slice(sql.indexOf('CREATE FUNCTION public.purge_dabra_production_task_content'));
 assert.match(purge,/p_limit NOT BETWEEN 1 AND 100/);assert.match(purge,/LIMIT p_limit FOR UPDATE OF t NOWAIT/);
 for(const fragment of ['t.input_valid_until_ms<=n',"t.continuity_binding->'tripExpiresAtMs'",'a.expires_at_ms<=n',"d.value->'expiresAtMs'"])assert.ok(purge.includes(fragment));
 assert.doesNotMatch(purge,/dabra_task_continuity_current|resolve_dabra|EXCEPTION WHEN/);
 assert.match(shared,/PERFORM private\.dabra_task_remove_content\(p_actor_id\)/);
 const erasure=shared.slice(shared.indexOf('CREATE FUNCTION private.dabra_task_remove_content'),shared.indexOf('CREATE FUNCTION public.dabra_task_consent'));
 assert.match(erasure,/content_removed_at_ms=n,input_digest=NULL,answer_digest=NULL/);
 assert.doesNotMatch(erasure,/UPDATE private\.dabra_.*admissions|DELETE FROM private\.dabra_production_tasks|UPDATE private\.dabra_successful_task_decisions/);
});


test('consent CASE comparisons are delimited and protected fixture pins historical dependency before erasure', () => {
 const sql=readFileSync('supabase/migrations/20261112110000_task237_consent_capture.sql','utf8');
 assert.equal((sql.match(/count_rows<>\(CASE WHEN p_actor=/g)??[]).length,2);
 assert.match(sql,/d\.approved_by<>\(CASE WHEN k='consent'[\s\S]*?::uuid END\)/);
 assert.doesNotMatch(sql,/(?:count_rows|d\.approved_by)<>CASE/);
 const loader=readFileSync('scripts/test-protected-operations-postgresql.mjs','utf8');
 const loop=loader.slice(loader.indexOf('  for (const file of files.filter'),loader.indexOf('  // Fixtures are inserted'));
 const names=['priceRelease','migration','managedDrive','managedDriveModelYear','managedDriveAcceptance','managedDriveSeptember','managedDriveWhatsApp','managedDriveKapso','managedDriveCustomer','managedDriveTarget','boundedDriveWhatsApp','queryDriveWhatsApp','boundedCustomerWhatsApp','currentStateWhatsApp','continuousWhatsApp','currentStateResume','workerBinding','workerBindingFingerprint'];
 const consent='20261112110000_task237_consent_capture.sql',erasure='20261112120000_task237_content_erasure.sql';
 const historical=readFileSync('supabase/drafts/task187-continuity.sql','utf8');
 const run=(tamper:boolean)=>{const applied:string[]=[];const execute=()=>vm.runInNewContext(loop,{...Object.fromEntries(names.map(n=>[n,'excluded'])),files:[consent,erasure],assert,createHash,read:(path:string)=>path==='supabase/drafts/task187-continuity.sql'?historical+(tamper?'-- changed':''):path,sql:(value:string)=>applied.push(value)});return {execute,applied};};
 const good=run(false);good.execute();assert.deepEqual(good.applied,[`supabase/migrations/${consent}`,historical,`supabase/migrations/${erasure}`]);
 const bad=run(true);assert.throws(bad.execute);assert.deepEqual(bad.applied,[`supabase/migrations/${consent}`],'changed historical bytes never reach fixture SQL');
});
