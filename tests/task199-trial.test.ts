import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/admin/task199-trial';

function fixture() {
  let allowed = true;
  let current = Date.parse('2026-10-16T21:00:00Z');
  let value: string | undefined;
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
        kapsoConfig: () => config,
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
    writeTicket: v => { value = v; }, clearTicket: () => { value = undefined; },
    readDelivery: async () => {
      if (deliveryError) throw new Error('SYNTHETIC-PRIVATE-ERROR');
      return rows ?? [{ audience: 'operations', attempts: 1, state }];
    }, now: () => current,
  };
  const run = (op: unknown = 'start', origin: string | null = api.TRIAL.origin) => api.runTask199Trial(op, origin, ctx);
  return { api, ctx, calls, run, env, secret, config, sends: () => sends, queries: () => queries,
    allow: (v: boolean) => { allowed = v; }, time: (v: number) => { current = v; },
    ticket: () => value, setTicket: (v: string | undefined) => { value = v; },
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
    const f = fixture(); f.config[part] = 'wrong'; assert.equal((await f.run()).code, 'NOT_CONFIGURED');
  }
  const template = fixture(); template.config.templates['operations.created.ar'].name = 'another_template';
  assert.equal((await template.run()).code, 'NOT_CONFIGURED');
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
  const cutoff = fixture(); cutoff.time(cutoff.api.TRIAL.cutoff);
  assert.equal((await cutoff.run()).code, 'ACCESS_EXPIRED'); assert.equal(cutoff.calls.length, 0);
});
test('stop remains available after cutoff and cleanup failures never claim stop confirmation', async () => {
  const f = fixture(); await f.run(); f.time(f.api.TRIAL.cutoff + 1); f.stopError();
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
test('renewed cutoff clips the last minute, retains the nine-minute cap and stops at the deadline', async () => {
  const near = fixture(); near.time(near.api.TRIAL.cutoff - 60_000);
  assert.equal((await near.run()).code, 'WINDOW_OPEN');
  const lastMinute = near.calls[0].body;
  assert.ok(lastMinute && typeof lastMinute === 'object' && 'p_expires_at' in lastMinute);
  assert.equal(lastMinute.p_expires_at, new Date(near.api.TRIAL.cutoff).toISOString());
  assert.equal(near.sends(), 0);
  near.time(near.api.TRIAL.cutoff);
  const closed = await near.run('dispatch');
  assert.equal(closed.code, 'ACCESS_EXPIRED'); assert.equal(closed.stopped, true);
  assert.equal(near.sends(), 0); assert.equal(near.queries(), 0);
  const earlier = fixture(); earlier.time(earlier.api.TRIAL.cutoff - 10 * 60_000);
  assert.equal((await earlier.run()).code, 'WINDOW_OPEN');
  const fullWindow = earlier.calls[0].body;
  assert.ok(fullWindow && typeof fullWindow === 'object' && 'p_expires_at' in fullWindow);
  assert.equal(fullWindow.p_expires_at, new Date(earlier.api.TRIAL.cutoff - 60_000).toISOString());
});
