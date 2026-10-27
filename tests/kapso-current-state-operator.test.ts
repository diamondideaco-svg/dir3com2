import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import type * as Operator from '../lib/admin/drive-current-state-dispatch';
import type * as Sender from '../lib/notifications/kapso-drive-whatsapp';
import type * as Common from '../lib/notifications/drive-whatsapp';
import type * as Identity from '../lib/auth/identity';
import type * as Team from '../lib/auth/team-access';
import type * as Route from '../app/api/admin/drive-whatsapp/current-state/route';

function load<T>(path: string, dependencies: Record<string, unknown>, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Buffer, URL, Request, Response, AbortSignal, AbortController,
    setTimeout, clearTimeout, fetch: async () => assert.fail('External I/O forbidden'),
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name in dependencies) return dependencies[name];
      throw Error('Unexpected dependency: ' + name);
    }, ...globals });
  return exports as T;
}
const common = load<typeof Common>('lib/notifications/drive-whatsapp.ts', {});
const sender = load<typeof Sender>('lib/notifications/kapso-drive-whatsapp.ts', { './drive-whatsapp': common });
const identity = load<typeof Identity>('lib/auth/identity.ts', {});
const team = load<typeof Team>('lib/auth/team-access.ts', { '@/lib/auth/identity': identity });
const operator = load<typeof Operator>('lib/admin/drive-current-state-dispatch.ts', {
  '@/lib/notifications/drive-whatsapp': common, '@/lib/notifications/kapso-drive-whatsapp': sender,
});
const origin = 'https://qa.example.invalid';
const path = origin + '/api/admin/drive-whatsapp/current-state';
const target = { requestId: '00000000-0000-4000-8000-000000000111',
  outboxId: '00000000-0000-4000-8000-000000000222',
  recipientUserId: '00000000-0000-4000-8000-000000000333', category: 'customer.current_state', language: 'ar' };
