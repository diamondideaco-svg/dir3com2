import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/notifications/kapso-drive-whatsapp';
import type { NotificationStore } from '../lib/notifications/drive-whatsapp';

function load(path: string, dependencies: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Buffer, URL, URLSearchParams, Request, Response, AbortSignal, AbortController, setTimeout, clearTimeout,
      fetch: async () => assert.fail('External I/O forbidden'), require(name: string) {
        if (name === 'server-only') return {};
        if (name === 'node:crypto') return crypto;
        if (name in dependencies) return dependencies[name];
        throw Error(name);
      } });
  return exports;
}
const common = load('lib/notifications/drive-whatsapp.ts');
const api = load('lib/notifications/kapso-drive-whatsapp.ts', { './drive-whatsapp': common }) as unknown as typeof Subject;
const template = { name: 'synthetic_continuous_created', languageCode: 'ar' };
const env = { DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_DISPATCH_MODE: 'continuous',
  DIR3COM_WHATSAPP_CATEGORIES: 'customer.created', KAPSO_API_KEY: 'SYNTHETIC-NOT-A-PROVIDER-KEY', KAPSO_PHONE_NUMBER_ID: '10000000000166',
  KAPSO_WEBHOOK_SECRET: 'SYNTHETIC-SIGNING-SECRET-000000000000', DIR3COM_WHATSAPP_WORKER_SECRET: 'SYNTHETIC-WORKER-SECRET-000000000000',
  DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid', DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'customer.created.ar': template }) };
const item = { id: '00000000-0000-4000-8000-000000000111', token: '00000000-0000-4000-8000-000000000222',
  continuous_scope_id: '00000000-0000-4000-8000-000000000333', phone: '+10000000001', reference: 'REQ-SYNTHETIC',
  audience: 'customer', action: 'created', language: 'ar' };
const neverSend = async () => assert.fail('Ineligible intent cannot send');

test('continuous configuration is explicit, lifecycle-only and signed-webhook-only', () => {
  assert.ok(api.kapsoConfig(env));
  assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_DELIVERY_MODE: 'provider_query' }), null);
  assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_CATEGORIES: 'customer.current_state',
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'customer.current_state.ar': template }) }), null);
});

test('continuous worker authenticates before obtaining a store', async () => {
  const response = await api.handleKapsoDispatch(new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch', { method: 'POST' }), env,
    () => assert.fail('Unauthorized caller cannot obtain store'), neverSend);
  assert.equal(response.status, 401);
});

test('continuous worker rejects GET and cannot run in target-only mode', async () => {
  const req = new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch', { headers: { authorization: 'Bearer ' + env.DIR3COM_WHATSAPP_WORKER_SECRET } });
  assert.equal((await api.handleKapsoDispatch(req, env, () => assert.fail('GET cannot obtain store'), neverSend)).status, 405);
  assert.equal((await api.handleKapsoDispatch(req, { ...env, DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only' }, () => assert.fail('Wrong mode'), neverSend)).status, 404);
});

test('continuous begin binds the actual configured template and a rejected intent cannot send', async () => {
  const config = api.kapsoConfig(env); assert.ok(config);
  const calls: string[] = [];
  const result = await api.dispatchKapsoContinuous({ async rpc(name, args) {
    calls.push(name);
    if (name === 'claim_kapso_continuous') { assert.equal(JSON.stringify(args?.p_templates), JSON.stringify(config.templates)); return { data: item, error: null }; }
    assert.equal(name, 'begin_kapso_continuous'); assert.equal(JSON.stringify(args?.p_template), JSON.stringify(template));
    return { data: false, error: null };
  } }, config, neverSend);
  assert.equal(result, 'not_sent');
  assert.deepEqual(calls, ['claim_kapso_continuous', 'begin_kapso_continuous']);
});

test('continuous worker cannot reinterpret legacy or current-state claims as an approved continuous row', async () => {
  const config = api.kapsoConfig(env); assert.ok(config);
  for (const invalid of [{ ...item, continuous_scope_id: undefined }, { ...item, action: 'current_state' }, { ...item, continuous_scope_id: 'wrong' }]) {
    await assert.rejects(api.dispatchKapsoContinuous({ async rpc(name) { assert.equal(name, 'claim_kapso_continuous'); return { data: invalid, error: null }; } }, config, neverSend), /INVALID_CONTINUOUS_CLAIM/);
  }
});

test('one continuous dispatch uses the existing transport and finish, never disables the service', async () => {
  const config = api.kapsoConfig(env); assert.ok(config); const calls: string[] = []; let sends = 0;
  const store: NotificationStore = { async rpc(name, args) {
    calls.push(name);
    if (name === 'claim_kapso_continuous') return { data: item, error: null };
    if (name === 'begin_kapso_continuous') return { data: true, error: null };
    assert.equal(name, 'finish_drive_whatsapp'); assert.equal(args?.p_outcome, 'accepted'); return { data: true, error: null };
  } };
  const response = await api.handleKapsoDispatch(new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch', { method: 'POST', headers: { authorization: 'Bearer ' + env.DIR3COM_WHATSAPP_WORKER_SECRET } }), env, () => store, async (_url, opts) => {
    sends++; const body = JSON.parse(String(opts?.body)); assert.equal(body.template.components[0].parameters[1].text, 'https://qa.example.invalid/my-requests/REQ-SYNTHETIC/drive?language=ar');
    return new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: 'wamid.synthetic_continuous' }] }), { status: 200 });
  });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).result, 'accepted'); assert.equal(sends, 1);
  assert.deepEqual(calls, ['claim_kapso_continuous', 'begin_kapso_continuous', 'finish_drive_whatsapp']);
});

test('ambiguous network outcome persists unknown once without a resend or shutdown', async () => {
  const config = api.kapsoConfig(env); assert.ok(config); let sends = 0; let finishes = 0;
  const result = await api.dispatchKapsoContinuous({ async rpc(name, args) {
    if (name === 'claim_kapso_continuous') return { data: item, error: null };
    if (name === 'begin_kapso_continuous') return { data: true, error: null };
    assert.equal(name, 'finish_drive_whatsapp'); assert.equal(args?.p_outcome, 'unknown'); finishes++; return { data: true, error: null };
  } }, config, async () => { sends++; throw Error('Synthetic response loss'); });
  assert.equal(result, 'unknown'); assert.equal(sends, 1); assert.equal(finishes, 1);
});
