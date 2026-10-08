import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/notifications/kapso-drive-whatsapp';
import type { NotificationStore, OutboxItem } from '../lib/notifications/drive-whatsapp';

function load(path: string, dependencies: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Buffer, URL, URLSearchParams, Response, Request, AbortSignal, fetch,
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name in dependencies) return dependencies[name];
      throw new Error(name);
    } });
  return exports;
}
const api = load('lib/notifications/kapso-drive-whatsapp.ts', {
  './drive-whatsapp': load('lib/notifications/drive-whatsapp.ts'),
}) as unknown as typeof Subject;
const env = {
  DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_CATEGORIES: 'operations.created',
  KAPSO_API_KEY: 'isolated-not-an-api-key', KAPSO_PHONE_NUMBER_ID: '10000000000166',
  KAPSO_WEBHOOK_SECRET: 'isolated-webhook-secret'.repeat(3), DIR3COM_WHATSAPP_WORKER_SECRET: 'isolated-worker-secret'.repeat(3),
  DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid',
  DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.ar': { name: 'isolated_operations_created', languageCode: 'ar' } }),
};
const config = api.kapsoConfig(env)!;
const item: OutboxItem = { id: '00000000-0000-4000-8000-000000000166', token: '00000000-0000-4000-8000-000000000167',
  phone: '+10000000003', reference: 'REQ-ISOLATED166', audience: 'operations', action: 'created', language: 'ar' };
