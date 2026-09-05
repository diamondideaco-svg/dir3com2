import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import * as team from '../lib/auth/team-access';
import * as identity from '../lib/auth/identity';
import { loadTeamAccess } from '../lib/admin/team-access-data';

const ceo = team.CEO_USER_ID;
const employee = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
type Row = Record<string, unknown>;

// Execute the actual server modules with only external IO replaced. No action
// body or authorization predicate is copied into the test implementation.
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(compiled, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id), FormData, Date }, { filename: path });
  return exports as T;
}

function fixture(id: string | null = ceo, role = 'admin', status = 'active', email = 'renamed@example.invalid', deletedAt: string | null = null) {
  const actor = id ? { id, email, user_metadata: { role: 'admin', country_scope: ['EG', 'QA'] } } as unknown as User : null;
  const profiles: Row[] = id ? [{ id, role, status, email, deleted_at: deletedAt, full_name: 'Test User' }] : [];
  const grants: Row[] = [];
  const users: Row[] = [];
  const writes: { table: string; values: Row }[] = [];
  const filters: [string, string, unknown][] = [];
  const options = { queryError: false, tableError: null as { code: string } | null, functionError: null as { code: string } | null, writeError: null as {code:string;message:string} | null, inviteUser: { id: employee, email: 'employee@example.invalid' } as Row | null, invitations: 0 };
  const rpcCalls: {name:string;params:Row}[]=[];
  const client = {
    rpc: async (name:string,params:Row={}) => {
      if(name==='is_ceo_actor') return {data:false,error:options.functionError};
      rpcCalls.push({name,params});
      if(options.writeError) return {data:null,error:options.writeError};
      // This substitutes RPC IO only. Real conflict/transaction semantics are
      // exercised by the PostgreSQL suite, not inferred from this fake.
      const rows=grants.filter(row=>row.invited_user_id===params.p_user_id || team.normalizeEmail(row.email)===params.p_email);
      const grant=rows[0];
      if(name==='set_team_access_status') {
        if(!grant) return {data:null,error:{message:'TEAM_ACCESS_NOT_FOUND'}};
        if(grant.invited_user_id===ceo && (params.p_status!=='active'||grant.access_level!=='global_admin')) return {data:null,error:{message:'TEAM_ACCESS_CEO_PROTECTED'}};
        writes.push({table:'team_access_grants',values:{status:params.p_status}});
        writes.push({table:'profiles',values:{status:params.p_status}});
        return {data:grant.id,error:null};
      }
      const values={email:params.p_email,invited_user_id:params.p_user_id,job_title:params.p_job_title,access_level:params.p_access_level,country_scope:params.p_country_scope,permissions:params.p_permissions,status:'active'};
      if(grant) Object.assign(grant,values);
      else grants.push({id:`grant-${grants.length}`,created_by:id,...values});
      writes.push({table:'profiles',values:{id:params.p_user_id,role:params.p_access_level==='global_admin'?'admin':'staff'}});
      writes.push({table:'team_access_grants',values:grants.find(row=>row.invited_user_id===params.p_user_id)!});
      return {data:grants.find(row=>row.invited_user_id===params.p_user_id)?.id,error:null};
    },
    auth: {
      getUser: async () => ({ data: { user: actor }, error: null }),
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        inviteUserByEmail: async () => { options.invitations++; return { data: { user: options.inviteUser }, error: null }; },
      },
    },
    from(table: string) {
      const conditions: [string, unknown][] = [];
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: options.tableError ? null : grants, error: options.tableError }).then(resolve),
        eq: (column: string, value: unknown) => { filters.push([table, column, value]); conditions.push([column, value]); return chain; },
        is: (column: string, value: unknown) => { filters.push([table, column, value]); conditions.push([column, value]); return chain; },
        maybeSingle: async () => {
          if (options.queryError) return { data: null, error: new Error('query unavailable') };
          const rows = (table === 'profiles' ? profiles : grants).filter(row => conditions.every(([key, value]) => row[key] === value));
          return rows.length > 1 ? { data: null, error: new Error('multiple rows') } : { data: rows[0] ?? null, error: null };
        },
        upsert: async (values: Row, { onConflict }: { onConflict: string }) => {
          writes.push({ table, values });
          const rows = table === 'profiles' ? profiles : grants;
          const existing = rows.find(row => row[onConflict] === values[onConflict]);
          if (existing) Object.assign(existing, values);
          else rows.push({ id: `${table}-${rows.length}`, ...values });
          return { error: null };
        },
        update: (values: Row) => {
          writes.push({ table, values });
          return { eq: async () => ({ error: null }) };
        },
      };
      return chain;
    },
  };
  const supabase = client as unknown as SupabaseClient;
  const admin = load<typeof import('../lib/auth/admin')>('lib/auth/admin.ts', {
    'server-only': {},
    '@/lib/auth/identity': identity,
    '@/lib/auth/team-access': team,
    '@/lib/supabase/server': { createSupabaseServerClient: async () => supabase, supabaseAdmin: supabase },
    'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); }, redirect: () => { throw new Error('LOGIN_REQUIRED'); } },
  });
  const actions = load<typeof import('../lib/actions/team-access-actions')>('lib/actions/team-access-actions.ts', {
    '@/lib/admin/team-access-data': { loadTeamAccess },
    '@/lib/auth/admin': admin,
    '@/lib/auth/team-access': team,
    '@/lib/supabase/server': { supabaseAdmin: supabase },
    'next/cache': { revalidatePath: () => undefined },
  });
  return { actor, profiles, grants, users, writes, filters, options, rpcCalls, supabase, admin, actions };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ email: 'employee@example.invalid', jobTitle: 'Manager', accessLevel: 'scoped_staff', countryScope: 'EG', ...values })) data.set(key, value);
  data.set('actorId', ceo);
  data.set('role', 'admin');
  data.set('permissions', 'admin:full');
  return data;
}

