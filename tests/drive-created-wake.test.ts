import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Wake from '../lib/notifications/drive-created-wake';
import type { NotificationStore } from '../lib/notifications/drive-whatsapp';

const blockedFetch: typeof fetch = async () => assert.fail('External I/O forbidden');
function load(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Buffer, URL, URLSearchParams, Request, Response, AbortSignal, AbortController, setTimeout, clearTimeout,
    fetch: blockedFetch, console: { error() { /* Existing identifier-only recovery log stays isolated. */ } },
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      assert.ok(name in dependencies, `Unapproved dependency: ${name}`);
      return dependencies[name];
    }, ...globals,
  });
  return exports;
}
const common = load('lib/notifications/drive-whatsapp.ts', {});
const kapso = load('lib/notifications/kapso-drive-whatsapp.ts', { './drive-whatsapp': common });
const template = { name: 'synthetic_created', languageCode: 'ar' };
const environment = {
  DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_DISPATCH_MODE: 'continuous',
  DIR3COM_WHATSAPP_DELIVERY_MODE: 'webhook', DIR3COM_WHATSAPP_CATEGORIES: 'customer.created,operations.created',
  KAPSO_API_KEY: 'SYNTHETIC-NOT-A-PROVIDER-KEY', KAPSO_PHONE_NUMBER_ID: '10000000000166',
  KAPSO_WEBHOOK_SECRET: 'SYNTHETIC-SIGNING-SECRET-000000000000',
  DIR3COM_WHATSAPP_WORKER_SECRET: 'SYNTHETIC-WORKER-SECRET-000000000000',
  DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid',
  DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'customer.created.ar': template, 'operations.created.ar': template }),
};
function item(index: number) {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    token: '00000000-0000-4000-8000-000000000222', continuous_scope_id: '00000000-0000-4000-8000-000000000333',
    phone: '+10000000001', reference: `REQ-SYNTHETIC${index}`, audience: index % 2 ? 'customer' : 'operations', action: 'created', language: 'ar' };
}
function harness(options: { env?: Record<string, string | undefined>; store?: NotificationStore | null; fetcher?: typeof fetch; scheduleFails?: boolean; loggerFails?: boolean; dispatch?: unknown } = {}) {
  let clock = 0;
  let storeReads = 0;
  const logs: Array<{ event: string; metadata: unknown }> = [];
  const callbacks: Array<() => Promise<void>> = [];
  const env = { ...environment, ...options.env };
  const getStore = () => { storeReads++; return options.store ?? null; };
  const api = load('lib/notifications/drive-created-wake.ts', {
    'next/server': { after(callback: () => Promise<void>) {
      if (options.scheduleFails) throw new Error('PRIVATE_SCHEDULER_SECRET');
      callbacks.push(callback);
    } },
    '@/lib/supabase/server': { supabaseAdmin: options.store ?? null },
    '@/lib/security/safe-logger': { logServerEvent(event: string, metadata: unknown) {
      if (options.loggerFails) throw new Error('PRIVATE_LOGGER_DETAIL');
      logs.push({ event, metadata });
    } },
    './kapso-drive-whatsapp': options.dispatch ? { handleKapsoDispatch: options.dispatch } : kapso,
  }, { process: { env }, performance: { now: () => clock }, fetch: options.fetcher ?? blockedFetch }) as unknown as typeof Wake;
  return { api, env, logs, callbacks, setClock(value: number) { clock = value; },
    storeReads: () => storeReads,
    run(scheduledAt = clock) { return api.wakeCreatedDriveNotifications({ env, getStore, fetcher: options.fetcher ?? blockedFetch, now: () => clock }, scheduledAt); } };
}
function successfulResponse(body: Record<string, unknown>) {
  return Response.json({ messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: 'wamid.synthetic_created' }] });
}
function syntheticStore(rows: ReturnType<typeof item>[], begin = true) {
  const calls: string[] = [];
  const store: NotificationStore = { async rpc(name) {
    calls.push(name);
    if (name === 'claim_kapso_continuous') return { data: rows.shift() ?? null, error: null };
    assert.ok(['begin_kapso_continuous', 'finish_drive_whatsapp'].includes(name), name);
    return { data: name === 'begin_kapso_continuous' ? begin : true, error: null };
  } };
  return { store, calls };
}

test('scheduling is post-response only and reuses real worker gates without self HTTP', async () => {
  const db = syntheticStore([]);
  const h = harness({ store: db.store });
  h.api.scheduleCreatedDriveWake();
  assert.equal(h.callbacks.length, 1);
  assert.deepEqual(db.calls, []);
  await h.callbacks[0]();
  assert.deepEqual(db.calls, ['claim_kapso_continuous']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.logs)), [{ event: 'drive.created_notification_wake', metadata: { code: 'IDLE' } }]);
});

test('registration and logging failure cannot fail the committed request or start a claim', () => {
  for (const loggerFails of [false, true]) {
    const db = syntheticStore([item(1)]);
    const h = harness({ store: db.store, scheduleFails: true, loggerFails });
    assert.doesNotThrow(() => h.api.scheduleCreatedDriveWake());
    assert.deepEqual(db.calls, []);
    assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE|SYNTHETIC|phone|token|secret/i);
    if (!loggerFails) assert.match(JSON.stringify(h.logs), /SCHEDULING_UNAVAILABLE/);
  }
});