const sid = 'wamid.ISOLATED166';
const failFetch: typeof fetch = async () => { assert.fail('Real provider calls prohibited'); };
const failStore = () => { assert.fail('Unexpected store access'); };
const request = (authorization = `Bearer ${env.DIR3COM_WHATSAPP_WORKER_SECRET}`) => new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch', { method: 'POST', headers: { authorization } });
const accepted = (patch = {}) => new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: item.phone.slice(1), wa_id: item.phone.slice(1) }], messages: [{ id: sid }], ...patch }), { status: 200 });
function store(start: unknown = true, finish: unknown = true, row: unknown = item) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const db: NotificationStore = { async rpc(name, args) {
    calls.push({ name, args }); return { error: null, data: name === 'claim_drive_whatsapp' ? row : name === 'begin_kapso_drive_whatsapp' ? start : finish };
  } };
  return { db, calls };
}
function payload(patch = {}) {
  return { phone_number_id: env.KAPSO_PHONE_NUMBER_ID, message: { id: sid, to: item.phone.slice(1), kapso: { direction: 'outbound', status: 'delivered' } }, ...patch };
}
function receipt(raw = JSON.stringify(payload()), signature?: string, url = 'https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp') {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json',
    'x-webhook-signature': signature ?? crypto.createHmac('sha256', env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex'),
    'x-webhook-event': 'whatsapp.message.failed', // Deliberately disagrees with signed status.
  }, body: raw });
}
test('single approved category/language config needs none of the other thirteen templates', () => {
  assert.ok(config); assert.equal(Object.keys(config.templates).join(','), 'operations.created.ar');
  for (const [key, value] of [
    ['DIR3COM_WHATSAPP_ENABLED', 'false'], ['DIR3COM_WHATSAPP_CATEGORIES', 'operations.created,customer.unknown'],
    ['KAPSO_PHONE_NUMBER_ID', '../sender'], ['KAPSO_WEBHOOK_SECRET', 'short'], ['KAPSO_API_KEY', 'bad key'],
    ['DIR3COM_WHATSAPP_SITE_URL', 'http://qa.example.invalid'], ['DIR3COM_WHATSAPP_SITE_URL', 'https://a:b@qa.example.invalid'],
    ['DIR3COM_WHATSAPP_KAPSO_TEMPLATES', '{}'], ['DIR3COM_WHATSAPP_KAPSO_TEMPLATES', '[]'],
    ['DIR3COM_WHATSAPP_KAPSO_TEMPLATES', JSON.stringify({ 'customer.created.ar': { name: 'other', languageCode: 'ar' } })],
    ['DIR3COM_WHATSAPP_KAPSO_TEMPLATES', JSON.stringify({ 'operations.created.ar': { name: 'other', languageCode: 'en_US' } })],
  ]) assert.equal(api.kapsoConfig({ ...env, [key]: value }), null, key);
});
test('disabled, unauthorized and unconfigured route never reaches store/provider', async () => {
  assert.equal((await api.handleKapsoDispatch(request(), {}, failStore, failFetch)).status, 404);
  assert.equal((await api.handleKapsoDispatch(request('wrong'), env, failStore, failFetch)).status, 401);
  assert.equal((await api.handleKapsoDispatch(request(), { ...env, KAPSO_API_KEY: '' }, failStore, failFetch)).status, 503);
  assert.equal((await api.handleKapsoDispatch(request(), { ...env, DIR3COM_WHATSAPP_CATEGORIES: '' }, failStore, failFetch)).status, 503);
  assert.equal((await api.handleKapsoDispatch(request(), env, () => null, failFetch)).status, 503);
});
test('approved template transport uses fixed Kapso host and captured recipient/reference', async () => {
  const result = await api.sendKapsoTemplate(config, item, async (url, init) => {
    assert.equal(url, `https://api.kapso.ai/meta/whatsapp/v24.0/${env.KAPSO_PHONE_NUMBER_ID}/messages`);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.method, 'POST'); assert.equal(init?.cache, 'no-store');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, item.phone.slice(1)); assert.equal(body.type, 'template'); assert.equal(body.text, undefined);
    assert.equal(body.template.name, config.templates['operations.created.ar']!.name); assert.equal(body.template.language.code, 'ar');
    assert.deepEqual(body.template.components[0].parameters, [{ type: 'text', text: item.reference }, { type: 'text', text: `${env.DIR3COM_WHATSAPP_SITE_URL}/admin/operations/drive?language=ar` }]);
    return accepted();
  });
  assert.equal(result.outcome, 'accepted'); assert.equal(result.sid, sid);
});
test('English language can be configured alone without Arabic or customer categories', async () => {
  const english = api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'operations.created.en': { name: 'isolated_operations_en', languageCode: 'en_US' } }) })!;
  assert.ok(english); assert.equal(english.templates['operations.created.ar'], undefined);
  assert.equal((await api.sendKapsoTemplate(english, { ...item, language: 'en' }, async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).template.language.code, 'en_US'); return accepted();
  })).outcome, 'accepted');
});
test('other categories and missing language cannot reach network or durable send intent', async () => {
  for (const row of [{ ...item, audience: 'customer' as const }, { ...item, action: 'customer_accept' as const }, { ...item, language: 'en' as const }]) {
    assert.equal((await api.sendKapsoTemplate(config, row, failFetch)).outcome, 'failed');
    const mock = store(true, true, row); assert.equal(await api.dispatchKapsoOne(mock.db, config, failFetch), 'not_sent');
    assert.equal(mock.calls.length, 1);
  }
});
test('durable sender binding and lease must precede network; lost persistence never resends', async () => {
  const mock = store(); let sends = 0;
  assert.equal(await api.dispatchKapsoOne(mock.db, config, async () => {
    assert.deepEqual(mock.calls.map(x => x.name), ['claim_drive_whatsapp', 'begin_kapso_drive_whatsapp']);
    assert.equal(mock.calls[1].args?.p_phone_number_id, env.KAPSO_PHONE_NUMBER_ID); sends++; return accepted();
  }), 'accepted');
  assert.equal(sends, 1); assert.equal(mock.calls[2].args?.p_token, item.token); assert.equal(mock.calls[2].args?.p_sid, sid);
  const routed = await api.handleKapsoDispatch(request(), env, () => store().db, async () => accepted());
  assert.deepEqual(await routed.json(), { result: 'accepted' });
  assert.equal(routed.headers.get('cache-control'), 'no-store');
  await assert.rejects(api.dispatchKapsoOne(store(true, false).db, config, async () => accepted()), /RESULT_PERSISTENCE_UNCONFIRMED/);
  assert.equal(await api.dispatchKapsoOne(store(false).db, config, failFetch), 'not_sent');
  assert.equal(await api.dispatchKapsoOne(store(true, true, null).db, config, failFetch), 'idle');
  await assert.rejects(api.dispatchKapsoOne(store(true, true, { ...item, token: 'forged' }).db, config, failFetch), /INVALID_CLAIM/);
});
test('429, server failure, timeout, malformed and mismatched acceptance stay unknown', async () => {
  const responses = [
    new Response('{"code":20429}', { status: 429 }), new Response('{}', { status: 503 }), new Response('{}', { status: 400 }),
    new Response('invalid', { status: 200 }), new Response('x'.repeat(32_769), { status: 200 }),
    accepted({ contacts: [{ input: '10000000099', wa_id: '10000000099' }] }), accepted({ messages: [{ id: 'SM' + '1'.repeat(32) }] }),
    accepted({ messages: [{ id: sid }, { id: 'wamid.OTHER' }] }), accepted({ messages: [{ id: sid, message_status: 'failed' }] }),
  ];
  for (const response of responses) assert.equal((await api.sendKapsoTemplate(config, item, async () => response)).outcome, 'unknown');
  assert.equal((await api.sendKapsoTemplate(config, item, async () => { throw new Error('timeout'); })).outcome, 'unknown');
});
test('authenticated raw JSON receipt remains active when outbound disabled; unsigned event header is ignored', async () => {
  const mock = store(); const result = await api.receiveKapsoReceipt(receipt(), { ...env, DIR3COM_WHATSAPP_ENABLED: 'false' }, () => mock.db);
  assert.equal(result.status, 200); assert.equal(mock.calls[0].args?.p_state, 'delivered');
  assert.equal(mock.calls[0].args?.p_sid, sid); assert.equal(mock.calls[0].args?.p_phone, item.phone);
});
test('signature binds exact raw bytes before database lookup', async () => {
  assert.equal((await api.receiveKapsoReceipt(receipt(undefined, 'x'), env, failStore)).status, 403);
  const raw = JSON.stringify(payload()); const signature = crypto.createHmac('sha256', env.KAPSO_WEBHOOK_SECRET).update(raw).digest('hex');
  assert.equal((await api.receiveKapsoReceipt(receipt(raw + ' ', signature), env, failStore)).status, 403);
  assert.equal((await api.receiveKapsoReceipt(receipt('x'.repeat(32_769)), env, failStore)).status, 400);
  assert.equal((await api.receiveKapsoReceipt(receipt('not-json'), env, failStore)).status, 400);
});
test('foreign sender, inbound, passive, unknown ID/recipient and category cannot mutate receipts', async () => {
  for (const body of [
    payload({ phone_number_id: '10000000000999' }), payload({ message: { id: sid, to: item.phone.slice(1), kapso: { direction: 'inbound', status: 'delivered' } } }),
    payload({ message: { id: sid, to: item.phone.slice(1), kapso: { direction: 'outbound', status: 'delivered', passive: true } } }),
    payload({ message: { id: '../other', to: item.phone.slice(1), kapso: { direction: 'outbound', status: 'read' } } }),
    payload({ message: { id: sid, to: 'US.123', kapso: { direction: 'outbound', status: 'read' } } }),
    payload({ message: { id: sid, to: item.phone.slice(1), kapso: { direction: 'outbound', status: 'received' } } }),
  ]) assert.equal((await api.receiveKapsoReceipt(receipt(JSON.stringify(body)), env, failStore)).status, 400);
  assert.equal((await api.receiveKapsoReceipt(receipt(undefined, undefined, 'https://qa.example.invalid/api/webhooks/kapso/drive-whatsapp?override=true'), env, failStore)).status, 400);
});
test('unbound callback races request retry; database failure never acknowledges delivery', async () => {
  assert.equal((await api.receiveKapsoReceipt(receipt(), env, () => store(true, false).db)).status, 409);
  assert.equal((await api.receiveKapsoReceipt(receipt(), env, () => ({ rpc: async () => ({ data: null, error: new Error('private database detail') }) }))).status, 503);
  assert.equal((await api.receiveKapsoReceipt(receipt(), { ...env, KAPSO_WEBHOOK_SECRET: '' }, failStore)).status, 503);
  assert.equal((await api.receiveKapsoReceipt(receipt(), env, () => null)).status, 503);
});

