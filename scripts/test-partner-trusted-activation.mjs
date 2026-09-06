import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, process: { env: {} }, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
const logger = { logServerError() {}, logServerEvent() {} };

const profileActor = { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Test Partner', email: 'partner@example.invalid', authRole: 'partner' };
// Stateful mock deliberately models the old upsert demotion, not just call counts.
function partnerHarness({ status = 'active', readError = false, missing = false, race = false, rereadError = false, conflictWithoutRow = false, insertError = null } = {}) {
  let row = missing ? null : { id: profileActor.userId, status, country: '', city: '' };
  let reads = 0;
  const writes = [];
  const client = { from(table) {
    assert.equal(table, 'partners');
    let operation; let payload;
    const chain = {
      select() { return chain; },
      eq(column, value) { assert.equal(column, 'id'); assert.equal(value, profileActor.userId); return chain; },
      async maybeSingle() {
        reads++;
        if (readError || (rereadError && reads > 1)) return { data: null, error: { code: '57014', message: 'private read timeout' } };
        return { data: row && { ...row }, error: null };
      },
      insert(input) { operation = 'insert'; payload = input; return chain; },
      upsert(input) { operation = 'upsert'; payload = input; return chain; },
      update(input) { operation = 'update'; payload = input; return chain; },
      async single() {
        writes.push({ operation, payload });
        if (race && (operation === 'insert' || operation === 'upsert')) row = { id: profileActor.userId, status, country: '', city: '' };
        if (operation === 'insert') {
          if (row || conflictWithoutRow) return { data: null, error: { code: '23505', message: 'private unique conflict' } };
          if (insertError) return { data: null, error: insertError };
        }
        row = { ...row, ...payload };
        return { data: { ...row }, error: null };
      },
    };
    return chain;
  } };
  const server = load('lib/partner-portal/server.ts', {
    '@/lib/supabase/server': { supabaseAdmin: client },
    '@/lib/auth/identity': {}, '@/lib/partner-portal/domain': {},
  });
  const route = load('app/api/partner-portal/profile/route.ts', {
    'next/server': next, '@/lib/security/safe-logger': logger,
    '@/lib/partner-portal/server': { ...server, requirePortalActor: async () => profileActor },
    '@/lib/supabase/server': { supabaseAdmin: client },
  });
  return { server, route, writes, row: () => row, reads: () => reads };
}

for (const status of ['active', 'approved', 'suspended', 'rejected', 'archived', 'under_review']) {
  test(`${status}: failed SELECT stops real profile PUT without lifecycle or profile writes`, async () => {
    const h = partnerHarness({ status, readError: true });
    const result = await h.route.PUT({ json: async () => ({ companyName: 'Edited', status: 'pending' }) });
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, 'PORTAL_PROFILE_UPDATE_FAILED');
    assert.doesNotMatch(JSON.stringify(result.body), /private|57014/);
    assert.equal(h.writes.length, 0);
    assert.equal(h.row().status, status);
    await assert.rejects(h.server.ensurePartnerRecord(profileActor), /PARTNER_PORTAL_PARTNER_READ_FAILED/);
    assert.equal(h.writes.length, 0);
  });
  test(`${status}: ordinary profile PUT preserves authoritative lifecycle`, async () => {
    const h = partnerHarness({ status });
    const result = await h.route.PUT({ json: async () => ({ companyName: 'Edited', status: 'pending', reviewStatus: 'Draft' }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.status, status);
    assert.equal(h.row().status, status);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].operation, 'update');
    assert.equal(Object.hasOwn(h.writes[0].payload, 'status'), false);
  });
  test(`${status}: concurrent create conflict rereads without overwriting lifecycle`, async () => {
    const h = partnerHarness({ status, missing: true, race: true });
    assert.equal((await h.server.ensurePartnerRecord(profileActor)).status, status);
    assert.equal(h.row().status, status);
    assert.equal(h.reads(), 2);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].operation, 'insert');
  });
}
test('genuinely missing partner is created once with canonical pending status', async () => {
  const h = partnerHarness({ missing: true });
  const result = await h.server.ensurePartnerRecord(profileActor);
  assert.equal(result.id, profileActor.userId);
  assert.equal(result.status, 'pending');
  assert.equal(result.shield_level, 'basic');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].operation, 'insert');
});
test('create conflict reread failure or absent owner fails closed without another write', async () => {
  for (const options of [{ race: true, rereadError: true }, { conflictWithoutRow: true }]) {
    const h = partnerHarness({ missing: true, ...options });
    await assert.rejects(h.server.ensurePartnerRecord(profileActor), /PARTNER_PORTAL_PARTNER_(READ_FAILED|CREATE_FAILED)/);
    assert.equal(h.reads(), 2);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].operation, 'insert');
    if (options.race) assert.equal(h.row().status, 'active');
  }
});
test('ordinary insert failure does not retry or expose database diagnostics', async () => {
  const h = partnerHarness({ missing: true, insertError: { code: '42501', message: 'private denied' } });
  await assert.rejects(h.server.ensurePartnerRecord(profileActor), /^Error: PARTNER_PORTAL_PARTNER_CREATE_FAILED$/);
  assert.equal(h.reads(), 1);
  assert.equal(h.writes.length, 1);
  assert.equal(h.row(), null);
});