test('runtime CEO authority uses verified ID plus exact active matching profile, not email or aliases', async () => {
  const f = fixture();
  assert.equal(await team.isCeoActor(f.supabase, f.actor!), true);
  f.profiles[0].id = other;
  assert.equal(await team.isCeoActor(f.supabase, f.actor!), false);
  for (const [role, status] of [['staff', 'active'], ['super_admin', 'active'], ['admin', 'inactive'], ['admin', 'pending']]) {
    const denied = fixture(ceo, role, status);
    assert.equal(await team.isCeoActor(denied.supabase, denied.actor!), false);
  }
  assert.equal(await team.isCeoActor(fixture(ceo, 'admin', 'active', team.CEO_EMAIL, '2026-09-05T00:00:00Z').supabase, f.actor!), false);
  f.options.queryError = true;
  assert.equal(await team.isCeoActor(f.supabase, f.actor!), false);
  for (const email of [team.CEO_EMAIL, team.CEO_EMAIL.toUpperCase()]) {
    const forged = fixture(other, 'admin', 'active', email);
    assert.equal(await team.isCeoActor(forged.supabase, forged.actor!), false);
  }
});

for (const missing of ['table', 'function', 'query'] as const) {
  test(`inactive team schema (${missing}) denies actions before any invitation or profile write`, async () => {
    const f = fixture();
    if (missing === 'function') f.options.functionError = { code: 'PGRST202' };
    else f.options.tableError = { code: missing === 'table' ? 'PGRST205' : '42501' };
    await assert.rejects(f.actions.upsertTeamAccessGrantAction(form({})), /TEAM_ACCESS_UNAVAILABLE/);
    await assert.rejects(f.actions.setTeamAccessStatusAction(form({ status: 'active' })), /TEAM_ACCESS_UNAVAILABLE/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.options.invitations, 0);
  });
}

for (const [name, id, role, status] of [
  ['non-CEO admin with CEO email', other, 'admin', 'active'],
  ['staff', employee, 'staff', 'active'], ['partner', other, 'partner', 'active'],
  ['customer', other, 'customer', 'active'], ['anonymous', null, 'customer', 'active'],
  ['inactive CEO', ceo, 'admin', 'inactive'], ['non-admin CEO', ceo, 'staff', 'active'],
] as const) {
  test(`${name}: action rejects forged actor/role/country before privileged IO`, async () => {
    const f = fixture(id, role, status, team.CEO_EMAIL);
    await assert.rejects(f.actions.upsertTeamAccessGrantAction(form({})), /Unauthorized|Forbidden|CEO access required/);
    await assert.rejects(f.actions.setTeamAccessStatusAction(form({ status: 'inactive' })), /Unauthorized|Forbidden|CEO access required/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.options.invitations, 0);
  });
}