test('disabled, non-continuous, query and non-created scopes never obtain store or call provider', async () => {
  for (const env of [
    { DIR3COM_WHATSAPP_ENABLED: 'false' }, { DIR3COM_WHATSAPP_DISPATCH_MODE: 'general' },
    { DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only' }, { DIR3COM_WHATSAPP_DELIVERY_MODE: 'provider_query' },
    { DIR3COM_WHATSAPP_CATEGORIES: '' }, { DIR3COM_WHATSAPP_CATEGORIES: 'customer.created,customer.review' },
    { DIR3COM_WHATSAPP_CATEGORIES: 'operations.current_state' },
  ]) {
    const db = syntheticStore([item(1)]);
    const h = harness({ env, store: db.store });
    await h.run();
    assert.equal(h.storeReads(), 0); assert.deepEqual(db.calls, []);
    assert.match(JSON.stringify(h.logs), /GATED/);
  }
});

test('existing worker, template and sender configuration rejection never claims', async () => {
  for (const env of [
    { DIR3COM_WHATSAPP_WORKER_SECRET: '' }, { DIR3COM_WHATSAPP_KAPSO_TEMPLATES: '{}' },
    { KAPSO_API_KEY: '' }, { KAPSO_PHONE_NUMBER_ID: '' }, { KAPSO_WEBHOOK_SECRET: '' },
    { DIR3COM_WHATSAPP_CATEGORIES: 'customer.created,customer.created' },
  ]) {
    const db = syntheticStore([item(1)]); const h = harness({ env, store: db.store });
    await h.run(); assert.equal(h.storeReads(), 0); assert.deepEqual(db.calls, []);
    assert.doesNotMatch(JSON.stringify(h.logs), /SYNTHETIC|SECRET|KEY_MISSING/);
  }
});

test('a missing store stops without a provider request', async () => {
  const h = harness(); await h.run();
  assert.equal(h.storeReads(), 1); assert.match(JSON.stringify(h.logs), /UNCONFIRMED_DO_NOT_RETRY/);
});

test('at most two real dispatches run sequentially, preserving a third eligible row', async () => {
  const rows = [item(1), item(2), item(3)]; const db = syntheticStore(rows);
  let sends = 0; let active = 0; let maxActive = 0;
  const h = harness({ store: db.store, fetcher: async (url, init) => {
    assert.match(String(url), /^https:\/\/api\.kapso\.ai\/meta\/whatsapp\/v24\.0\//);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    active++; maxActive = Math.max(maxActive, active); sends++;
    await Promise.resolve(); active--;
    return successfulResponse(JSON.parse(String(init?.body)));
  } });
  await h.run();
  assert.equal(sends, 2); assert.equal(maxActive, 1); assert.equal(rows.length, 1);
  assert.deepEqual(db.calls, ['claim_kapso_continuous', 'begin_kapso_continuous', 'finish_drive_whatsapp', 'claim_kapso_continuous', 'begin_kapso_continuous', 'finish_drive_whatsapp']);
  assert.equal(h.logs.length, 2); assert.match(JSON.stringify(h.logs), /ACCEPTED_NOT_DELIVERED/);
  assert.doesNotMatch(JSON.stringify(h.logs), /REQ-|wamid|SYNTHETIC|00000000|10000000001/);
});

test('idle and rejected atomic begin stop the wake, not retry or drain past the rejection', async () => {
  for (const rows of [[], [item(1), item(2)]]) {
    const db = syntheticStore(rows, false); const h = harness({ store: db.store }); await h.run();
    assert.equal(db.calls.filter(name => name === 'claim_kapso_continuous').length, 1);
    assert.equal(rows.length, db.calls.length === 1 ? 0 : 1);
    assert.match(JSON.stringify(h.logs), /IDLE|NOT_SENT/);
  }
});

test('non-success provider replies and transport ambiguity finish once and stop without another send', async () => {
  for (const ambiguous of [false, true]) {
    const db = syntheticStore([item(1), item(2)]); let sends = 0;
    const h = harness({ store: db.store, fetcher: async () => {
      sends++;
      if (ambiguous) throw new Error('PRIVATE_TRANSPORT_DETAIL');
      return Response.json({ error: 'PRIVATE_PROVIDER_DETAIL' }, { status: 400 });
    } });
    await h.run(); assert.equal(sends, 1);
    assert.deepEqual(db.calls, ['claim_kapso_continuous', 'begin_kapso_continuous', 'finish_drive_whatsapp']);
    // Existing transport deliberately treats every unaccepted response as unknown.
    assert.match(JSON.stringify(h.logs), /UNKNOWN_DO_NOT_RETRY/);
    assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE/);
  }
});

test('accepted send with uncertain persistence stops instead of retrying or draining', async () => {
  let claims = 0; let sends = 0; let finishes = 0;
  const h = harness({ store: { async rpc(name) {
    if (name === 'claim_kapso_continuous') { claims++; return { data: item(1), error: null }; }
    if (name === 'begin_kapso_continuous') return { data: true, error: null };
    assert.equal(name, 'finish_drive_whatsapp'); finishes++; throw new Error('PRIVATE_PERSISTENCE_DETAIL');
  } }, fetcher: async (_url, init) => { sends++; return successfulResponse(JSON.parse(String(init?.body))); } });
  await h.run();
  assert.equal(claims, 1); assert.equal(sends, 1); assert.equal(finishes, 1);
  assert.match(JSON.stringify(h.logs), /UNCONFIRMED_DO_NOT_RETRY/); assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE/);
});