test('profile PUT ignores every lifecycle field; active status is never overwritten', async () => {
  for (const requested of ['approved','active','suspended','rejected','archived','under_review','pending','inactive']) {
    let write;
    const chain = { update(input) { write = input; return chain; }, eq() { return chain; }, select() { return chain; },
      async single() { return { data: { status: 'active', country: '', city: '' }, error: null }; } };
    const route = load('app/api/partner-portal/profile/route.ts', {
      'next/server': next,
      '@/lib/partner-portal/server': { requirePortalActor: async () => ({ userId: 'owner', authRole: 'partner', email: '' }), ensurePartnerRecord: async () => ({ id: 'owner', status: 'active' }) },
      '@/lib/supabase/server': { supabaseAdmin: { from: (table) => { assert.equal(table,'partners'); return chain; } } },
      '@/lib/security/safe-logger': logger,
    });
    const result = await route.PUT({ json: async () => ({ reviewStatus: requested, status: requested, partnerId: 'foreign', companyName: 'Owner company' }) });
    assert.equal(result.status,200);
    assert.equal(result.body.data.status,'active');
    assert.equal(Object.hasOwn(write,'status'),false);
    assert.equal(Object.hasOwn(write,'reviewStatus'),false);
    assert.equal(Object.hasOwn(write,'partnerId'),false);
  }
});

test('request route maps only canonical actor denial to 403; ownership and unexpected errors retain contracts', async () => {
  for (const [method, message, status, code] of [
    ['GET','PARTNER_REQUEST_ACTOR_DENIED',403,'PARTNER_NOT_ACTIVE'],
    ['POST','PARTNER_HANDOFF_ACTOR_DENIED',403,'PARTNER_NOT_ACTIVE'],
    ['POST','REQUEST_NOT_FOUND',404,'REQUEST_NOT_FOUND'],
    ['POST','REQUEST_PARTNER_SCOPE_DENIED',404,'REQUEST_NOT_FOUND'],
    ['GET','unexpected database failure',500,'PARTNER_REQUESTS_READ_FAILED'],
    ['GET',null,200,null],
  ]) {
    const route = load('app/api/partner-portal/requests/route.ts', {
      'next/server': next, '@/lib/security/safe-logger': logger,
      '@/lib/partner-portal/server': { requirePortalActor: async () => ({ userId:'trusted-owner',authRole:'partner' }), ensurePartnerRecord: async () => ({ status:'approved' }) },
      '@/lib/supabase/server': { supabaseAdmin: { async rpc(name,args) {
        assert.equal(args.p_actor_user_id,'trusted-owner');
        if (method==='POST') assert.equal(args.p_request_id,'foreign-existing-id');
        return { data: [], error: message ? { message } : null };
      } } },
    });
    const result = await route[method]({ json: async () => ({ requestId:'foreign-existing-id',actorId:'forged-admin' }) });
    assert.equal(result.status,status);
    if (code) assert.equal(result.body.error.code,code);
    else assert.deepEqual(Array.from(result.body.data),[]);
  }
});