const secret = 'SYNTHETIC-WORKER-SECRET-NOT-A-REAL-CREDENTIAL';
type Row = Record<string, unknown>;
function request(body: unknown = target, change: Record<string, string | null> = {}, method = 'POST', url = path) {
  const headers = new Headers({ origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' });
  for (const [key, value] of Object.entries(change)) { if (value === null) headers.delete(key); else headers.set(key, value); }
  return new Request(url, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
function fixture(audience: 'customer' | 'operations' = 'customer', language: 'ar' | 'en' = 'ar') {
  const boundTarget = { ...target, category: `${audience}.current_state`, language };
  let user: Row | null = { id: team.CEO_USER_ID, email: 'synthetic@example.invalid' };
  let profile: Row | null = { id: team.CEO_USER_ID, role: 'admin', status: 'active', deleted_at: null, full_name: 'Synthetic CEO' };
  let authError = false, profileError = false, denyBegin = false, lostFinish = false;
  let mode: 'accepted' | 'unknown' = 'accepted';
  let rowState = 'pending', posts = 0, authReads = 0;
  const calls: string[] = [];
  const env: Record<string, string | undefined> = {
    DIR3COM_WHATSAPP_ENABLED: 'true', DIR3COM_WHATSAPP_DISPATCH_MODE: 'target_only',
    DIR3COM_WHATSAPP_DELIVERY_MODE: 'webhook', DIR3COM_WHATSAPP_CATEGORIES: 'customer.current_state,operations.current_state',
    DIR3COM_WHATSAPP_WORKER_SECRET: secret, KAPSO_API_KEY: 'SYNTHETIC-NOT-A-PROVIDER-KEY',
    KAPSO_PHONE_NUMBER_ID: '10000000000166', KAPSO_WEBHOOK_SECRET: 'SYNTHETIC-SIGNING-NOT-A-REAL-SECRET-0000',
    DIR3COM_WHATSAPP_SITE_URL: origin,
    DIR3COM_WHATSAPP_KAPSO_TEMPLATES: JSON.stringify({
      'customer.current_state.ar': { name: 'synthetic_customer', languageCode: 'ar' },
      'operations.current_state.ar': { name: 'synthetic_operations', languageCode: 'ar' },
      'customer.current_state.en': { name: 'synthetic_customer', languageCode: 'en' },
      'operations.current_state.en': { name: 'synthetic_operations', languageCode: 'en' },
    }),
  };
  const store: Common.NotificationStore = { async rpc(name, args) {
    calls.push(name);
    if (name === 'claim_kapso_drive_whatsapp_target') {
      const matches = args?.p_request_id === boundTarget.requestId && args.p_outbox_id === boundTarget.outboxId
        && args.p_recipient_user_id === boundTarget.recipientUserId && args.p_category === boundTarget.category && args.p_language === boundTarget.language;
      if (!matches || rowState !== 'pending') return { data: null, error: null };
      rowState = 'claimed';
      return { data: { id: target.outboxId, token: '00000000-0000-4000-8000-000000000444',
        request_id: target.requestId, recipient_user_id: target.recipientUserId, audience, action: 'current_state',
        phone: '+10000000001', reference: 'REQ-SYNTHETIC', language }, error: null };
    }
    if (name === 'begin_kapso_current_state_notice') {
      assert.equal(args?.p_phone_number_id, env.KAPSO_PHONE_NUMBER_ID);
      assert.equal(JSON.stringify(args?.p_template), JSON.stringify({ name: `synthetic_${audience}`, languageCode: language }));
      if (denyBegin) return { data: false, error: null };
      rowState = 'sending'; return { data: true, error: null };
    }
    assert.equal(name, 'finish_drive_whatsapp', 'No stop, enrollment, general, query or gate RPC permitted');
    rowState = String(args?.p_outcome);
    return { data: !lostFinish, error: lostFinish ? Error('SYNTHETIC_PRIVATE_FAILURE') : null };
  } };
  const fetcher: typeof fetch = async (url, options) => {
    posts++;
    assert.equal(String(url), 'https://api.kapso.ai/meta/whatsapp/v24.0/10000000000166/messages');
    assert.equal(options?.redirect, 'error'); assert.equal(options?.cache, 'no-store');
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.to, '10000000001');
    assert.equal(payload.template.components[0].parameters[0].text, 'REQ-SYNTHETIC');
    assert.equal(payload.template.components[0].parameters[1].text,
      origin + (audience === 'customer' ? '/my-requests/REQ-SYNTHETIC/drive' : '/admin/operations/drive') + '?language=' + language);
    assert.equal(payload.template.language.code, language);
    if (mode === 'unknown') throw Error('SYNTHETIC_PRIVATE_TRANSPORT_FAILURE');
    return Response.json({ messaging_product: 'whatsapp', contacts: [{ input: '10000000001', wa_id: '10000000001' }], messages: [{ id: 'wamid.SYNTHETIC' }] });
  };
  const client = {
    auth: { getUser: async () => { authReads++; return { data: { user }, error: authError ? Error('SYNTHETIC_PRIVATE_AUTH_FAILURE') : null }; } },
    from(name: string) {
      assert.equal(name, 'profiles');
      const query = { select: () => query, eq: () => query, is: () => query,
        maybeSingle: async () => ({ data: profile, error: profileError ? Error('SYNTHETIC_PRIVATE_PROFILE_FAILURE') : null }) };
      return query;
    },
  };
  const route = load<typeof Route>('app/api/admin/drive-whatsapp/current-state/route.ts', {
    '@/lib/supabase/server': { createSupabaseServerClient: async () => client, supabaseAdmin: store },
    '@/lib/auth/team-access': team,
    '@/lib/admin/drive-current-state-dispatch': {
      dispatchCurrentStateAsOperator: (req: Request, ctx: Parameters<typeof operator.dispatchCurrentStateAsOperator>[1]) => operator.dispatchCurrentStateAsOperator(req, ctx, fetcher),
    },
  }, { process: { env } });
  return { run: route.POST, target: boundTarget, env, calls, posts: () => posts, authReads: () => authReads,
    actor: (u: Row | null, p: Row | null) => { user = u; profile = p; },
    authError: () => { authError = true; }, profileError: () => { profileError = true; },
    denyBegin: () => { denyBegin = true; }, unknown: () => { mode = 'unknown'; },
    lostFinish: () => { lostFinish = true; }, state: () => rowState };
}
async function code(response: Response, expected: string, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie, Origin');
  const raw = await response.text(); assert.deepEqual(JSON.parse(raw), { code: expected });
  assert.doesNotMatch(raw, /SYNTHETIC|wamid|Bearer|phone|token|recipient|requestId/i);
}

for (const [label, id, role, status, deleted] of [
  ['customer', 'other', 'customer', 'active', null], ['partner', 'other', 'partner', 'active', null],
  ['staff', 'other', 'staff', 'active', null], ['nonCEO admin', 'other', 'admin', 'active', null],
  ['inactive CEO', team.CEO_USER_ID, 'admin', 'inactive', null], ['deleted CEO', team.CEO_USER_ID, 'admin', 'active', '2026-01-01'],
  ['nonadmin CEO', team.CEO_USER_ID, 'staff', 'active', null], ['alias CEO', team.CEO_USER_ID, 'super_admin', 'active', null],
] as const) test(`${label} cannot dispatch even with a forged CEO contact/header`, async () => {
  const f = fixture(); f.actor({ id, email: team.CEO_EMAIL }, { id, role, status, deleted_at: deleted });
  await code(await f.run(request(target, { authorization: 'Bearer SYNTHETIC-FORGED', 'x-user-role': 'admin' })), 'FORBIDDEN', 403);
  assert.equal(f.posts(), 0); assert.deepEqual(f.calls, []);
});
test('anonymous and Auth/profile errors fail closed before privileged RPC', async () => {
  const anonymous = fixture(); anonymous.actor(null, null);
  const badAuth = fixture(); badAuth.authError(); const badProfile = fixture(); badProfile.profileError();
  for (const f of [anonymous, badAuth, badProfile]) { await code(await f.run(request()), 'FORBIDDEN', 403); assert.deepEqual(f.calls, []); }
});
test('a canonical profile identity mismatch is rejected', async () => {
  const f = fixture(); f.actor({ id: team.CEO_USER_ID }, { id: 'other', role: 'admin', status: 'active', deleted_at: null });
  await code(await f.run(request()), 'FORBIDDEN', 403); assert.deepEqual(f.calls, []);
});
const rejectedOrigins: Record<string, string | null>[] = [{ origin: null }, { origin: 'null' },
  { origin: 'https://attacker.example.invalid' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }];
for (const headers of rejectedOrigins) test(`origin/Fetch Metadata rejection ${JSON.stringify(headers)}`, async () => {
  const f = fixture(); await code(await f.run(request(target, headers)), 'ORIGIN_REJECTED', 403);
  assert.equal(f.authReads(), 0); assert.deepEqual(f.calls, []);
});
test('queries, GET and non-JSON cannot authorize a dispatch', async () => {
  const f = fixture();
  await code(await f.run(request(target, {}, 'POST', path + '?bypass=true')), 'ORIGIN_REJECTED', 403);
  await code(await f.run(request(target, {}, 'GET')), 'METHOD_NOT_ALLOWED', 405);
  await code(await f.run(request(target, { 'content-type': 'text/plain' })), 'INVALID_TARGET', 400);
  assert.equal(f.authReads(), 0); assert.deepEqual(f.calls, []);
});
for (const extra of ['phone', 'body', 'providerUrl', 'approval', 'scope', 'template', 'send_enabled', 'actor']) test(`arbitrary ${extra} input rejected`, async () => {
  const f = fixture(); await code(await f.run(request({ ...target, [extra]: 'SYNTHETIC' })), 'INVALID_TARGET', 400);
  assert.deepEqual(f.calls, []);
});
test('malformed, oversized and non-current-state selectors are rejected', async () => {
  for (const body of [null, [], {}, { ...target, outboxId: 'wrong' }, { ...target, category: 'operations.created' },
    { ...target, category: 'customer.created' }, { ...target, language: 'xx' }, 'x'.repeat(1100)]) {
    const f = fixture(); await code(await f.run(request(body)), 'INVALID_TARGET', 400); assert.deepEqual(f.calls, []);
  }
});
test('continuous/provider-query modes are not repurposed or stopped', async () => {
  for (const patch of [{ DIR3COM_WHATSAPP_DISPATCH_MODE: 'continuous' }, { DIR3COM_WHATSAPP_DELIVERY_MODE: 'provider_query' }]) {
    const f = fixture(); Object.assign(f.env, patch); const snapshot = JSON.stringify(f.env);
    await code(await f.run(request()), 'CURRENT_STATE_MODE_REQUIRED', 409);
    assert.deepEqual(f.calls, []); assert.equal(JSON.stringify(f.env), snapshot);
  }
});
test('disabled or missing worker binding cannot reach store or send', async () => {
  for (const patch of [{ DIR3COM_WHATSAPP_ENABLED: 'false' }, { DIR3COM_WHATSAPP_WORKER_SECRET: undefined }]) {
    const f = fixture(); Object.assign(f.env, patch);
    await code(await f.run(request()), 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503); assert.deepEqual(f.calls, []); assert.equal(f.posts(), 0);
  }
});
test('active CEO uses actual reviewed in-process target claim, intent, transport and finish without exposing credentials', async () => {
  const f = fixture(); const snapshot = JSON.stringify(f.env);
  await code(await f.run(request()), 'ACCEPTED_NOT_DELIVERED');
  assert.deepEqual(f.calls, ['claim_kapso_drive_whatsapp_target', 'begin_kapso_current_state_notice', 'finish_drive_whatsapp']);
  assert.equal(f.posts(), 1); assert.equal(f.state(), 'accepted'); assert.equal(JSON.stringify(f.env), snapshot);
});
test('different request, outbox, recipient, audience or language cannot change an authorized destination', async () => {
  for (const changed of [{ requestId: target.outboxId }, { outboxId: target.requestId }, { recipientUserId: target.requestId },
    { category: 'operations.current_state' }, { language: 'en' }]) {
    const f = fixture(); await code(await f.run(request({ ...target, ...changed })), 'IDLE_NO_RESEND');
    assert.equal(f.posts(), 0); assert.ok(!f.calls.includes('begin_kapso_current_state_notice'));
  }
});
test('denied atomic intent cannot send, cleanup or change working-service state', async () => {
  const f = fixture(); f.denyBegin(); const snapshot = JSON.stringify(f.env);
  await code(await f.run(request()), 'NOT_SENT'); assert.equal(f.posts(), 0); assert.equal(JSON.stringify(f.env), snapshot);
  assert.deepEqual(f.calls, ['claim_kapso_drive_whatsapp_target', 'begin_kapso_current_state_notice']);
});
test('concurrent operator calls and later retry retain one synthetic intent/send', async () => {
  const f = fixture(); const responses = await Promise.all([f.run(request()), f.run(request())]);
  const results = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(results.map(r => r.code).sort(), ['ACCEPTED_NOT_DELIVERED', 'IDLE_NO_RESEND']);
  await code(await f.run(request()), 'IDLE_NO_RESEND'); assert.equal(f.posts(), 1);
});
test('unknown provider outcome is not delivery and cannot be resent by retry', async () => {
  const f = fixture(); f.unknown(); await code(await f.run(request()), 'UNKNOWN_DO_NOT_RETRY');
  await code(await f.run(request()), 'IDLE_NO_RESEND'); assert.equal(f.posts(), 1); assert.equal(f.state(), 'unknown');
});
test('result-persistence ambiguity preserves intent, does not resend or stop service', async () => {
  const f = fixture(); f.lostFinish();
  await code(await f.run(request()), 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 503);
  await code(await f.run(request()), 'IDLE_NO_RESEND'); assert.equal(f.posts(), 1);
  assert.ok(f.calls.every(name => !/stop|open|prepare|reconcile|activate/.test(name)));
});
test('authority is re-evaluated on a subsequent request', async () => {
  const f = fixture(); await code(await f.run(request()), 'ACCEPTED_NOT_DELIVERED'); const count = f.calls.length;
  f.actor(null, null); await code(await f.run(request()), 'FORBIDDEN', 403); assert.equal(f.calls.length, count); assert.equal(f.posts(), 1);
});
test('existing default signed-webhook mode is preserved without adding a configuration requirement', async () => {
  const f = fixture(); delete f.env.DIR3COM_WHATSAPP_DELIVERY_MODE;
  await code(await f.run(request()), 'ACCEPTED_NOT_DELIVERED'); assert.equal(f.posts(), 1);
});
test('malformed raw JSON fails without privileged RPC or transport', async () => {
  const f = fixture();
  const req = new Request(path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' });
  await code(await f.run(req), 'INVALID_TARGET', 400); assert.deepEqual(f.calls, []); assert.equal(f.posts(), 0);
});
for (const [audience, language] of [['customer', 'en'], ['operations', 'ar'], ['operations', 'en']] as const) {
  test(`${audience}/${language} retains the approved target category, language and authenticated audience URL`, async () => {
    const f = fixture(audience, language);
    await code(await f.run(request(f.target)), 'ACCEPTED_NOT_DELIVERED'); assert.equal(f.posts(), 1);
  });
}
