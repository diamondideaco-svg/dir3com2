import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Subject from '../lib/notifications/drive-whatsapp';

const exports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync('lib/notifications/drive-whatsapp.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Buffer, URL, URLSearchParams, Response, Request, AbortSignal, fetch,
  require(name: string) { if (name === 'server-only') return {}; if (name === 'node:crypto') return crypto; throw new Error(name); } });
const api = exports as unknown as typeof Subject;
// Synthetic local fixtures. No provider calls or actual recipients.
const env: Record<string, string> = {
  DIR3COM_WHATSAPP_ENABLED: 'true', TWILIO_ACCOUNT_SID: 'AC' + '1'.repeat(32), TWILIO_AUTH_TOKEN: 'isolated-not-a-credential'.repeat(2),
  TWILIO_MESSAGING_SERVICE_SID: 'MG' + '2'.repeat(32), DIR3COM_WHATSAPP_FROM: '+15005550006',
  DIR3COM_WHATSAPP_CALLBACK_URL: 'https://qa.example.invalid/api/webhooks/twilio/whatsapp',
  DIR3COM_WHATSAPP_SITE_URL: 'https://qa.example.invalid', DIR3COM_WHATSAPP_WORKER_SECRET: 'isolated-worker-token'.repeat(3),
};
const templates: Record<string, string> = {};
for (const audience of ['customer', 'operations']) for (const action of audience === 'customer' ? ['created', 'review', 'confirm', 'decline', 'customer_accept'] : ['created', 'customer_accept']) {
  for (const language of ['ar', 'en']) templates[`${audience}.${action}.${language}`] = 'HX' + '3'.repeat(32);
}
env.DIR3COM_WHATSAPP_TEMPLATE_SIDS = JSON.stringify(templates);
const config = api.senderConfig(env)!;
const item: Subject.OutboxItem = { id: '00000000-0000-4000-8000-000000000166', token: '00000000-0000-4000-8000-000000000167',
  phone: '+10000000000', reference: 'REQ-ISOLATED166', audience: 'customer', action: 'confirm', language: 'ar' };
const sid = 'SM' + '4'.repeat(32);
const failFetch: typeof fetch = async () => { assert.fail('Unexpected network call'); };
const noStore = () => { assert.fail('Unexpected database access'); };
const request = () => new Request('https://qa.example.invalid/api/internal/drive-whatsapp/dispatch', {
  method: 'POST', headers: { authorization: `Bearer ${env.DIR3COM_WHATSAPP_WORKER_SECRET}` },
});
function accepted() { return new Response(JSON.stringify({ sid, account_sid: config.accountSid, to: `whatsapp:${item.phone}`, from: `whatsapp:${config.from}`, status: 'queued' }), { status: 201 }); }
function store(start: unknown = true, finish: unknown = true) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const db: Subject.NotificationStore = { async rpc(name, args) {
    calls.push({ name, args });
    return { data: name === 'claim_drive_whatsapp' ? item : name === 'begin_drive_whatsapp' ? start : finish, error: null };
  } };
  return { db, calls };
}

