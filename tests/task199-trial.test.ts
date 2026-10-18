import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/admin/task199-trial';
import type * as KapsoSubject from '../lib/notifications/kapso-drive-whatsapp';

const kapsoExports = {};
runInNewContext(ts.transpileModule(readFileSync('lib/notifications/kapso-drive-whatsapp.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: kapsoExports, URL,
  require(name: string) {
    if (name === 'server-only' || name === './drive-whatsapp') return {};
    if (name === 'node:crypto') return crypto;
    throw new Error('Unexpected dependency: ' + name);
  },
});
const realKapso = kapsoExports as typeof KapsoSubject;

function fixture(configUnavailable = false, useRealConfig = false) {
  let allowed = true;
  let current = Date.parse('2026-10-16T21:00:00Z');
  let value: string | undefined;
  let cookieExpires: Date | undefined;
  let opening = false;
  let state = 'accepted';
  let responseStatus = 200;
  let reply: unknown = { result: 'accepted' };
  let rows: unknown;
  let deliveryError = false;
  let stopError = false;
  let sends = 0;
  let queries = 0;
  const calls: { kind: string; body: unknown; authorization?: string | null }[] = [];
  const secret = 'SYNTHETIC-WORKER-NOT-A-REAL-KEY-'.repeat(2);
  const windowId = '11111111-1111-4111-8111-111111111111';
  const env: Record<string, string | undefined> = {
    VERCEL_ENV: 'production', DIR3COM_WHATSAPP_WORKER_SECRET: secret,
    DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only', DIR3COM_WHATSAPP_CATEGORIES: 'operations.created',
  };
  const exports = {};
  const config = { deliveryMode: 'provider_query', phoneNumberId: '1205896545944230',
    siteUrl: 'https://dir3com.com', templates: { 'operations.created.ar': { name: 'dir3com_operations_created_ar', languageCode: 'ar' } } };
  const record = async (kind: string, request: Request) => {
    calls.push({ kind, body: await request.json(), authorization: request.headers.get('authorization') });
  };
  runInNewContext(ts.transpileModule(readFileSync('lib/admin/task199-trial.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Request, Response, Date, Buffer,
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name.endsWith('/drive-whatsapp')) return { secureEqual: (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)) };
      if (name.endsWith('/kapso-drive-whatsapp')) return {
        kapsoConfig: (env: Record<string, string | undefined>, rejected?: (code: KapsoSubject.KapsoConfigRejection) => void) =>
          useRealConfig ? realKapso.kapsoConfig(env, rejected) : configUnavailable ? null : config,
        handleKapsoTargetDispatch: async (request: Request) => {
          await record('dispatch', request);
          if (sends === 0) sends++;
          return Response.json(reply, { status: responseStatus });
        },
        handleKapsoStop: async (request: Request) => {
          await record('stop', request);
          return Response.json(stopError ? { error: 'STOP_UNCONFIRMED' } : { result: { window_id: windowId } }, { status: stopError ? 503 : 200 });
        },
      };
      if (name.endsWith('/kapso-provider-query')) return { handleKapsoTargetReconcile: async (request: Request) => {
        await record('query', request); queries++;
        return Response.json({ result: 'recorded', messageId: 'wamid.PRIVATE_SYNTHETIC_DO_NOT_SERIALIZE', state: 'delivered' });
      } };
      throw new Error('Unmocked dependency: ' + name);
    },
  });
  const api = exports as typeof Subject;
  const ctx: Subject.TrialContext = {
    authorize: async () => allowed, env, hostname: api.TRIAL.hostname,
    store: { rpc: async (name, args) => {
      calls.push({ kind: name, body: args });
      if (opening) return { data: null, error: { code: 'ALREADY_ASSIGNED' } };
      opening = true; return { data: windowId, error: null };
    } },
    readTicket: () => value,
    writeTicket: (v, expires) => { value = v; cookieExpires = expires; }, clearTicket: () => { value = undefined; },
    readDelivery: async () => {
      if (deliveryError) throw new Error('SYNTHETIC-PRIVATE-ERROR');
      return rows ?? [{ audience: 'operations', attempts: 1, state }];
    }, now: () => current,
  };
  const run = (op: unknown = 'start', origin: string | null = api.TRIAL.origin) => api.runTask199Trial(op, origin, ctx);
  return { api, ctx, calls, run, env, secret, config, sends: () => sends, queries: () => queries,
    allow: (v: boolean) => { allowed = v; }, time: (v: number) => { current = v; },
    ticket: () => value, cookieExpires: () => cookieExpires, setTicket: (v: string | undefined) => { value = v; },
    state: (v: string) => { state = v; }, rows: (v: unknown) => { rows = v; },
    reply: (v: unknown, status = 200) => { reply = v; responseStatus = status; },
    deliveryError: () => { deliveryError = true; }, stopError: () => { stopError = true; },
  };
}