test('a later wake does not resend a previously accepted or unknown row', async () => {
  for (const unknown of [false, true]) {
    const rows = [item(1)]; const db = syntheticStore(rows); let sends = 0;
    const h = harness({ store: db.store, fetcher: async (_url, init) => {
      sends++; if (unknown) throw new Error('Ambiguous synthetic transport');
      return successfulResponse(JSON.parse(String(init?.body)));
    } });
    await h.run(); await h.run(); assert.equal(sends, 1);
    assert.equal(db.calls.filter(name => name === 'begin_kapso_continuous').length, 1);
  }
});

test('elapsed budget includes the post-response delay and prevents a late first claim', async () => {
  const db = syntheticStore([item(1)]); const h = harness({ store: db.store });
  h.api.scheduleCreatedDriveWake(); h.setClock(8001);
  await h.callbacks[0](); assert.deepEqual(db.calls, []);
  assert.match(JSON.stringify(h.logs), /ELAPSED_BUDGET/);
});

test('elapsed budget does not start a second intent after a slow accepted send', async () => {
  const db = syntheticStore([item(1), item(2)]);
  const h = harness({ store: db.store, fetcher: async (_url, init) => {
    h.setClock(9000); return successfulResponse(JSON.parse(String(init?.body)));
  } });
  await h.run(); assert.equal(db.calls.filter(name => name === 'begin_kapso_continuous').length, 1);
  assert.match(JSON.stringify(h.logs), /ELAPSED_BUDGET/);
});

test('changed mode between iterations is rechecked before a second claim', async () => {
  const db = syntheticStore([item(1), item(2)]);
  const h = harness({ store: db.store, fetcher: async (_url, init) => {
    h.env.DIR3COM_WHATSAPP_DISPATCH_MODE = 'target_only';
    return successfulResponse(JSON.parse(String(init?.body)));
  } });
  await h.run(); assert.equal(db.calls.filter(name => name === 'claim_kapso_continuous').length, 1);
  assert.match(JSON.stringify(h.logs), /GATED/);
});

test('concurrent wakes still require atomic begin; the synthetic daily-last-slot guard admits one intent', async () => {
  // A stateful RPC model, not a replacement for the previously accepted real
  // PostgreSQL concurrency evidence. The production claim/begin SQL is unchanged.
  const rows = [item(1), item(2)]; let admitted = 0; let sends = 0; let begins = 0;
  const store: NotificationStore = { async rpc(name) {
    if (name === 'claim_kapso_continuous') return { data: rows.shift() ?? null, error: null };
    if (name === 'begin_kapso_continuous') {
      begins++;
      if (admitted >= 1) return { data: false, error: null };
      admitted++; return { data: true, error: null };
    }
    assert.equal(name, 'finish_drive_whatsapp'); return { data: true, error: null };
  } };
  const h = harness({ store, fetcher: async (_url, init) => { sends++; return successfulResponse(JSON.parse(String(init?.body))); } });
  await Promise.all([h.run(), h.run()]); assert.equal(begins, 2); assert.equal(sends, 1);
  assert.equal(admitted, 1);
});

test('concurrent wakes cannot turn a single atomic claim into two provider intents', async () => {
  const db = syntheticStore([item(1)]); let sends = 0;
  const h = harness({ store: db.store, fetcher: async (_url, init) => {
    sends++; await Promise.resolve(); return successfulResponse(JSON.parse(String(init?.body)));
  } });
  await Promise.all([h.run(), h.run()]);
  assert.equal(sends, 1); assert.equal(db.calls.filter(name => name === 'begin_kapso_continuous').length, 1);
});

test('claim errors and unverifiable replies stop with fixed diagnostics only', async () => {
  const db = harness({ store: { async rpc() { throw new Error('PRIVATE_CLAIM_DETAIL'); } } });
  await db.run(); assert.match(JSON.stringify(db.logs), /UNCONFIRMED_DO_NOT_RETRY/);
  assert.doesNotMatch(JSON.stringify(db.logs), /PRIVATE/);
  for (const payload of [null, {}, { result: 'retry' }]) {
    let calls = 0;
    const h = harness({ dispatch: async () => { calls++; return Response.json(payload); } });
    await h.run(); assert.equal(calls, 1); assert.match(JSON.stringify(h.logs), /UNCONFIRMED_DO_NOT_RETRY/);
  }
});
