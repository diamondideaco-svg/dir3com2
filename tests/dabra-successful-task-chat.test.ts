import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { successfulTaskChatResponse } from '../lib/dabra/successful-task-chat';
import { successfulTaskInputDigest } from '../lib/dabra/successful-task-development';
import { DEFAULT_AGENT_DIALOGUE_POLICY } from '../lib/dabra/agent-dialogue';
import { consumeDabraChatResponse, approvedAssistantAnswer } from '../lib/dabra/chat-response-contract';
import { ConversationSession } from '../lib/dabra/conversation-session';
import type { FundingRpc } from '../lib/dabra/dialogue-funding-store';
import type { FxSnapshot } from '../lib/currency/display';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import { successfulTaskRuntimeFixture, syntheticProviderEnvironment } from './fixtures/task237-runtime-synthetic';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
const require = createRequire(import.meta.url);
/** Execute the actual unchanged POST source, substituting explicit synthetic IO
 * at module boundaries. There is no registration hook in the deployed handler.
 */
function fixture(options: { inject?: boolean; fault?: string; trip?: SavedTrip; revokeDuringAllowance?: boolean;
  snapshot?: () => FxSnapshot | null; beforePolicy?: () => void; beforeTaskRead?: () => void; beforeAuthority?: () => void; hangAfterSaveAt?: number; hangAllowance?: boolean } = {}) {
  const f = successfulTaskRuntimeFixture('customer', options.fault === 'denied' ? 'denied' : '');
  let row: Record<string, unknown> | null = null, legacyReads = 0, rpcReads = 0;
  let continuityCurrent = true;
  const inputs: Input[] = [];
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
        accountHeldCostMicros: f.stats().holds.reduce((n, h) => n + h.cost, 0), totalHeldCostMicros: f.stats().holds.reduce((n, h) => n + h.cost, 0) } };
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
    '@/lib/dabra/successful-task-chat': { successfulTaskChatResponse: (resolve: () => Promise<Input>, id: string | undefined, signal: AbortSignal, stream: boolean) =>
      successfulTaskChatResponse(async () => { const input = await resolve(); inputs.push(input); return input; }, id, signal, stream,
        options.inject === false ? undefined : { dataScope: 'synthetic-only', rpc }) },
    '@/lib/dabra/agent-context': { resolveAgentContext: async () => f.context },
    '@/lib/dabra/continuity-chat-server': { resolveContinuityChatTrip: async () => continuityCurrent ? options.trip ?? null : null },
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
  return { f, post, postTransport, inputs, stats: () => ({ legacyReads, rpcReads }), revokeTrip: () => { continuityCurrent = false; } };
}

for (const locale of ['ar', 'en'] as const) for (const stream of [false, true]) test(`actual POST saves and explicitly replays one ${locale} ${stream ? 'stream' : 'JSON'} request`, async () => {
  const restore = syntheticProviderEnvironment();
  try {
    const x = fixture();
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
    const answer = await consumeDabraChatResponse(first, () => {});
    assert.ok(answer.length > 0);
    const second = await x.post(body);
    assert.equal(second.status, 200);
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
    assert.equal(response.status, 200); assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
    assert.equal(x.inputs.length, 0); assert.equal(x.stats().rpcReads, 0); assert.equal(x.stats().legacyReads, 1);
    assert.equal(x.f.stats().models, 0);
  } finally { if (prior === undefined) delete process.env.DABRA_SUCCESSFUL_TASK_ENABLED; else process.env.DABRA_SUCCESSFUL_TASK_ENABLED = prior; restore(); }
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


for (const hang of ['runner-identity', 'delivery-identity', 'allowance']) test(`post-save ${hang} has a finite deadline and never redispatches`, async () => {
  const restore = syntheticProviderEnvironment(); const keepAlive = setTimeout(() => {}, 2500);
  try {
    const x = fixture({ hangAfterSaveAt: hang === 'runner-identity' ? 1 : hang === 'delivery-identity' ? 2 : undefined, hangAllowance: hang === 'allowance' });
    const started = Date.now();
    const response = await x.post({ message: 'hotel in Cairo', locale: 'en' });
    assert.equal(response.status, 503); assert.ok(Date.now() - started < 1800);
    assert.equal((await response.json()).saved, false);
    assert.equal(response.headers.get('X-DABRA-Successful-Task-Allowance'), null);
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
