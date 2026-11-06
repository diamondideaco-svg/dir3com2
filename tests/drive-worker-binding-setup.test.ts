import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '../lib/admin/drive-worker-binding-ui';
import type * as Setup from '../lib/admin/drive-worker-binding-setup';
import type Component from '../components/admin/DriveWorkerBindingSetup';

const approvalId = '00000000-0000-4000-8000-000000000166';
const secretId = '00000000-0000-4000-8000-000000000167';
const identity = { sha: 'a'.repeat(40), deploymentId: 'dpl_SYNTHETIC1660000' };
const ready = { code: 'READY', approvalId, secretId: null, sourceSha: identity.sha,
  deploymentId: identity.deploymentId, referenceName: 'task166_existing_worker_bearer' };
const boundResponse = { code: 'BOUND_NOT_ACTIVATED', approvalId, secretId };

function load<T>(path: string, dependencies: Record<string, unknown>, globals = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, URL, fetch: async () => assert.fail('External I/O forbidden'),
    require(name: string) {
      if (name === 'server-only') return {};
      if (name in dependencies) return dependencies[name];
      throw Error('Unexpected dependency: ' + name);
    }, ...globals });
  return exports as T;
}

function environment() {
  const values = new Map<string, string>();
  const requests: { target: string; init?: RequestInit }[] = [];
  let locked = false;
  const env = {
    origin: ui.workerBindingOrigin,
    storage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } },
    locks: { request: async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<ui.SetupOutcome>) => {
      if (locked) return callback(null);
      locked = true;
      try { return await callback({}); } finally { locked = false; }
    } } as unknown as Pick<LockManager, 'request'>,
    fetcher: (async (input, init) => { requests.push({ target: String(input), init });
      assert.equal(values.size, 1, 'durable marker must precede the POST');
      return Response.json(boundResponse);
    }) as typeof fetch,
  };
  return { env, values, requests };
}

test('setup is ready only for an exact ready permit and deployed identity', () => {
  assert.equal(ui.bindingSetupReadiness(ready, approvalId, identity), 'ready');
  for (const field of ['approvalId', 'sourceSha', 'deploymentId', 'referenceName']) {
    assert.equal(ui.bindingSetupReadiness({ ...ready, [field]: 'wrong' }, approvalId, identity), 'unavailable');
  }
  for (const code of ['EXPIRED', 'REVOKED', 'NOT_APPROVED', 'CONFLICT_STOP', 'INCONSISTENT_STOP']) {
    assert.equal(ui.bindingSetupReadiness({ ...ready, code }, approvalId, identity), 'unavailable');
  }
  assert.equal(ui.bindingSetupReadiness({ ...ready, extra: true }, approvalId, identity), 'unavailable');
  assert.equal(ui.bindingSetupReadiness({ ...ready, code: 'BOUND', secretId }, approvalId, identity), 'bound');
});

test('one click sends exactly one same-origin approval-only POST without any setup side effect', async () => {
  const f = environment();
  assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'bound');
  assert.equal(f.requests.length, 1);
  const { target, init } = f.requests[0];
  assert.equal(target, '/api/admin/drive-whatsapp/worker-binding');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.redirect, 'error');
  assert.equal(init?.credentials, 'same-origin');
  assert.equal(init?.mode, 'same-origin');
  assert.equal(init?.cache, 'no-store');
  assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(String(init?.body)), { approvalId });
  assert.ok(init?.signal);
});

test('concurrent clicks/tabs and reloads cannot send a second POST', async () => {
  const f = environment();
  const results = await Promise.all([ui.attemptWorkerBinding(approvalId, f.env), ui.attemptWorkerBinding(approvalId, f.env)]);
  assert.deepEqual(results.sort(), ['bound', 'unknown']);
  assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'unknown');
  assert.equal(f.requests.length, 1);
});

test('network loss, malformed responses and server errors stop without retry', async () => {
  for (const response of [null, new Response('bad json'), Response.json(boundResponse, { status: 503 }),
    Response.json({ ...boundResponse, approvalId: secretId }), Response.json({ ...boundResponse, secretId: 'not-a-uuid' }),
    Response.json({ ...boundResponse, raw: 'must-not-be-rendered' })]) {
    const f = environment(); let calls = 0;
    f.env.fetcher = async () => { calls++; if (response === null) throw Error('private-error'); return response; };
    assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'unknown');
    assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'unknown');
    assert.equal(calls, 1);
  }
});

test('storage unavailable, bad IDs, alternate origins and unavailable locks never POST', async () => {
  const f = environment();
  f.env.storage.setItem = () => { throw Error('storage unavailable'); };
  assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'unknown');
  assert.equal(await ui.attemptWorkerBinding('invalid', f.env), 'unavailable');
  assert.equal(await ui.attemptWorkerBinding(approvalId, { ...f.env, origin: 'https://preview.vercel.app' }), 'unavailable');
  assert.equal(await ui.attemptWorkerBinding(approvalId, { ...f.env, locks: undefined as unknown as LockManager }), 'unknown');
  assert.equal(f.requests.length, 0);
});