test('CEO demotion is rejected using resolved Auth UUID after email change', async () => {
  const f = fixture();
  f.users.push({ id: ceo, email: 'changed-ceo@example.invalid' });
  await assert.rejects(f.actions.upsertTeamAccessGrantAction(form({ email: 'changed-ceo@example.invalid' })), /CEO access cannot be reduced/);
  assert.equal(f.writes.length, 0);
});

for (const [status, level] of [['inactive', 'global_admin'], ['active', 'scoped_staff']] as const) {
  test(`CEO target protected for ${status}/${level}, even with stale grant contact email`, async () => {
    const f = fixture();
    f.grants.push({ email: 'stale-contact@example.invalid', invited_user_id: ceo, access_level: level });
    await assert.rejects(f.actions.setTeamAccessStatusAction(form({ email: 'stale-contact@example.invalid', status })), /CEO access cannot be disabled or reduced/);
    assert.equal(f.writes.length, 0);
  });
}

test('legitimate CEO attaches existing employee and invitation to Auth-returned UUID', async () => {
  for (const invite of [false, true]) {
    const f = fixture();
    if (!invite) f.users.push({ id: employee, email: 'employee@example.invalid' });
    await f.actions.upsertTeamAccessGrantAction(form({}));
    assert.equal(f.writes.length, 2);
    assert.equal(f.writes[0].values.id, employee);
    assert.equal(f.writes[0].values.role, 'staff');
    assert.equal(f.writes[1].values.invited_user_id, employee);
    assert.equal(f.writes[1].values.created_by, ceo);
    assert.equal(f.options.invitations, invite ? 1 : 0);
  }
  const missing = fixture();
  missing.options.inviteUser = null;
  await assert.rejects(missing.actions.upsertTeamAccessGrantAction(form({})), /Authenticated team identity is required/);
  assert.equal(missing.writes.length, 0);
});

test('legitimate CEO can deactivate employee, without deriving target identity from submitted UUID', async () => {
  const f = fixture();
  f.grants.push({ email: 'employee@example.invalid', invited_user_id: employee, access_level: 'scoped_staff' });
  await f.actions.setTeamAccessStatusAction(form({ status: 'inactive' }));
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].values.status, 'inactive');
});

test('saving an employee after an Auth email change preserves one UUID-bound grant', async () => {
  const f = fixture();
  f.users.push({ id: employee, email: 'employee@example.invalid' });
  const access = form({});
  access.set('permissions', 'customers:read');
  await f.actions.upsertTeamAccessGrantAction(access);
  const grantId = f.grants[0].id;
  f.users[0].email = 'renamed-employee@example.invalid';
  access.set('email', String(f.users[0].email));
  await f.actions.upsertTeamAccessGrantAction(access);
  assert.equal(f.grants.length, 1);
  assert.equal(f.grants[0].id, grantId);
  assert.equal(f.grants[0].email, 'renamed-employee@example.invalid');
  assert.equal(f.grants[0].invited_user_id, employee);
  const owned = await team.getTeamAccessGrant(f.supabase, { id: employee } as User);
  assert.equal(owned?.id, grantId);
  assert.deepEqual(Array.from(owned?.country_scope ?? []), ['EG']);
  assert.equal(team.hasPermission(owned, 'customers:read'), true);
  assert.equal(team.hasPermission(owned, 'admin:full'), false);
  assert.equal(await team.getTeamAccessGrant(f.supabase, { id: other, email: 'renamed-employee@example.invalid' } as User), null);
});

