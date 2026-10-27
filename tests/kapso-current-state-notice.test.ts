import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/notifications/kapso-drive-whatsapp';
import type * as Common from '../lib/notifications/drive-whatsapp';

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
const common = load('lib/notifications/drive-whatsapp.ts') as unknown as typeof Common;
const api = load('lib/notifications/kapso-drive-whatsapp.ts', { './drive-whatsapp': common }) as unknown as typeof Subject;
const template = { name: 'synthetic_current_state', languageCode: 'ar' };
const env = { DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only',
  DIR3COM_WHATSAPP_CATEGORIES: 'customer.current_state', KAPSO_API_KEY: 'SYNTHETIC-not-a-provider-key', KAPSO_PHONE_NUMBER_ID: '10000000000166',
  KAPSO_WEBHOOK_SECRET: 'SYNTHETIC-SIGNING-SECRET-000000000000000', DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid',
  DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'customer.current_state.ar': template }) };
const item = { id: '00000000-0000-4000-8000-000000000111', token: '00000000-0000-4000-8000-000000000222',
  phone: '+10000000001', reference: 'REQ-SYNTHETIC', audience: 'customer', action: 'current_state', language: 'ar' };
const target = { requestId: '00000000-0000-4000-8000-000000000333', outboxId: item.id,
  recipientUserId: '00000000-0000-4000-8000-000000000444', category: 'customer.current_state', language: 'ar' };

test('current-state is a separate Kapso bounded variant, not a Twilio lifecycle action', () => {
  assert.equal(common.parseOutboxItem(item), null);
  assert.equal(api.parseKapsoOutboxItem(item)?.action, 'current_state');
  for (const action of ['created', 'review', 'confirm', 'decline', 'customer_accept']) assert.equal(common.parseOutboxItem({ ...item, action })?.action, action);
});
test('current-state config rejects general, provider-query and mixed lifecycle configuration', () => {
  assert.ok(api.kapsoConfig(env));
  assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_DISPATCH_MODE: 'general' }), null);
  assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_DELIVERY_MODE: 'provider_query' }), null);
  assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_CATEGORIES: 'customer.current_state,customer.created' }), null);
});
test('legacy Kapso config still requires only its old configured templates', () => {
  assert.ok(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_DISPATCH_MODE: 'general', DIR3COM_WHATSAPP_CATEGORIES: 'operations.created',
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': template }) }));
});
test('new target and parser reject untyped malformed identities and arbitrary purpose/body', () => {
  assert.equal(api.parseKapsoOutboxItem({ ...item, phone: 'not-e164' }), null);
  assert.equal(api.parseKapsoTarget({ ...target, category: 'customer.arbitrary' }), null);
  assert.equal(api.parseKapsoTarget({ ...target, body: 'not approved' }), null);
});
test('current-state intent binds the actual configured template before any network call', async () => {
  const config = api.kapsoConfig(env); const parsedTarget = api.parseKapsoTarget(target);
  assert.ok(config && parsedTarget);
  const calls: string[] = [];
  const result = await api.dispatchKapsoTarget({ async rpc(name, args) {
    calls.push(name);
    if (name === 'claim_kapso_drive_whatsapp_target') return { data: { ...item, request_id: target.requestId, recipient_user_id: target.recipientUserId }, error: null };
    assert.equal(name, 'begin_kapso_current_state_notice');
    assert.equal(JSON.stringify(args?.p_template), JSON.stringify(template));
    return { data: false, error: null };
  } }, config, parsedTarget, async () => assert.fail('Denied intent cannot send'));
  assert.equal(result, 'not_sent');
  assert.deepEqual(calls, ['claim_kapso_drive_whatsapp_target', 'begin_kapso_current_state_notice']);
});
test('a mismatched claim cannot reach current-state begin or send', async () => {
  const config = api.kapsoConfig(env), parsedTarget = api.parseKapsoTarget(target); assert.ok(config && parsedTarget);
  await assert.rejects(api.dispatchKapsoTarget({ async rpc(name) {
    assert.equal(name, 'claim_kapso_drive_whatsapp_target'); return { data: { ...item, request_id: item.id, recipient_user_id: target.recipientUserId }, error: null };
  } }, config, parsedTarget, async () => assert.fail('Mismatched target cannot send')), /TARGET_MISMATCH/);
});
test('general dispatcher cannot reinterpret a current-state claim', async () => {
  const config = api.kapsoConfig(env); assert.ok(config);
  await assert.rejects(api.dispatchKapsoOne({ async rpc(name) { assert.equal(name, 'claim_kapso_drive_whatsapp'); return { data: item, error: null }; } },
    config, async () => assert.fail('General path cannot send snapshot')), /INVALID_CLAIM/);
});