test('disabled, unauthorized and unconfigured dispatch cannot touch store or provider', async () => {
  assert.equal((await api.handleDispatch(request(), {}, noStore, failFetch)).status, 404);
  assert.equal((await api.handleDispatch(new Request(request().url, { method: 'POST' }), env, noStore, failFetch)).status, 401);
  assert.equal((await api.handleDispatch(request(), { ...env, TWILIO_AUTH_TOKEN: '' }, noStore, failFetch)).status, 503);
  assert.equal((await api.handleDispatch(request(), { ...env, DIR3COM_WHATSAPP_TEMPLATE_SIDS: '{}' }, noStore, failFetch)).status, 503);
});
test('configuration is HTTPS, complete, and rejects credentials in URLs or missing templates', () => {
  assert.ok(config);
  for (const [key, value] of [
    ['DIR3COM_WHATSAPP_CALLBACK_URL', 'http://qa.example.invalid/api/webhooks/twilio/whatsapp'],
    ['DIR3COM_WHATSAPP_CALLBACK_URL', env.DIR3COM_WHATSAPP_CALLBACK_URL + '?override=1'],
    ['DIR3COM_WHATSAPP_SITE_URL', 'https://user:password@qa.example.invalid/'],
    ['TWILIO_ACCOUNT_SID', 'arbitrary/path'], ['DIR3COM_WHATSAPP_FROM', '0500000000'],
    ['TWILIO_MESSAGING_SERVICE_SID', ''], ['DIR3COM_WHATSAPP_TEMPLATE_SIDS', '[]'],
  ]) assert.equal(api.senderConfig({ ...env, [key]: value }), null, key);
});
test('actual send builds approved template with correct recipient and no booking assertion', async () => {
  for (const language of ['ar', 'en'] as const) for (const audience of ['customer', 'operations'] as const) {
    const row = { ...item, language, audience, action: audience === 'operations' ? 'created' as const : 'confirm' as const };
    const result = await api.sendTemplate(config, row, async (url, init) => {
      assert.equal(url, `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`);
      assert.equal(init?.redirect, 'error'); assert.equal(init?.method, 'POST');
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('To'), 'whatsapp:' + item.phone); assert.equal(body.has('Body'), false);
      assert.equal(body.get('ContentSid'), templates[`${audience}.${row.action}.${language}`]);
      assert.equal(body.get('StatusCallback'), api.callbackUrl(config, item));
      const variables = JSON.parse(body.get('ContentVariables')!);
      assert.equal(variables['1'], item.reference);
      assert.equal(variables['2'], config.siteUrl + (audience === 'customer' ? `/my-requests/${item.reference}/drive` : '/admin/operations/drive') + `?language=${language}`);
      return accepted();
    });
    assert.equal(result.outcome, 'accepted');
  }
});
test('claim and durable send intent precede network, and lost write never triggers resend', async () => {
  const { db, calls } = store(); let sent = 0;
  const result = await api.dispatchOne(db, config, async () => {
    assert.deepEqual(calls.map(c => c.name), ['claim_drive_whatsapp', 'begin_drive_whatsapp']); sent++; return accepted();
  });
  assert.equal(result, 'accepted'); assert.equal(sent, 1);
  assert.equal(calls[2].args?.p_token, item.token); assert.equal(calls[2].args?.p_sid, sid);
  const failed = store(true, false);
  await assert.rejects(api.dispatchOne(failed.db, config, async () => { sent++; return accepted(); }), /RESULT_PERSISTENCE_UNCONFIRMED/);
  assert.equal(sent, 2);
});
test('lost, revoked or superseded claim cannot send', async () => {
  assert.equal(await api.dispatchOne(store(false).db, config, failFetch), 'not_sent');
  assert.equal(await api.dispatchOne({ rpc: async () => ({ data: null, error: null }) }, config, failFetch), 'idle');
  for (const patch of [{ token: 'bad' }, { phone: '01500000000' }, { reference: '../other' }, { audience: 'operations', action: 'confirm' }]) {
    assert.equal(api.parseOutboxItem({ ...item, ...patch }), null);
  }
});
test('ambiguous provider outcomes become unknown; only confirmed 20429 permits retry', async () => {
  for (const [status, data, expected] of [
    [429, { code: 20429 }, 'retry'], [429, { code: 999 }, 'unknown'], [500, { code: 20429 }, 'unknown'],
    [400, { code: 21614 }, 'failed'], [401, { code: 20003 }, 'failed'],
    [201, { sid, account_sid: 'wrong' }, 'unknown'], [302, {}, 'unknown'],
  ] as const) assert.equal((await api.sendTemplate(config, item, async () => new Response(JSON.stringify(data), { status }))).outcome, expected);
  assert.equal((await api.sendTemplate(config, item, async () => { throw new Error('PRIVATE_TRANSPORT_ERROR'); })).outcome, 'unknown');
  assert.equal((await api.sendTemplate(config, item, async () => new Response('x'.repeat(33_000), { status: 201 }))).outcome, 'unknown');
});
test('worker errors never expose contacts, credentials or database/provider errors', async () => {
  const response = await api.handleDispatch(request(), env, () => ({ rpc: async () => { throw new Error(item.phone + config.authToken); } }), failFetch);
  assert.equal(response.status, 503); assert.equal(await response.text(), '{"error":"DISPATCH_UNCONFIRMED"}');
});