test('grant lookup never falls back to email on missing, failed or ambiguous identity binding', async () => {
  const f = fixture(employee, 'staff', 'active', 'qa@example.invalid');
  f.grants.push({ id: 'wrong', email: 'qa@example.invalid', invited_user_id: other, access_level: 'global_admin' });
  assert.equal(await team.getTeamAccessGrant(f.supabase, f.actor!), null);
  assert.ok(f.filters.every(([, column]) => column === 'invited_user_id'));
  f.options.queryError = true;
  assert.equal(await team.getTeamAccessGrant(f.supabase, f.actor!), null);
});

test('attachment RPC receives Auth-resolved UUID, never a caller actor or target override',async()=>{
  const f=fixture(); f.users.push({id:employee,email:'employee@example.invalid'});
  await f.actions.upsertTeamAccessGrantAction(form({email:'  EMPLOYEE@EXAMPLE.INVALID ',invited_user_id:other,actorId:other}));
  assert.equal(f.rpcCalls.length,1);
  assert.equal(f.rpcCalls[0].name,'save_team_access_grant');
  assert.equal(f.rpcCalls[0].params.p_user_id,employee);
  assert.equal(f.rpcCalls[0].params.p_email,'employee@example.invalid');
  assert.equal(Object.keys(f.rpcCalls[0].params).some(key=>/actor|created_by/.test(key)),false);
});

test('mismatched or ambiguous Auth identity fails before any write RPC',async()=>{
  const mismatch=fixture(); mismatch.options.inviteUser={id:employee,email:'different@example.invalid'};
  await assert.rejects(mismatch.actions.upsertTeamAccessGrantAction(form({})),/Team identity conflict/);
  assert.equal(mismatch.rpcCalls.length,0); assert.equal(mismatch.writes.length,0);
  const ambiguous=fixture(); ambiguous.users.push({id:employee,email:'employee@example.invalid'},{id:other,email:'EMPLOYEE@example.invalid'});
  await assert.rejects(ambiguous.actions.upsertTeamAccessGrantAction(form({})),/Team identity conflict/);
  assert.equal(ambiguous.rpcCalls.length,0); assert.equal(ambiguous.options.invitations,0);
});

test('RPC conflict and database failures expose only truthful application errors',async()=>{
  for(const message of ['TEAM_ACCESS_IDENTITY_CONFLICT','private SQL details token=secret']) {
    const f=fixture(); f.users.push({id:employee,email:'employee@example.invalid'});
    f.options.writeError={code:'22023',message};
    await assert.rejects(f.actions.upsertTeamAccessGrantAction(form({})),error=>{
      assert.match(String(error),/Team identity conflict|No access changes were applied/);
      assert.doesNotMatch(String(error),/private SQL|secret|22023/); return true;
    });
    assert.equal(f.writes.length,0);
  }
});

for (const country of ['EG', 'QA']) {
  test(`${country} staff retains own scope and denies cross-country/global/CEO access`, async () => {
    const f = fixture(employee, 'staff');
    f.grants.push({ id: 'own', email: 'old-contact@example.invalid', invited_user_id: employee, access_level: 'scoped_staff', status: 'active', country_scope: [country], permissions: ['customers:read', 'customers:write'] });
    const context = await f.admin.requireScopedAdminActionAccess('customers:write');
    assert.equal(context.scope.mode, 'country');
    assert.equal(f.admin.isCountryAllowed(context.scope, country === 'EG' ? 'Egypt' : 'Qatar'), true);
    assert.throws(() => f.admin.assertCountryAllowed(context.scope, country === 'EG' ? 'Qatar' : 'Egypt'), /COUNTRY_SCOPE_FORBIDDEN/);
    assert.throws(() => f.admin.assertCountryAllowed(context.scope, ''), /COUNTRY_SCOPE_FORBIDDEN/);
    await assert.rejects(f.admin.requireAdminActionAccess(), /Forbidden/);
    await assert.rejects(f.admin.requireAdminPageAccess(), /NOT_FOUND/);
    await assert.rejects(f.actions.upsertTeamAccessGrantAction(form({ accessLevel: 'global_admin', countryScope: 'EG,QA' })), /Forbidden/);
    assert.equal(f.writes.length, 0);
    f.grants[0].status = 'inactive';
    await assert.rejects(f.admin.requireScopedAdminActionAccess('customers:read'), /Forbidden/);
  });
}
