import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260903233000_ceo_team_access_rbac.sql');
const model = read('lib/auth/team-access.ts');
const actions = read('lib/actions/team-access-actions.ts');
const page = read('app/admin/team/page.tsx');
const identity = read('lib/auth/identity.ts');
const layout = read('app/admin/layout.tsx');
const shell = read('components/admin/AdminPlatformShell.tsx');

test('official CEO account is pinned to Diamond Idea Gmail', () => {
  assert.match(model, /CEO_EMAIL = 'diamondidea\.co@gmail\.com'/);
  assert.match(migration, /lower\(p\.email\) = 'diamondidea\.co@gmail\.com'/);
});

test('team access grants are protected by CEO/self RLS and service role', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.team_access_grants/i);
  assert.match(migration, /email text NOT NULL UNIQUE/i);
  assert.match(migration, /ALTER TABLE public\.team_access_grants ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY team_access_ceo_all/i);
  assert.match(migration, /CREATE POLICY team_access_self_read/i);
  assert.match(migration, /CREATE POLICY team_access_service_role_all/i);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i);
  assert.match(actions, /onConflict: 'email'/);
});

test('CEO can invite or attach an auth user and safely provision a profile', () => {
  assert.match(actions, /requireCeo\(\)/);
  assert.match(actions, /auth\.admin\.listUsers/);
  assert.match(actions, /auth\.admin\.inviteUserByEmail/);
  assert.match(actions, /from\('profiles'\)\.upsert/);
  assert.match(actions, /role: profileRole/);
  assert.match(actions, /accessLevel === 'global_admin' \? 'admin' : 'staff'/);
});

test('team access lookup avoids interpolated PostgREST or filters', () => {
  assert.doesNotMatch(model, /\.or\(/);
  assert.match(model, /\.eq\('invited_user_id', user\.id\)/);
  assert.match(model, /\.eq\('email', email\)/);
});

test('CEO account cannot be demoted or disabled', () => {
  assert.match(actions, /email === CEO_EMAIL && accessLevel !== 'global_admin'/);
  assert.match(actions, /email === CEO_EMAIL && status !== 'active'/);
});

test('deactivation fails closed and inactive admin profiles lose canonical admin authority', () => {
  assert.match(actions, /if \(!grant\) throw new Error\('Team access grant not found'\)/);
  assert.match(identity, /select\('role, status'\)/);
  assert.match(identity, /profileData\.status === 'active'/);
});

test('team console supports email, title, access level, country scope and permissions', () => {
  assert.match(page, /name="email"/);
  assert.match(page, /name="jobTitle"/);
  assert.match(page, /name="accessLevel"/);
  assert.match(page, /name="countryScope"/);
  assert.match(page, /name="permissions"/);
  assert.match(page, /Save employee access/);
});

test('team console is only surfaced to the official CEO in the Admin shell', () => {
  assert.match(layout, /isCeo=\{isCeoEmail\(user\.email\)\}/);
  assert.match(shell, /isCeo \? \(/);
  assert.match(shell, /href="\/admin\/team"/);
});

test('DABRA surfaces are not part of this RBAC implementation', () => {
  const joined = [migration, model, actions, page, identity, layout, shell].join('\n');
  assert.doesNotMatch(joined, /dabra|ai2|orchestration/i);
});
