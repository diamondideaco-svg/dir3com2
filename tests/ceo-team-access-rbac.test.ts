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
const adminAuth = read('lib/auth/admin.ts');
const customerActions = read('lib/actions/customer-actions.ts');
const productActions = read('lib/actions/product-actions.ts');
const customerList = read('app/admin/customers/page.tsx');
const customerDetail = read('app/admin/customers/[id]/page.tsx');
const productList = read('app/admin/products/page.tsx');
const partnerList = read('app/admin/partners/page.tsx');
const partnerDetail = read('app/admin/partners/[id]/page.tsx');
const adminLanding = read('app/admin/page.tsx');
const productForm = read('components/products/ProductForm.tsx');

test('official CEO authority is pinned to immutable Auth UUID, not contact email', () => {
  assert.match(model, /CEO_EMAIL = 'diamondidea\.co@gmail\.com'/);
  assert.match(model, /CEO_USER_ID = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'/);
  assert.match(migration, /auth\.uid\(\) = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16'::uuid/);
  assert.doesNotMatch(migration, /p\.email|auth\.jwt\(/);
  assert.doesNotMatch(model, /isCeoEmail/);
  assert.match(actions, /isCeoActor\(context\.supabase, context\.user\)/);
  assert.match(page, /isCeoActor\(supabase, user\)/);
});

test('team access grants are protected by CEO/self RLS and service role', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.team_access_grants/i);
  assert.match(migration, /email text NOT NULL UNIQUE/i);
  assert.match(migration, /ALTER TABLE public\.team_access_grants ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY team_access_ceo_all/i);
  assert.match(migration, /CREATE POLICY team_access_self_read/i);
  assert.match(migration, /CREATE POLICY team_access_service_role_all/i);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i);
  assert.match(actions, /supabase\.rpc\('save_team_access_grant'/);
  assert.match(migration, /DROP INDEX IF EXISTS public\.team_access_grants_user_idx/);
  assert.match(migration, /CREATE UNIQUE INDEX team_access_grants_user_idx/);
});

test('CEO can invite or attach an auth user and safely provision a profile', () => {
  assert.match(actions, /requireCeo\(\)/);
  assert.match(actions, /auth\.admin\.listUsers/);
  assert.match(actions, /auth\.admin\.inviteUserByEmail/);
  assert.doesNotMatch(actions, /from\('profiles'\).*upsert/);
  assert.match(migration, /INSERT INTO public\.profiles/);
  assert.match(migration, /v_role:='admin'; ELSE v_role:='staff'/);
  assert.match(migration, /SELECT array_agg\(id\) INTO v_auth_ids FROM auth\.users/);
  assert.match(migration, /cardinality\(v_auth_ids\).*<>1/);
});

test('team access lookup avoids interpolated PostgREST or filters', () => {
  assert.doesNotMatch(model, /\.or\(/);
  assert.match(model, /\.eq\('invited_user_id', user\.id\)/);
  assert.doesNotMatch(model, /\.eq\('email',/);
  assert.match(model, /byUserId\.invited_user_id !== user\.id/);
});

test('CEO account cannot be demoted or disabled', () => {
  assert.match(actions, /isCeoUserId\(authUser\.id\) && accessLevel !== 'global_admin'/);
  assert.match(migration, /v_grant\.invited_user_id=v_actor/);
  assert.match(migration, /p_status<>'active' OR v_grant\.access_level<>'global_admin'/);
  assert.match(migration, /TEAM_ACCESS_CEO_PROTECTED/);
});

test('deactivation fails closed and inactive admin profiles lose canonical admin authority', () => {
  assert.match(actions, /TEAM_ACCESS_NOT_FOUND.*Team access grant not found/);
  assert.match(identity, /select\('id, role, status, deleted_at, full_name'\)/);
  assert.match(identity, /\.eq\('status', 'active'\)/);
  assert.match(identity, /\.is\('deleted_at', null\)/);
  assert.match(identity, /profile\.id !== userId/);
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
  assert.match(layout, /isCeo=\{await isCeoActor\(supabase, user\)\}/);
  assert.match(shell, /isCeo \? \(/);
  assert.match(shell, /href="\/admin\/team"/);
});

test('scoped staff is admitted only with an active grant and a non-empty country scope', () => {
  assert.match(adminAuth, /role !== 'staff'/);
  assert.match(adminAuth, /grant\.status !== 'active'/);
  assert.match(adminAuth, /scope\.mode === 'country' && scope\.countries\.length === 0/);
  assert.match(adminAuth, /requireAdminShellAccess/);
  assert.match(layout, /requireAdminShellAccess\('\/admin'\)/);
});

test('country authorization normalizes known country names and fails closed on missing country', () => {
  assert.match(adminAuth, /egypt: 'EG'/);
  assert.match(adminAuth, /qatar: 'QA'/);
  assert.match(adminAuth, /'saudi arabia': 'SA'/);
  assert.match(adminAuth, /if \(!key\) return false/);
  assert.match(adminAuth, /throw new Error\('COUNTRY_SCOPE_FORBIDDEN'\)/);
});

test('scoped navigation exposes only hardened customer, partner and product surfaces', () => {
  assert.match(shell, /href: '\/admin\/customers'.*permission: 'customers:read'/);
  assert.match(shell, /href: '\/admin\/partners'.*permission: 'partners:read'/);
  assert.match(shell, /href: '\/admin\/products'.*permission: 'products:read'/);
  assert.match(shell, /href: '\/admin\/finance'.*globalOnly: true/);
  assert.match(shell, /href: '\/admin\/operations'.*globalOnly: true/);
  assert.match(shell, /href: '\/admin\/verification'.*globalOnly: true/);
  assert.match(shell, /href: '\/admin\/assignment'.*globalOnly: true/);
});

test('customer admin list and details enforce country read scope', () => {
  assert.match(customerList, /requireScopedAdminPageDataAccess\('\/admin\/customers', 'customers:read'\)/);
  assert.match(customerList, /filterRowsByCountryScope/);
  assert.match(customerDetail, /requireScopedAdminPageDataAccess\(`\/admin\/customers\/\$\{id\}`, 'customers:read'\)/);
  assert.match(customerDetail, /isCountryAllowed\(scope, customerData\.country\)/);
  assert.match(customerDetail, /notFound\(\)/);
});

test('customer mutations cannot cross country boundaries', () => {
  assert.match(customerActions, /requireScopedAdminActionAccess\('customers:write'\)/);
  assert.match(customerActions, /requireCustomerInScope/);
  assert.match(customerActions, /assertCountryAllowed\(context\.scope, data\.country\)/);
  assert.match(customerActions, /assertCountryAllowed\(scope, country\)/);
  assert.match(customerActions, /CUSTOMER_REQUIRED_FIELDS_MISSING/);
});

test('product admin list and mutations enforce country scope', () => {
  assert.match(productList, /requireScopedAdminPageDataAccess\('\/admin\/products', 'products:read'\)/);
  assert.match(productList, /filterRowsByCountryScope/);
  assert.match(productActions, /requireScopedAdminActionAccess\('products:write'\)/);
  assert.match(productActions, /requireProductInScope/);
  assert.match(productActions, /assertCountryAllowed\(context\.scope, data\.country\)/);
  assert.match(productActions, /assertCountryAllowed\(scope, partner\.country\)/);
  assert.match(productActions, /PRODUCT_COUNTRY_REQUIRED/);
  assert.match(productForm, /name="country"/);
});

test('partner admin list and details enforce country read scope', () => {
  assert.match(partnerList, /requireScopedAdminPageDataAccess\('\/admin\/partners', 'partners:read'\)/);
  assert.match(partnerList, /filterRowsByCountryScope/);
  assert.match(partnerDetail, /requireScopedAdminPageDataAccess\(`\/admin\/partners\/\$\{id\}`, 'partners:read'\)/);
  assert.match(partnerDetail, /isCountryAllowed\(scope, data\.country\)/);
  assert.match(partnerDetail, /notFound\(\)/);
});

test('country scoped managers never land on the global executive dashboard', () => {
  assert.match(adminLanding, /requireAdminShellAccess\('\/admin'\)/);
  assert.match(adminLanding, /shell\.scope\.mode === 'country'/);
  assert.match(adminLanding, /redirect\('\/admin\/customers'\)/);
  assert.match(adminLanding, /redirect\('\/admin\/partners'\)/);
  assert.match(adminLanding, /redirect\('\/admin\/products'\)/);
});

test('legacy global admin gates stay admin-only rather than silently accepting scoped staff', () => {
  assert.match(adminAuth, /requireAdminPageAccess/);
  assert.match(adminAuth, /!isAdminRole\(context\.role\)/);
  assert.match(adminAuth, /requireAdminActionAccess/);
  assert.match(adminAuth, /throw new Error\('Forbidden'\)/);
});

test('DABRA surfaces are not part of this RBAC implementation', () => {
  const joined = [migration, model, actions, page, identity, layout, shell, adminAuth, customerActions, productActions, customerList, customerDetail, productList, partnerList, partnerDetail, adminLanding, productForm].join('\n');
  assert.doesNotMatch(joined, /dabra|ai2|orchestration/i);
});