// Customer transport checks run the real adapter with synthetic RPC/HTTP boundaries.
// They do not simulate RLS or claim that a mock checks ownership/consent in PostgreSQL.
const customerActions = ['created', 'review', 'confirm', 'decline', 'customer_accept'] as const;
const customerTemplates = Object.fromEntries(customerActions.flatMap(action => (['ar', 'en'] as const).map(language =>
  [`customer.${action}.${language}`, { name: `isolated_customer_${action}_${language}`, languageCode: language === 'ar' ? 'ar' : 'en_US' }])));
const customerEnv = { ...env, DIR3COM_WHATSAPP_CATEGORIES: customerActions.map(action => `customer.${action}`).join(','),
  DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify(customerTemplates) };
const customerConfig = api.kapsoConfig(customerEnv)!;

test('customer categories require explicit allowlist and category-specific approved template', () => {
  assert.ok(customerConfig);
  for (const categories of ['', 'customer.confirm,customer.confirm', 'customer.confirm, customer.review',
    'operations.customer_accept', 'customer.unknown', 'customer.confirm,', 'customer.confirm,customer.review']) {
    const templates = { 'customer.confirm.ar': customerTemplates['customer.confirm.ar'] };
    assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_CATEGORIES: categories,
      DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify(templates) }), null, categories);
  }
  for (const key of ['customer.confirm.en', 'customer.confirm.ar', 'customer.confirm.fr']) {
    assert.equal(api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_CATEGORIES: 'customer.confirm',
      DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ [key]: { name: 'isolated_quote', languageCode: 'fr' } }) }), null);
  }
  assert.equal(api.kapsoConfig({ ...customerEnv, DIR3COM_WHATSAPP_ENABLED: undefined }), null);
  const combined = api.kapsoConfig({ ...customerEnv, DIR3COM_WHATSAPP_CATEGORIES: 'operations.created,' + customerEnv.DIR3COM_WHATSAPP_CATEGORIES,
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ ...customerTemplates, 'operations.created.ar': { name: 'isolated_operations', languageCode: 'ar' } }) });
  assert.ok(combined);
});

