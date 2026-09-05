import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const lifecycleMigration = read('supabase/migrations/20260903234500_admin_product_lifecycle_and_request_handoff.sql');
const partnerMigration = read('supabase/migrations/20260903234600_partner_request_handoff.sql');
const cleanupMigration = read('supabase/migrations/20260903234700_drop_legacy_admin_handoff_rpc.sql');
const hardeningMigration = read('supabase/migrations/20260904004000_harden_admin_partner_authorization.sql');
const remediationMigration = read('supabase/migrations/20260905160435_reconcile_admin_partner_lifecycle_safety.sql');
const identity = read('lib/auth/identity.ts');
const teamAccess = read('lib/auth/team-access.ts');
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
const partnerPortalServer = read('lib/partner-portal/server.ts');

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

test('lifecycle authorization is bound to authenticated session and country scope', () => {
  assert.match(hardeningMigration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(hardeningMigration, /team_access_grants/);
  assert.match(hardeningMigration, /COUNTRY_SCOPE_FORBIDDEN/);
  assert.match(hardeningMigration, /GRANT EXECUTE ON FUNCTION public\.publish_product_lifecycle\(uuid,integer,text\) TO authenticated/i);
  assert.match(hardeningMigration, /REVOKE ALL ON FUNCTION public\.publish_product_lifecycle\(uuid,integer,text\) FROM PUBLIC, anon, service_role/i);
  assert.match(hardeningMigration, /DROP FUNCTION IF EXISTS public\.publish_product_lifecycle\(uuid,text,uuid,integer,text\)/i);
  assert.match(productActions, /createSupabaseServerClient/);
  assert.doesNotMatch(productActions, /p_actor_user_id/);
  assert.doesNotMatch(productActions, /p_actor_role/);
});

test('product audit reads use canonical country-scoped team access', () => {
  assert.match(hardeningMigration, /create or replace function public\.can_read_product_audit/i);
  assert.match(hardeningMigration, /invited_user_id = v_actor/);
  assert.match(hardeningMigration, /country_scope/);
  assert.match(hardeningMigration, /create policy product_audit_admin_read/i);
  assert.match(hardeningMigration, /using \(public\.can_read_product_audit\(country\)\)/i);
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

test('partner portal requires active profile before service-role request access', () => {
  assert.match(partnerPortalServer, /resolveCanonicalActiveProfile\(supabase, user\.id\)/);
  assert.match(identity, /\.eq\('status', 'active'\)/);
  assert.match(identity, /\.is\('deleted_at', null\)/);
  assert.match(identity, /profile\.id !== userId/);
  assert.match(teamAccess, /resolveCanonicalActiveProfile\(supabase, user\.id\)/);
});

test('partner request handoff is scoped to owned products and recorded before WhatsApp opens', () => {
  assert.match(partnerMigration, /create table if not exists public\.marketplace_request_handoff_events/i);
  assert.match(partnerMigration, /v_profile_role <> 'partner'/);
  assert.match(partnerMigration, /from public\.product_availability/);
  assert.match(partnerMigration, /pa\.partner_id = p_actor_user_id/);
  assert.match(partnerMigration, /handoff_started_at = coalesce\(handoff_started_at, now\(\)\)/);
  assert.match(partnerMigration, /insert into public\.marketplace_request_handoff_events/);
  assert.doesNotMatch(partnerMigration, /insert into public\.marketplace_request_audit_logs/);
  assert.match(partnerMigration, /MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY/);
  assert.match(partnerMigration, /REQUEST_HANDOFF_ALREADY_STARTED/);
  assert.match(partnerMigration, /grant execute on function public\.start_partner_marketplace_request_handoff[^;]+to service_role/i);
  assert.match(cleanupMigration, /drop function if exists public\.start_marketplace_request_handoff/);

  assert.match(partnerRequestsApi, /requirePortalActor/);
  assert.match(partnerRequestsApi, /actor\.authRole !== 'partner'/);
  assert.match(partnerRequestsApi, /get_partner_marketplace_requests/);
  assert.doesNotMatch(partnerRequestsApi, /\.from\('marketplace_requests'\)/);
  assert.match(partnerRequestsApi, /DIR3COM_BOOKING_WHATSAPP_E164/);
  assert.match(partnerRequestsApi, /start_partner_marketplace_request_handoff/);
  assert.match(partnerRequestsApi, /committed\.handoff_reference/);
  assert.match(partnerRequestsApi, /committed\.whatsapp_destination/);
  assert.match(partnerRequestsApi, /committed\.message_snapshot/);
  assert.doesNotMatch(partnerRequestsApi, /requestRow\.service_name|requestRow\.requested_for|requestRow\.traveller_count/);
  assert.match(partnerRequestsApi, /const url = `https:\/\/wa\.me\//);
  assert.match(partnerRequestsApi, /REQUEST_HANDOFF_CONFLICT/);
  assert.match(partnerRequestsApi, /p_whatsapp_destination: whatsapp \|\| ''/);
  assert.match(partnerRequestsClient, /!whatsappConfigured && !request\.handoff_started_at/);
  assert.match(partnerRequestsClient, /REQUEST_HANDOFF_REPLAY_UNAVAILABLE/);
  assert.match(partnerRequestsClient, /legacy WhatsApp link cannot be reconstructed safely/);
});

test('forward remediation locks before country authorization and rejects unsafe versions', () => {
  assert.match(remediationMigration, /product_lifecycle_session_role\('products:write'\)[\s\S]*p_expected_version IS NULL OR p_expected_version < 1/i);
  assert.match(remediationMigration, /FOR UPDATE[\s\S]*product_lifecycle_actor_role\(v_current_country/i);
  assert.match(remediationMigration, /v_version IS DISTINCT FROM p_expected_version/i);
  assert.match(remediationMigration, /PRODUCT_VERSION_REQUIRED/);
});

test('forward remediation enforces publication truth without granting verification', () => {
  assert.match(remediationMigration, /PRODUCT_SUPPLY_NOT_AUTHORITATIVE/);
  assert.match(remediationMigration, /PRODUCT_SUPPLIER_NOT_VERIFIED/);
  assert.match(remediationMigration, /PRODUCT_INSTANT_SUPPLY_UNPROVEN/);
  assert.match(remediationMigration, /v_family IS NULL OR v_family NOT IN/);
  assert.match(remediationMigration, /v_supply IS NULL OR v_supply NOT IN/);
  assert.match(remediationMigration, /v_fulfilment IS NULL OR v_transaction IS NULL/);
  assert.match(remediationMigration, /verified_requestable'[\s\S]*request_to_confirm/);
  assert.match(remediationMigration, /verified_quote'[\s\S]*request_quote/);
  assert.match(remediationMigration, /unavailable','availability_unknown'[\s\S]*v_transaction = 'none'/);
  assert.doesNotMatch(remediationMigration, /verified\s*=\s*true/i);
  assert.match(productActions, /TRANSACTION_METHODS = \[[^\]]*'none'/);
  assert.match(productForm, /option value="none"/);
});

test('forward remediation makes audit and handoff ledgers append-only and replay-safe', () => {
  assert.match(remediationMigration, /REVOKE ALL PRIVILEGES ON TABLE public\.product_audit_events FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(remediationMigration, /PRODUCT_AUDIT_APPEND_ONLY/);
  assert.match(remediationMigration, /marketplace_request_handoff_whatsapp_unique/);
  assert.match(remediationMigration, /MARKETPLACE_HANDOFF_DUPLICATE_HISTORY/);
  assert.match(remediationMigration, /MARKETPLACE_HANDOFF_INCONSISTENT_HISTORY/);
  assert.match(remediationMigration, /REVOKE ALL PRIVILEGES ON TABLE public\.marketplace_request_handoff_events FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(remediationMigration, /marketplace_request_handoff_events_reject_truncate/);
  assert.match(remediationMigration, /REQUEST_HANDOFF_CONFLICT/);
  assert.match(remediationMigration, /whatsapp_destination/);
  assert.match(remediationMigration, /message_snapshot/);
  assert.match(remediationMigration, /REQUEST_HANDOFF_REPLAY_UNAVAILABLE/);
  assert.match(remediationMigration, /v_event\.created_at,true/);
});

test('partner reads and timelines are scoped before protected fields are projected', () => {
  assert.match(remediationMigration, /get_partner_marketplace_requests/);
  assert.match(remediationMigration, /EXISTS \([\s\S]*product_availability[\s\S]*pa\.partner_id=p_actor_user_id/i);
  assert.match(remediationMigration, /'request_submitted','at',r\.created_at/);
  assert.doesNotMatch(remediationMigration, /'request_submitted','at',r\.created_at,'status'/);
});

test('partner Requests workspace is visible and truthful without DABRA coupling', () => {
  assert.match(partnerPortalPage, /\/partner-portal\/requests/);
  assert.match(partnerRequestsPage, /PartnerRequestsClient/);
  assert.match(partnerRequestsClient, /Start WhatsApp handoff/);
  assert.match(partnerRequestsClient, /Open WhatsApp handoff/);
  assert.match(partnerRequestsClient, /safely select open handoff again/);
  assert.match(partnerRequestsClient, /Timeline/);
  assert.match(partnerRequestsClient, /WhatsApp handoff is not configured/);
  assert.match(partnerRequestsClient, /Unknown/);
  assert.doesNotMatch(partnerRequestsClient, /fulfilment_method \|\| 'request_to_confirm'/);

  const changedScope = [lifecycleMigration, partnerMigration, cleanupMigration, hardeningMigration, remediationMigration, productActions, productForm, productTable, lifecycleControls, productList, editPage, previewPage, partnerRequestsApi, partnerRequestsClient, partnerRequestsPage, partnerPortalPage, partnerPortalServer].join('\n');
  assert.doesNotMatch(changedScope, /components\/dabra|lib\/dabra|api\/dabra/i);
});
