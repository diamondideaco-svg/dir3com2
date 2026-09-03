import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const lifecycleMigration = read('supabase/migrations/20260903234500_admin_product_lifecycle_and_request_handoff.sql');
const partnerMigration = read('supabase/migrations/20260903234600_partner_request_handoff.sql');
const productActions = read('lib/actions/product-actions.ts');
const productForm = read('components/products/ProductForm.tsx');
const productTable = read('components/products/ProductTable.tsx');
const lifecycleControls = read('components/products/ProductLifecycleControls.tsx');
const productList = read('app/admin/products/page.tsx');
const editPage = read('app/admin/products/[id]/page.tsx');
const previewPage = read('app/admin/products/[id]/preview/page.tsx');
const partnerRequestsApi = read('app/api/partner-portal/requests/route.ts');
const partnerRequestsClient = read('components/portal/PartnerRequestsClient.tsx');
const partnerRequestsPage = read('app/partner-portal/requests/page.tsx');
const partnerPortalPage = read('app/partner-portal/page.tsx');

test('admin product lifecycle is explicit, atomic and audited', () => {
  assert.match(lifecycleMigration, /create table if not exists public\.product_audit_events/i);
  assert.match(lifecycleMigration, /create or replace function public\.create_product_draft_lifecycle/i);
  assert.match(lifecycleMigration, /create or replace function public\.update_product_draft_lifecycle/i);
  assert.match(lifecycleMigration, /create or replace function public\.publish_product_lifecycle/i);
  assert.match(lifecycleMigration, /create or replace function public\.unpublish_product_lifecycle/i);
  assert.match(lifecycleMigration, /create or replace function public\.archive_product_lifecycle/i);
  assert.match(lifecycleMigration, /for update/i);
  assert.match(lifecycleMigration, /PRODUCT_VERSION_STALE/);
  assert.match(lifecycleMigration, /insert into public\.product_audit_events/i);
  assert.doesNotMatch(lifecycleMigration, /delete from public\.products/i);
});

test('publication never silently grants verification and fails closed on non-production truth', () => {
  assert.match(lifecycleMigration, /status = 'published'/);
  assert.doesNotMatch(lifecycleMigration, /status = 'published'[\s\S]{0,200}verified\s*=\s*true/i);
  assert.match(lifecycleMigration, /PRODUCT_SYNTHETIC_BLOCKED/);
  assert.match(lifecycleMigration, /PRODUCT_ENVIRONMENT_BLOCKED/);
  assert.match(lifecycleMigration, /PRODUCT_FULFILMENT_NOT_READY/);
  assert.match(lifecycleMigration, /PRODUCT_TRANSACTION_METHOD_REQUIRED/);
});

test('lifecycle RPCs are service-role only and actor identity is revalidated', () => {
  assert.match(lifecycleMigration, /assert_product_lifecycle_actor/);
  assert.match(lifecycleMigration, /from public\.profiles/);
  assert.match(lifecycleMigration, /revoke all on function public\.publish_product_lifecycle[^;]+from public, anon, authenticated/i);
  assert.match(lifecycleMigration, /grant execute on function public\.publish_product_lifecycle[^;]+to service_role/i);
  assert.match(productActions, /p_actor_user_id: user\.id/);
  assert.match(productActions, /p_actor_role: role/);
});

test('admin UI exposes clear draft, preview, publish, unpublish and archive actions', () => {
  assert.match(productForm, /Save as draft/);
  assert.doesNotMatch(productForm, /<fieldset disabled/);
  assert.doesNotMatch(productForm, /name="status"/);
  assert.match(productTable, /ProductLifecycleControls/);
  assert.match(lifecycleControls, /Edit/);
  assert.match(lifecycleControls, /Preview/);
  assert.match(lifecycleControls, /Publish/);
  assert.match(lifecycleControls, /Unpublish/);
  assert.match(lifecycleControls, /Archive/);
  assert.match(lifecycleControls, /window\.confirm/);
});

test('admin product search and filters remain limited to the agreed four filters', () => {
  assert.match(productList, /name="q"/);
  assert.match(productList, /name="status"/);
  assert.match(productList, /name="family"/);
  assert.match(productList, /name="city"/);
  assert.match(productList, /name="partner"/);
  assert.match(productList, /applyFilters/);
  assert.match(productList, /is\('deleted_at', null\)/);
});

test('edit and preview routes preserve country scope and preview does not mutate state', () => {
  assert.match(editPage, /requireScopedAdminPageDataAccess/);
  assert.match(editPage, /assertCountryAllowed/);
  assert.match(previewPage, /requireScopedAdminPageDataAccess/);
  assert.match(previewPage, /assertCountryAllowed/);
  assert.doesNotMatch(previewPage, /update\(|insert\(|delete\(|\.rpc\(/);
});

test('partner request handoff is scoped to owned products and recorded before WhatsApp opens', () => {
  assert.match(partnerMigration, /v_profile_role <> 'partner'/);
  assert.match(partnerMigration, /from public\.product_availability/);
  assert.match(partnerMigration, /pa\.partner_id = p_actor_user_id/);
  assert.match(partnerMigration, /handoff_started_at = coalesce\(handoff_started_at, now\(\)\)/);
  assert.match(partnerMigration, /insert into public\.marketplace_request_audit_logs/);
  assert.match(partnerMigration, /grant execute on function public\.start_partner_marketplace_request_handoff[^;]+to service_role/i);

  assert.match(partnerRequestsApi, /requirePortalActor/);
  assert.match(partnerRequestsApi, /actor\.authRole !== 'partner'/);
  assert.match(partnerRequestsApi, /\.eq\('partner_id', actor\.userId\)/);
  assert.match(partnerRequestsApi, /DIR3COM_BOOKING_WHATSAPP_E164/);
  assert.match(partnerRequestsApi, /start_partner_marketplace_request_handoff/);
  assert.match(partnerRequestsApi, /const url = `https:\/\/wa\.me\//);
});

test('partner Requests workspace is visible and truthful without DABRA coupling', () => {
  assert.match(partnerPortalPage, /\/partner-portal\/requests/);
  assert.match(partnerRequestsPage, /PartnerRequestsClient/);
  assert.match(partnerRequestsClient, /Start WhatsApp handoff/);
  assert.match(partnerRequestsClient, /Handoff started/);
  assert.match(partnerRequestsClient, /Timeline/);
  assert.match(partnerRequestsClient, /WhatsApp handoff is not configured/);

  const changedScope = [lifecycleMigration, partnerMigration, productActions, productForm, productTable, lifecycleControls, productList, editPage, previewPage, partnerRequestsApi, partnerRequestsClient, partnerRequestsPage, partnerPortalPage].join('\n');
  assert.doesNotMatch(changedScope, /components\/dabra|lib\/dabra|api\/dabra/i);
});