test('strict same-origin and fresh CEO authorization precede any privilege or provider use', async () => {
  const f = fixture();
  for (const origin of [null, 'null', 'https://evil.invalid', 'https://dir3com.com', 'https://www.dir3com.com.evil.invalid']) {
    assert.equal((await f.run('start', origin)).code, 'ORIGIN_REJECTED');
  }
  f.allow(false);
  for (const op of ['start', 'dispatch', 'reconcile', 'stop']) assert.equal((await f.run(op)).code, 'FORBIDDEN');
  assert.equal(f.calls.length, 0); assert.equal(f.ticket(), undefined);
});
test('unknown operation, runtime, database binding, mode, sender and template fail closed', async () => {
  const unknown = fixture(); assert.equal((await unknown.run({ requestId: 'attacker' })).code, 'INVALID_OPERATION');
  for (const patch of [{ VERCEL_ENV: 'preview' }, { DIR3COM_WHATSAPP_WORKER_SECRET: '' },
    { DIR3COM_WHATSAPP_DISPATCH_MODE: 'general' }, { DIR3COM_WHATSAPP_CATEGORIES: 'operations.created,customer.created' }]) {
    const f = fixture(); Object.assign(f.env, patch); assert.notEqual((await f.run()).code, 'WINDOW_OPEN'); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.ctx.hostname = 'wrong.supabase.co'; assert.equal((await f.run()).code, 'RUNTIME_REJECTED');
  for (const part of ['phoneNumberId', 'siteUrl'] as const) {
    const f = fixture(); f.config[part] = 'wrong'; assert.equal((await f.run()).code, part === 'phoneNumberId' ? 'KAPSO_TRIAL_SENDER_MISMATCH' : 'KAPSO_TRIAL_SITE_MISMATCH');
  }
  const template = fixture(); template.config.templates['operations.created.ar'].name = 'another_template';
  assert.equal((await template.run()).code, 'KAPSO_TRIAL_TEMPLATE_MISMATCH');
});
test('start binds the immutable tuple to one existing window RPC and sends nothing', async () => {
  const f = fixture(); assert.equal((await f.run()).code, 'WINDOW_OPEN');
  const call = f.calls[0]; assert.equal(call.kind, 'open_kapso_drive_whatsapp_provider_query_window');
  assert.deepEqual(JSON.parse(JSON.stringify(call.body)), {
    p_request_id: f.api.TRIAL.requestId, p_outbox_id: f.api.TRIAL.outboxId, p_recipient_user_id: f.api.TRIAL.recipientUserId,
    p_category: 'operations.created', p_language: 'ar', p_phone_number_id: f.api.TRIAL.sender,
    p_approval_reference: 'Task199-20261018-1830', p_expires_at: '2026-10-16T21:09:00.000Z',
  });
  assert.equal(f.sends(), 0); assert.ok(f.ticket()); assert.ok(!f.ticket()!.includes(f.secret));
  assert.equal((await f.run()).code, 'WINDOW_ALREADY_ASSIGNED'); assert.equal(f.calls.length, 1);
});
test('forged, missing, and tampered window tickets cannot select a target or reach a worker', async () => {
  const f = fixture(); assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
  await f.run(); const valid = f.ticket()!; f.setTicket(valid.replace('11111111', '22222222'));
  assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
  f.setTicket(valid + '.extra'); assert.equal((await f.run('stop')).code, 'NO_WINDOW');
  assert.equal(f.sends(), 0); assert.equal(f.calls.length, 1);
});
test('dispatch invokes the existing authenticated target handler internally without exposing the credential', async () => {
  const f = fixture(); await f.run(); const response = await f.run('dispatch');
  assert.equal(response.code, 'ACCEPTED_NOT_DELIVERED'); assert.equal(f.sends(), 1);
  const call = f.calls.find(c => c.kind === 'dispatch')!;
  assert.equal(call.authorization, 'Bearer ' + f.secret);
  assert.equal(JSON.stringify(call.body), JSON.stringify({ requestId: f.api.TRIAL.requestId, outboxId: f.api.TRIAL.outboxId,
    recipientUserId: f.api.TRIAL.recipientUserId, category: 'operations.created', language: 'ar' }));
  assert.ok(!JSON.stringify(response).includes(f.secret)); assert.equal(response.stopped, false);
});
test('reconcile recorded response and claimed status do not prove delivery; WAMID never reaches UI', async () => {
  const f = fixture(); await f.run(); const response = await f.run('reconcile');
  assert.equal(response.code, 'OBSERVATION_RECORDED_NOT_DELIVERED'); assert.equal(f.queries(), 1);
  assert.ok(!JSON.stringify(response).includes('wamid.')); assert.equal(response.stopped, false);
});
test('persisted delivered/read/failure/unknown outcomes trigger the existing stop and clear authority', async () => {
  for (const state of ['delivered', 'read', 'failed', 'undelivered', 'unknown']) {
    const f = fixture(); await f.run(); f.state(state); const response = await f.run('reconcile');
    assert.equal(response.code, state.toUpperCase()); assert.equal(response.stopped, true);
    assert.equal(f.ticket(), undefined); assert.equal(f.calls.filter(c => c.kind === 'stop').length, 1);
    assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
  }
});
test('ambiguous worker response is stopped, never retried or labeled delivered', async () => {
  const f = fixture(); await f.run(); f.reply({ error: 'private-body-secret' }, 503);
  const response = await f.run('dispatch'); assert.equal(response.code, 'EXECUTION_UNCONFIRMED'); assert.equal(response.stopped, true);
  assert.ok(!JSON.stringify(response).includes('private-body-secret')); assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
});
test('post-dispatch state-read failure attempts cleanup rather than leaving a live send window', async () => {
  const f = fixture(); await f.run(); f.deliveryError();
  const response = await f.run('dispatch');
  assert.equal(response.code, 'UNCONFIRMED'); assert.equal(response.stopped, true); assert.equal(f.ticket(), undefined);
  assert.ok(!JSON.stringify(response).includes('SYNTHETIC'));
});
test('expired window denies dispatch and query, but preserves authenticated cleanup', async () => {
  const f = fixture(); await f.run(); f.time(Date.parse('2026-10-16T21:10:00Z'));
  const response = await f.run('dispatch'); assert.equal(response.code, 'WINDOW_EXPIRED'); assert.equal(response.stopped, true);
  assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
});
test('stop remains available after the window and cleanup failures never claim stop confirmation', async () => {
  const f = fixture(); await f.run(); f.time(Date.parse('2026-10-16T21:00:00Z') + f.api.TRIAL.windowMs + 1); f.stopError();
  const failed = await f.run('stop'); assert.equal(failed.stopped, false); assert.ok(f.ticket());
  assert.equal(f.sends(), 0);
});
test('ambiguous or additional delivery rows never prove delivery of the target', async () => {
  const f = fixture(); await f.run(); f.rows([{ audience: 'customer', state: 'delivered', attempts: 1 }]);
  assert.notEqual((await f.run('reconcile')).code, 'DELIVERED');
  f.rows([{ audience: 'operations', state: 'delivered', attempts: 1 }, { audience: 'operations', state: 'sent', attempts: 1 }]);
  assert.notEqual((await f.run('reconcile')).code, 'DELIVERED');
});
test('adapter forbids target fields, pins fresh canonical CEO, and uses a scoped secure HttpOnly cookie', () => {
  const source = readFileSync('app/admin/task199-trial/actions.ts', 'utf8');
  for (const marker of ['auth.getUser()', 'isCeoActor(supabase, user)', "requestHeaders.get('origin')", "key !== 'operation'", 'httpOnly: true', 'secure: true', "sameSite: 'strict'", "path: '/admin/task199-trial'", 'TRIAL.requestId']) assert.ok(source.includes(marker), marker);
  const controls = readFileSync('app/admin/task199-trial/controls.tsx', 'utf8');
  assert.ok(!controls.includes('WORKER_SECRET')); assert.ok(!controls.includes('outboxId')); assert.ok(!controls.includes('windowId'));
});

test('cookie publication failure after durable open stops the confirmed new window without retrying send', async () => {
  const f = fixture();
  f.ctx.writeTicket = () => { throw new Error('SYNTHETIC_COOKIE_PUBLICATION_FAILURE'); };
  const response = await f.run();
  assert.equal(response.code, 'UNCONFIRMED');
  assert.equal(response.stopped, true);
  assert.equal(f.ticket(), undefined);
  assert.deepEqual(f.calls.map(call => call.kind), ['open_kapso_drive_whatsapp_provider_query_window', 'stop']);
  assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
  assert.equal((await f.run('start')).code, 'START_UNCONFIRMED');
  assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
});

test('failed stop after cookie publication failure never claims cleanup or enables a retry', async () => {
  const f = fixture(); f.stopError();
  f.ctx.writeTicket = () => { throw new Error('SYNTHETIC_COOKIE_PUBLICATION_FAILURE'); };
  const response = await f.run();
  assert.equal(response.code, 'UNCONFIRMED'); assert.equal(response.stopped, false);
  assert.equal((await f.run('start')).code, 'START_UNCONFIRMED');
  assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
  assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
});
test('first-ready activation after the former calendar deadline keeps exactly nine minutes and cleanup authority', async () => {
  const startedAt = Date.parse('2026-10-19T00:05:00Z');
  const f = fixture(); f.time(startedAt);
  assert.equal((await f.run()).code, 'WINDOW_OPEN');
  const opened = f.calls[0].body;
  assert.ok(opened && typeof opened === 'object' && 'p_expires_at' in opened);
  assert.equal(opened.p_expires_at, new Date(startedAt + 9 * 60_000).toISOString());
  assert.equal(f.cookieExpires()?.getTime(), startedAt + 9 * 60_000 + 86_400_000);
  assert.equal((await f.run()).code, 'WINDOW_ALREADY_ASSIGNED');
  f.time(startedAt + 9 * 60_000);
  const closed = await f.run('dispatch');
  assert.equal(closed.code, 'WINDOW_EXPIRED'); assert.equal(closed.stopped, true);
  assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
  assert.equal((await f.run('dispatch')).code, 'NO_WINDOW');
});

test('relative expiry denies reconcile without a provider read and cannot reopen the durable window', async () => {
  const startedAt = Date.parse('2026-10-20T21:00:00Z');
  const f = fixture(); f.time(startedAt); await f.run();
  f.time(startedAt + f.api.TRIAL.windowMs + 1);
  const closed = await f.run('reconcile');
  assert.equal(closed.code, 'WINDOW_EXPIRED'); assert.equal(closed.stopped, true);
  assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
  assert.equal((await f.run()).code, 'START_UNCONFIRMED');
});

test('an active relative window before expiry still uses the authenticated fixed-target path', async () => {
  const startedAt = Date.parse('2026-10-19T00:05:00Z');
  const f = fixture(); f.time(startedAt); await f.run();
  f.time(startedAt + f.api.TRIAL.windowMs - 1);
  const result = await f.run('dispatch');
  assert.equal(result.code, 'ACCEPTED_NOT_DELIVERED'); assert.equal(result.stopped, false);
  assert.equal(f.sends(), 1); assert.equal(f.queries(), 0);
});

// Diagnostic delta only: synthetic fixture, no real configuration or provider access.
test('worker configuration rejection exposes only a fixed code before any window or provider call', async () => {
  for (const operation of ['start', 'dispatch', 'reconcile', 'stop']) {
    const f = fixture(); delete f.env.DIR3COM_WHATSAPP_WORKER_SECRET;
    assert.equal(JSON.stringify(await f.run(operation)), JSON.stringify({ code: 'WORKER_CONFIGURATION_REQUIRED', stopped: false }));
    assert.equal(f.calls.length, 0); assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
  }
});

test('Kapso configuration rejection is distinct and does not block authenticated no-window stop', async () => {
  for (const operation of ['start', 'dispatch', 'reconcile']) {
    const f = fixture(true);
    assert.equal(JSON.stringify(await f.run(operation)), JSON.stringify({ code: 'KAPSO_CONFIGURATION_REQUIRED', stopped: false }));
    assert.equal(f.calls.length, 0); assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
  }
  const stop = fixture(true);
  assert.equal(JSON.stringify(await stop.run('stop')), JSON.stringify({ code: 'NO_WINDOW', stopped: false }));
  assert.equal(stop.calls.length, 0); assert.equal(stop.sends(), 0); assert.equal(stop.queries(), 0);
});

test('real configuration rejection reaches only the protected operator as a fixed code with zero side effects', async () => {
  const valid = {
    DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_DELIVERY_MODE: 'provider_query',
    DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only', DIR3COM_WHATSAPP_CATEGORIES: 'operations.created',
    KAPSO_API_KEY: 'synthetic-not-a-provider-credential', KAPSO_PHONE_NUMBER_ID: '1205896545944230',
    DIR3COM_WHATSAPP_SITE_URL: 'https://dir3com.com',
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': { name: 'dir3com_operations_created_ar', languageCode: 'ar' } }),
  };
  const cases: [Record<string, string | undefined>, string][] = [
    [{ DIR3COM_WHATSAPP_ENABLED: 'false' }, 'KAPSO_CONFIG_ENABLED_REQUIRED'],
    [{ DIR3COM_WHATSAPP_DELIVERY_MODE: 'invalid' }, 'KAPSO_CONFIG_DELIVERY_MODE_REJECTED'],
    [{ DIR3COM_WHATSAPP_DISPATCH_MODE: 'general' }, 'KAPSO_CONFIG_QUERY_SCOPE_REJECTED'],
    [{ DIR3COM_WHATSAPP_DISPATCH_MODE: 'invalid' }, 'KAPSO_TRIAL_DISPATCH_MODE_MISMATCH'],
    [{ DIR3COM_WHATSAPP_CATEGORIES: '' }, 'KAPSO_CONFIG_CATEGORIES_REJECTED'],
    [{ KAPSO_API_KEY: undefined }, 'KAPSO_CONFIG_API_KEY_MISSING'],
    [{ KAPSO_API_KEY: 'bad' }, 'KAPSO_CONFIG_API_KEY_REJECTED'],
    [{ KAPSO_API_KEY: 'x'.repeat(513) }, 'KAPSO_CONFIG_API_KEY_REJECTED'],
    [{ KAPSO_API_KEY: 'synthetic key with whitespace' }, 'KAPSO_CONFIG_API_KEY_REJECTED'],
    [{ KAPSO_PHONE_NUMBER_ID: 'invalid' }, 'KAPSO_CONFIG_SENDER_FORMAT_REJECTED'],
    [{ KAPSO_PHONE_NUMBER_ID: '10000000000000' }, 'KAPSO_TRIAL_SENDER_MISMATCH'],
    [{ DIR3COM_WHATSAPP_SITE_URL: 'invalid' }, 'KAPSO_CONFIG_SITE_REJECTED'],
    [{ DIR3COM_WHATSAPP_SITE_URL: 'http://dir3com.com' }, 'KAPSO_CONFIG_SITE_REJECTED'],
    [{ DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid' }, 'KAPSO_TRIAL_SITE_MISMATCH'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: 'invalid' }, 'KAPSO_CONFIG_TEMPLATE_JSON_REJECTED'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: '{}' }, 'KAPSO_CONFIG_TEMPLATE_MAP_REJECTED'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'unknown.ar': { name: 'test', languageCode: 'ar' } }) }, 'KAPSO_CONFIG_TEMPLATE_KEY_REJECTED'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': { name: 'TEST', languageCode: 'ar' } }) }, 'KAPSO_CONFIG_TEMPLATE_ENTRY_REJECTED'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': { name: 'test', languageCode: 'ar', bodyParameterNames: ['x', 'x'] } }) }, 'KAPSO_CONFIG_TEMPLATE_PARAMETERS_REJECTED'],
    [{ DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': { name: 'another_template', languageCode: 'ar' } }) }, 'KAPSO_TRIAL_TEMPLATE_MISMATCH'],
    [{ DIR3COM_WHATSAPP_DELIVERY_MODE: 'webhook', KAPSO_WEBHOOK_SECRET: undefined }, 'KAPSO_CONFIG_WEBHOOK_RECEIPT_REQUIRED'],
    [{ DIR3COM_WHATSAPP_DELIVERY_MODE: 'webhook', KAPSO_WEBHOOK_SECRET: 'synthetic-webhook-secret'.repeat(2) }, 'KAPSO_TRIAL_DELIVERY_MODE_MISMATCH'],
  ];
  for (const [patch, code] of cases) {
    const f = fixture(false, true); Object.assign(f.env, valid, patch);
    assert.equal(JSON.stringify(await f.run('reconcile')), JSON.stringify({ code, stopped: false }));
    assert.equal(f.calls.length, 0); assert.equal(f.sends(), 0); assert.equal(f.queries(), 0);
    assert.equal(f.ticket(), undefined);
    assert.equal((await f.run('stop')).code, 'NO_WINDOW');
    f.allow(false); assert.equal((await f.run('reconcile')).code, 'FORBIDDEN');
    f.allow(true); assert.equal((await f.run('reconcile', 'https://evil.invalid')).code, 'ORIGIN_REJECTED');
    assert.equal(f.calls.length, 0);
  }
  const ready = fixture(false, true); Object.assign(ready.env, valid);
  assert.equal((await ready.run('reconcile')).code, 'NO_WINDOW');
  assert.equal(ready.calls.length, 0); assert.equal(ready.sends(), 0); assert.equal(ready.queries(), 0);
});