const id = '11111111-1111-4111-8111-111111111111';
const form = (overrides={}) => {
  const values = { partnerId:id,expectedStatus:'approved',expectedUpdatedAt:'2026-09-06T00:00:00Z',confirmed:'true',reason:'Reviewed by administrator',reference:'review-1',...overrides };
  return { get: (key) => values[key] ?? null };
};
test('activation action uses admin guard and authenticated RPC, never caller actor', async () => {
  let guarded = false; let refreshed = 0;
  const action = load('lib/actions/partner-activation-actions.ts', {
    'next/cache': { revalidatePath() { refreshed++; } },
    '@/lib/auth/admin': { async requireAdminActionAccess() { guarded=true; return { supabase: { async rpc(name,args) {
      assert.ok(guarded); assert.equal(name,'activate_partner_with_attestation');
      assert.equal(args.p_partner_id,id); assert.equal(args.p_confirmed,true);
      assert.equal(Object.hasOwn(args,'p_actor_id'),false);
      return { data:'active',error:null };
    } } }; } },
  });
  assert.equal((await action.activatePartnerAction(form({ actorId:'forged' }))).ok,true);
  assert.equal(refreshed,2);
});
test('activation action rejects malformed/missing attestation and stale form before RPC', async () => {
  const action = load('lib/actions/partner-activation-actions.ts', {
    'next/cache': { revalidatePath() { assert.fail('unexpected refresh'); } },
    '@/lib/auth/admin': { async requireAdminActionAccess() { return { supabase: { rpc() { assert.fail('invalid request reached RPC'); } } }; } },
  });
  for (const fields of [{ confirmed:'false' },{ confirmed:null },{ reason:' ' },{ reason:'x'.repeat(1001) },{ expectedStatus:'pending' },{ expectedUpdatedAt:'' },{ partnerId:'wrong' }]) {
    assert.equal((await action.activatePartnerAction(form(fields))).ok,false);
  }
});
test('admin guard denial prevents RPC for staff, partner and unauthenticated callers', async () => {
  for (const denial of ['Forbidden','Unauthorized']) {
    const action = load('lib/actions/partner-activation-actions.ts', {
      'next/cache': {}, '@/lib/auth/admin': { async requireAdminActionAccess() { throw new Error(denial); } },
    });
    await assert.rejects(action.activatePartnerAction(form()),new RegExp(denial));
  }
});
test('activation errors are safe and conflicts do not claim success', async () => {
  const action = load('lib/actions/partner-activation-actions.ts', {
    'next/cache': { revalidatePath() { assert.fail('unexpected refresh'); } },
    '@/lib/auth/admin': { async requireAdminActionAccess() { return { supabase: { async rpc() { return { data:null,error:{code:'40001',message:'private SQL details'} }; } } }; } },
  });
  const result = await action.activatePartnerAction(form());
  assert.equal(result.ok,false); assert.equal(result.code,'STATE_CONFLICT');
  assert.doesNotMatch(JSON.stringify(result),/private SQL/);
});
test('AR/EN lifecycle denial is truthful, with no fake empty list or WhatsApp config failure', async () => {
  const state = load('components/portal/partner-request-list-state.ts', {});
  const result = await state.loadPartnerRequestList(async () => ({ status:403,ok:false,json:async()=>({error:{code:'PARTNER_NOT_ACTIVE'}}) }));
  assert.equal(result.status,'not_active');
  for (const language of ['ar','en']) {
    const presentation = state.getPartnerRequestListPresentation(result,language);
    assert.ok(presentation.lifecycleNotice); assert.equal(presentation.loadError,null);
    assert.equal(presentation.empty,null); assert.equal(presentation.whatsappNotConfigured,null);
  }
  assert.match(state.getPartnerRequestListPresentation(result,'en').lifecycleNotice,/awaiting admin activation/);
});
test('UI status is read-only; activation requires attestation and remains admin-only', () => {
  const portal = read('components/portal/PartnerProviderPortalClient.tsx');
  assert.doesNotMatch(portal,/reviewStatusOptions|reviewStatus:\s*profile.reviewStatus/);
  const panel = read('components/admin/PartnerActivation.tsx');
  assert.match(panel,/canActivate && status === 'approved'/);
  assert.match(panel,/type="checkbox" name="confirmed" value="true" required/);
  assert.match(panel,/name="reason" required/);
  assert.match(panel,/window.confirm/);
  assert.match(read('app/admin/partners/[id]/page.tsx'),/canActivate: isAdminRole\(role\)/);
});