function receipt(fields: Record<string, string> = {}, suffix = '') {
  const values = { AccountSid: config.accountSid, From: 'whatsapp:' + config.from, To: 'whatsapp:' + item.phone, MessageSid: sid, MessageStatus: 'delivered', FutureField: 'must be signed', ...fields };
  const url = api.callbackUrl(config, item) + suffix;
  const signature = crypto.createHmac('sha1', config.authToken).update(url + Object.keys(values).sort().map(k => k + values[k as keyof typeof values]).join('')).digest('base64');
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body: new URLSearchParams(values) });
}
test('signed receipt persists exact message/recipient/attempt even with outbound kill switch off', async () => {
  let calls = 0;
  const response = await api.receiveReceipt(receipt(), { ...env, DIR3COM_WHATSAPP_ENABLED: 'false' }, () => ({ async rpc(name, args) {
    calls++; assert.equal(name, 'record_drive_whatsapp_receipt'); assert.equal(args?.p_phone, item.phone);
    assert.equal(args?.p_sid, sid); assert.equal(args?.p_token, item.token); assert.equal(args?.p_state, 'delivered');
    return { data: true, error: null };
  } }));
  assert.equal(response.status, 204); assert.equal(calls, 1);
});
test('forged signature, extra query and changed future field fail before privileged access', async () => {
  const original = receipt();
  const changed = new Request(original.url, { method: 'POST', headers: original.headers, body: (await original.text()).replace('must+be+signed', 'changed') });
  assert.equal((await api.receiveReceipt(changed, env, noStore)).status, 403);
  const forged = receipt(); forged.headers.set('x-twilio-signature', 'forged');
  assert.equal((await api.receiveReceipt(forged, env, noStore)).status, 403);
  assert.equal((await api.receiveReceipt(receipt({}, '&extra=1'), env, noStore)).status, 400);
  assert.equal((await api.receiveReceipt(receipt({}, '&id=' + item.id), env, noStore)).status, 400);
});
test('valid signature cannot substitute a different account/sender or invalid status', async () => {
  const cases: Record<string, string>[] = [{ AccountSid: 'AC' + '9'.repeat(32) }, { From: 'whatsapp:+10000000001' }, { To: 'email:bad' }, { MessageStatus: 'booked' }, { MessageSid: 'bad' }, { ErrorCode: 'PRIVATE_ERROR' }];
  for (const fields of cases) {
    assert.equal((await api.receiveReceipt(receipt(fields), env, noStore)).status, 400);
  }
});
test('unmatched message is not acknowledged as delivered; database outage prompts callback retry', async () => {
  assert.equal((await api.receiveReceipt(receipt(), env, () => ({ rpc: async () => ({ data: false, error: null }) }))).status, 409);
  const response = await api.receiveReceipt(receipt(), env, () => ({ rpc: async () => ({ data: null, error: 'PRIVATE_DB_ERROR' }) }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_DB_ERROR/);
});
test('webhook bounds body and rejects duplicate form fields', async () => {
  const base = receipt();
  assert.equal((await api.receiveReceipt(new Request(base.url, { method: 'POST', headers: base.headers, body: 'x'.repeat(16_385) }), env, noStore)).status, 413);
  const body = await base.text();
  assert.equal((await api.receiveReceipt(new Request(base.url, { method: 'POST', headers: base.headers, body: body + '&MessageSid=' + sid }), env, noStore)).status, 400);
});