for (const action of customerActions) for (const language of ['ar', 'en'] as const) {
  test(`customer ${action}/${language} uses its captured recipient, category template and private request link`, async () => {
    const row: OutboxItem = { ...item, audience: 'customer', action, language, phone: '+10000000001' };
    const mock = store(true, true, row); let sends = 0;
    assert.equal(await api.dispatchKapsoOne(mock.db, customerConfig, async (_url, init) => {
      sends++;
      assert.equal(mock.calls[1].name, 'begin_kapso_drive_whatsapp');
      assert.equal(mock.calls[1].args?.p_id, row.id); assert.equal(mock.calls[1].args?.p_token, row.token);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.to, row.phone.slice(1)); assert.equal(body.text, undefined); assert.equal(body.type, 'template');
      assert.equal(body.template.name, customerTemplates[`customer.${action}.${language}`].name);
      assert.equal(body.template.language.code, language === 'ar' ? 'ar' : 'en_US');
      assert.deepEqual(body.template.components[0].parameters, [{ type: 'text', text: row.reference },
        { type: 'text', text: `${env.DIR3COM_WHATSAPP_SITE_URL}/my-requests/${row.reference}/drive?language=${language}` }]);
      return accepted({ contacts: [{ input: row.phone.slice(1), wa_id: row.phone.slice(1) }] });
    }), 'accepted');
    assert.equal(sends, 1); assert.equal(mock.calls[2].args?.p_sid, sid);
  });
}

test('customer revoked eligibility or superseded quote RPC rejection prevents any transport', async () => {
  for (const action of customerActions) {
    const mock = store(false, true, { ...item, audience: 'customer', action });
    assert.equal(await api.dispatchKapsoOne(mock.db, customerConfig, failFetch), 'not_sent');
    assert.deepEqual(mock.calls.map(call => call.name), ['claim_drive_whatsapp', 'begin_kapso_drive_whatsapp']);
  }
});
test('customer category or language absent from approved runtime config cannot begin a send', async () => {
  const arQuote = api.kapsoConfig({ ...env, DIR3COM_WHATSAPP_CATEGORIES: 'customer.confirm',
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({ 'customer.confirm.ar': customerTemplates['customer.confirm.ar'] }) })!;
  for (const row of [{ ...item, audience: 'customer' as const, action: 'confirm' as const, language: 'en' as const },
    { ...item, audience: 'customer' as const, action: 'review' as const }, item]) {
    const mock = store(true, true, row);
    assert.equal(await api.dispatchKapsoOne(mock.db, arQuote, failFetch), 'not_sent'); assert.equal(mock.calls.length, 1);
  }
});
test('invalid customer claim and provider recipient mismatch fail closed', async () => {
  const row: OutboxItem = { ...item, audience: 'customer', action: 'confirm', phone: '+10000000001' };
  for (const invalid of [{ ...row, reference: '../../other' }, { ...row, phone: 'arbitrary' }, { ...row, token: 'forged' }]) {
    await assert.rejects(api.dispatchKapsoOne(store(true, true, invalid).db, customerConfig, failFetch), /INVALID_CLAIM/);
    assert.equal((await api.sendKapsoTemplate(customerConfig, invalid, failFetch)).outcome, 'failed');
  }
  assert.equal((await api.sendKapsoTemplate(customerConfig, row, async () => accepted())).outcome, 'unknown');
});
test('customer duplicate worker attempt respects begin-send fencing and unknown never retries in transport', async () => {
  const row: OutboxItem = { ...item, audience: 'customer', action: 'confirm' };
  let started = false; let sends = 0;
  const db: NotificationStore = { async rpc(name) {
    if (name === 'claim_drive_whatsapp') return { data: row, error: null };
    if (name === 'begin_kapso_drive_whatsapp') { const allowed = !started; started = true; return { data: allowed, error: null }; }
    return { data: true, error: null };
  } };
  const fetcher: typeof fetch = async () => { sends++; throw new Error('isolated response lost'); };
  assert.equal(await api.dispatchKapsoOne(db, customerConfig, fetcher), 'unknown');
  assert.equal(await api.dispatchKapsoOne(db, customerConfig, failFetch), 'not_sent'); assert.equal(sends, 1);
});