test('redirects and unexpected response URLs are uncertain outcomes, never followed or retried', async () => {
  for (const fields of [{ redirected: true, url: ui.workerBindingOrigin + ui.workerBindingPath },
    { redirected: false, url: 'https://other.invalid/' }]) {
    const f = environment(); let calls = 0;
    f.env.fetcher = async () => { calls++; return { ...fields, status: 200, json: async () => boundResponse } as Response; };
    assert.equal(await ui.attemptWorkerBinding(approvalId, f.env), 'unknown');
    assert.equal(calls, 1);
  }
  assert.equal(ui.bindingSetupOutcome(200, { ...boundResponse, code: 'ALREADY_BOUND_NO_RETRY' }, approvalId), 'already-bound');
});

function setupFixture() {
  const calls = { auth: 0, ceo: 0, rpc: 0, retry: [] as boolean[] };
  const state = { allowed: true, authenticated: true, rpcError: null as unknown, data: ready as unknown,
    hostname: 'ynupwivgvwcyrsdhtkcc.supabase.co' };
  const env = { VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://ynupwivgvwcyrsdhtkcc.supabase.co' };
  Object.defineProperty(env, 'DIR3COM_WHATSAPP_WORKER_SECRET', { get: () => assert.fail('Setup rendering cannot read the worker') });
  const setup = load<typeof Setup>('lib/admin/drive-worker-binding-setup.ts', {
    '@/lib/supabase/server': { getSupabaseAdminHostname: () => state.hostname, createSupabaseServerClient: async (transport: unknown) => {
      assert.equal(typeof transport, 'function');
      return { auth: { getUser: async () => { calls.auth++; return { data: { user: state.authenticated ? { id: 'synthetic' } : null }, error: null }; } },
        rpc: (name: string, args: unknown) => { calls.rpc++; assert.equal(name, 'get_task166_worker_binding_state');
          assert.equal(JSON.stringify(args), JSON.stringify({ p_approval_id: approvalId }));
          return { retry: async (value: boolean) => { calls.retry.push(value); return { data: state.data, error: state.rpcError }; } }; },
      };
    } },
    '@/lib/auth/team-access': { isCeoActor: async () => { calls.ceo++; return state.allowed; } },
    '@/lib/admin/server-binding-diagnostic': { getDeploymentIdentity: () => identity },
    '@/lib/admin/drive-worker-binding': { bindingTransport: (fetcher: unknown) => fetcher },
    '@/lib/admin/drive-worker-binding-ui': ui,
  }, { process: { env } });
  return { setup, calls, state, env };
}

test('server rendering authorizes CEO and only reads the exact permit with retries disabled', async () => {
  const f = setupFixture();
  assert.equal(JSON.stringify(await f.setup.readWorkerBindingSetup(approvalId)), JSON.stringify({ approvalId, readiness: 'ready' }));
  assert.deepEqual(f.calls, { auth: 1, ceo: 1, rpc: 1, retry: [false] });
});

test('server rendering cannot ready preview, anonymous/non-CEO or mismatched/expired permit', async () => {
  for (const change of ['preview', 'anonymous', 'forbidden', 'hostname', 'permit', 'expired', 'error', 'query']) {
    const f = setupFixture();
    if (change === 'preview') f.env.VERCEL_ENV = 'preview';
    if (change === 'anonymous') f.state.authenticated = false;
    if (change === 'forbidden') f.state.allowed = false;
    if (change === 'hostname') f.state.hostname = 'other.supabase.co';
    if (change === 'permit') f.state.data = { ...ready, sourceSha: 'b'.repeat(40) };
    if (change === 'expired') f.state.data = { code: 'EXPIRED' };
    if (change === 'error') f.state.rpcError = { message: 'private error' };
    const value = await f.setup.readWorkerBindingSetup(change === 'query' ? [approvalId, approvalId] : approvalId);
    assert.equal(JSON.stringify(value), JSON.stringify({ approvalId: null, readiness: 'unavailable' }));
    assert.equal(f.calls.rpc, ['permit', 'expired', 'error'].includes(change) ? 1 : 0);
  }
});

test('bilingual setup UI renders without a network call and unavailable/bound states disable the button', () => {
  const component = load<{ default: typeof Component }>('components/admin/DriveWorkerBindingSetup.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/admin/drive-worker-binding-ui': ui,
  }).default;
  for (const readiness of ['ready', 'bound', 'unavailable'] as const) {
    const html = renderToStaticMarkup(React.createElement(component, { approvalId: readiness === 'unavailable' ? null : approvalId, readiness }));
    assert.match(html, /تهيئة واتساب للتشغيل التلقائي/);
    assert.match(html, /Automatic WhatsApp setup/);
    assert.match(html, /role="status"/);
    assert.match(html, /min-h-11 w-full/);
    assert.equal(html.includes('disabled=""'), readiness !== 'ready');
    assert.ok(!html.includes(approvalId), 'approval ID is not displayed as input or text');
    assert.ok(!html.includes(secretId));
    if (readiness === 'bound') assert.match(html, /Automatic operation is not yet confirmed/);
  }
});
