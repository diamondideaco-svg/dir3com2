import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DABRA_ACTION_RULES,
  DABRA_FAMILY_PERSONAS,
  DABRA_FAMILY_ROLES,
  evaluateDabraAction,
  normalizeDabraActionRequest,
  resolveDabraFamilyRole,
  type TrustedDabraActor,
  type TrustedDabraResource,
} from '@/lib/dabra/family-contract';
import type { MarketplaceTruth } from '@/lib/marketplace/truth';

const customer: TrustedDabraActor = { authenticated: true, userId: 'user-1', tenantId: 'tenant-1', platformRole: 'customer', rawRole: 'customer' };
const partner: TrustedDabraActor = { authenticated: true, userId: 'partner-1', tenantId: 'partner-1', platformRole: 'partner', rawRole: 'partner' };
const admin: TrustedDabraActor = { authenticated: true, userId: 'admin-1', tenantId: 'admin-1', platformRole: 'admin', rawRole: 'admin' };
const ceo: TrustedDabraActor = { ...admin, rawRole: 'super_admin' };
const anonymous: TrustedDabraActor = { authenticated: false, userId: null, tenantId: null, platformRole: 'anonymous', rawRole: null };

function truth(overrides: Partial<MarketplaceTruth> = {}): MarketplaceTruth {
  return { family: 'drive', fulfilmentState: 'verified_requestable', transactionMethod: 'request_to_confirm', environment: 'production', supplyType: 'verified_local_partner', supplierVerified: true, ...overrides };
}

function owned(kind: TrustedDabraResource['kind'], marketplaceTruth?: MarketplaceTruth): TrustedDabraResource {
  return { kind, id: 'resource-1', ownerId: customer.userId ?? undefined, tenantId: customer.tenantId ?? undefined, truth: marketplaceTruth };
}

test('DABRA Family exposes seven presentation personas without treating them as database roles', () => {
  assert.equal(DABRA_FAMILY_ROLES, DABRA_FAMILY_PERSONAS);
  assert.deepEqual(DABRA_FAMILY_ROLES, ['DABRA Concierge', 'DABRA Partner', 'DABRA Admin', 'DABRA CEO', 'DABRA Mall Center', 'DABRA Customer Service', 'DABRA Travel Agent']);
  assert.equal(resolveDabraFamilyRole(customer), 'DABRA Concierge');
  assert.equal(resolveDabraFamilyRole(partner), 'DABRA Partner');
  assert.equal(resolveDabraFamilyRole(admin), 'DABRA Admin');
  assert.equal(resolveDabraFamilyRole(ceo), 'DABRA CEO');
  assert.equal(resolveDabraFamilyRole(anonymous), null);
  assert.equal(resolveDabraFamilyRole({ ...admin, platformRole: 'staff', rawRole: 'mall_center' }), null);
  assert.equal(resolveDabraFamilyRole({ ...admin, platformRole: 'staff', rawRole: 'customer_service' }), null);
  assert.equal(resolveDabraFamilyRole({ ...admin, platformRole: 'staff', rawRole: 'travel_agent' }), null);
});

test('public DABRA is optional and read-only discovery works without authentication', () => {
  const result = evaluateDabraAction({ actor: anonymous, action: 'discover_marketplace', language: 'en' });
  assert.equal(result.allowed, true);
  assert.equal(result.actionClass, 'READ_ONLY');
  assert.equal(result.autonomousExecution, false);
  assert.equal(result.handoff, 'marketplace');
});

test('customer context and drafts are owner and tenant scoped', () => {
  assert.equal(evaluateDabraAction({ actor: customer, action: 'view_customer_context', resource: owned('customer_context') }).allowed, true);
  assert.equal(evaluateDabraAction({ actor: customer, action: 'save_trip_draft', resource: owned('trip_plan') }).actionClass, 'REVERSIBLE_DRAFT');
  const otherOwner = evaluateDabraAction({ actor: customer, action: 'view_customer_context', resource: { ...owned('customer_context'), ownerId: 'user-2' } });
  assert.equal(otherOwner.allowed, false);
  assert.equal(otherOwner.reason, 'RESOURCE_OWNERSHIP_MISMATCH');
  const otherTenant = evaluateDabraAction({ actor: customer, action: 'save_trip_draft', resource: { ...owned('trip_plan'), tenantId: 'tenant-2' } });
  assert.equal(otherTenant.allowed, false);
  assert.equal(otherTenant.reason, 'RESOURCE_OWNERSHIP_MISMATCH');
  const wrongKind = evaluateDabraAction({ actor: customer, action: 'view_customer_context', resource: owned('public_marketplace') });
  assert.equal(wrongKind.allowed, false);
  assert.equal(wrongKind.reason, 'RESOURCE_TYPE_MISMATCH');
});

test('booking payment cancellation and refund require approval plus trusted lifecycle evidence', () => {
  const booking = owned('booking');
  const actions = ['make_payment', 'cancel_booking', 'request_refund'] as const;
  for (const action of actions) {
    const blocked = evaluateDabraAction({ actor: customer, action, resource: booking });
    assert.equal(blocked.actionClass, 'REQUIRES_HUMAN_APPROVAL');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'HUMAN_APPROVAL_REQUIRED');
    const approvalOnly = evaluateDabraAction({ actor: customer, action, resource: booking, humanApproval: true });
    assert.equal(approvalOnly.allowed, false);
    assert.equal(approvalOnly.reason, 'MARKETPLACE_TRUTH_BLOCKED');
    const approved = evaluateDabraAction({
      actor: customer,
      action,
      resource: { ...booking, verifiedActions: [action] },
      humanApproval: true,
    });
    assert.equal(approved.allowed, true);
    assert.equal(approved.autonomousExecution, false);
    assert.equal(approved.reason, 'READY_FOR_CANONICAL_FLOW');
  }
  const bookable = owned('public_marketplace', truth({ fulfilmentState: 'live_bookable', transactionMethod: 'instant_booking' }));
  assert.equal(evaluateDabraAction({ actor: customer, action: 'create_booking', resource: bookable }).allowed, false);
  assert.equal(evaluateDabraAction({ actor: customer, action: 'create_booking', resource: bookable, humanApproval: true }).allowed, true);
});

test('request-to-confirm and provider checkout are driven only by canonical marketplace truth', () => {
  const request = owned('public_marketplace', truth());
  const ready = evaluateDabraAction({ actor: customer, action: 'submit_request_to_confirm', resource: request, humanApproval: true });
  assert.equal(ready.allowed, true);
  assert.equal(ready.handoff, 'request_to_confirm');

  const provider = owned('provider_offer', truth({ family: 'concierge', fulfilmentState: 'external_provider', transactionMethod: 'provider_checkout', supplyType: 'global_travel_partner', supplierVerified: false }));
  assert.equal(evaluateDabraAction({ actor: customer, action: 'open_provider_checkout', resource: provider, humanApproval: true }).handoff, 'provider_checkout');

  for (const blockedTruth of [
    truth({ environment: 'sandbox' }),
    truth({ environment: 'test' }),
    truth({ fulfilmentState: 'availability_unknown', transactionMethod: 'none' }),
    truth({ fulfilmentState: 'catalog_only', transactionMethod: 'none' }),
  ]) {
    const blocked = evaluateDabraAction({ actor: customer, action: 'submit_request_to_confirm', resource: owned('public_marketplace', blockedTruth), humanApproval: true });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'MARKETPLACE_TRUTH_BLOCKED');
  }
});

test('roles remain separated and only trusted CEO identity can reach executive scope', () => {
  assert.equal(evaluateDabraAction({ actor: customer, action: 'view_partner_workspace', resource: owned('partner_workspace') }).reason, 'ROLE_NOT_ALLOWED');
  assert.equal(evaluateDabraAction({ actor: partner, action: 'view_admin_workspace', resource: { kind: 'admin_workspace' } }).reason, 'ROLE_NOT_ALLOWED');
  assert.equal(evaluateDabraAction({ actor: admin, action: 'view_executive_workspace', resource: { kind: 'executive_workspace' } }).reason, 'ROLE_NOT_ALLOWED');
  assert.equal(evaluateDabraAction({ actor: ceo, action: 'view_executive_workspace', resource: { kind: 'executive_workspace' } }).allowed, true);
  assert.equal(evaluateDabraAction({ actor: { ...customer, rawRole: 'super_admin' }, action: 'view_executive_workspace', resource: { kind: 'executive_workspace' } }).reason, 'ROLE_NOT_ALLOWED');
});

test('prohibited autonomous actions fail closed for every role', () => {
  for (const action of ['override_marketplace_truth', 'publish_unverified_inventory', 'expose_cross_user_context', 'use_sandbox_as_production', 'reveal_secret'] as const) {
    for (const actor of [anonymous, customer, partner, admin, ceo]) {
      const result = evaluateDabraAction({ actor, action, humanApproval: true });
      assert.equal(result.allowed, false);
      assert.equal(result.actionClass, 'PROHIBITED_AUTONOMOUS');
      assert.equal(result.autonomousExecution, false);
    }
  }
});

test('client action parser ignores supplied actor role owner and tenant fields', () => {
  const parsed = normalizeDabraActionRequest({ action: 'view_customer_context', language: 'ar', humanApproval: true, actor: { userId: 'admin-forged', role: 'super_admin' }, ownerId: 'victim', tenantId: 'other' });
  assert.deepEqual(parsed, { action: 'view_customer_context', humanApproval: true, language: 'ar', resourceType: null, resourceId: null, provider: null, providerItemId: null });
});

test('server endpoint derives actor and owned resources and contains no mutation path', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'dabra', 'family', 'route.ts'), 'utf8');
  assert.match(route, /createSupabaseRequestClient\(request\)/);
  assert.match(route, /\.from\('profiles'\)[\s\S]*?\.select\('role'\)/);
  assert.match(route, /\.eq\('user_id', actor\.userId\)/);
  assert.match(route, /normalizeTruth/);
  assert.match(route, /resolveProviderCheckout/);
  assert.match(route, /consumeProviderRequestBudget/);
  assert.match(route, /verifiedActions: \[\]/);
  assert.doesNotMatch(route, /input\.actor|body\.actor|input\.ownerId|body\.ownerId|input\.tenantId|body\.tenantId/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});

test('DABRA UI uses five marketplace families and exposes an optional human-approval journey', () => {
  const commerce = fs.readFileSync(path.join(process.cwd(), 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(process.cwd(), 'components', 'dabra', 'DabraFamilySafetyPanel.tsx'), 'utf8');
  assert.match(commerce, /params\.set\('family', activeTab\)/);
  for (const family of ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip']) assert.match(commerce, new RegExp(family));
  assert.match(panel, /الدبرة اختيارية/);
  assert.match(panel, /DABRA is optional/);
  assert.match(panel, /Public discovery mode/);
  assert.match(panel, /وضع الاستكشاف العام/);
  assert.doesNotMatch(panel, /Current assistant identity|هوية المساعدة الحالية/);
  assert.match(panel, /explicit approval/);
  assert.match(panel, /href="\/marketplace"/);
  assert.match(panel, /href="\/support"/);
});

test('floating DABRA defaults AR left and EN right and avoids critical mobile PDP actions', () => {
  const floating = fs.readFileSync(path.join(process.cwd(), 'components', 'layout', 'FloatingDibrah.tsx'), 'utf8');
  const pdp = fs.readFileSync(path.join(process.cwd(), 'components', 'public', 'PublicServiceDetailClient.tsx'), 'utf8');
  assert.match(floating, /placeDabraLauncher\(\{ language, viewport/);
  assert.match(floating, /window\.visualViewport/);
  assert.match(floating, /language === 'ar' \? 'sm:left-5' : 'sm:right-5'/);
  assert.match(floating, /data-marketplace-critical-action/);
  assert.match(floating, /<FloatingDibrahSession key=\{language\} language=\{language\}/);
  assert.match(floating, /chatAbortRef\.current\?\.abort\(\)/);
  assert.match(floating, /signal: controller\.signal/);
  assert.match(floating, /activeRequestIdRef\.current !== requestId/);
  assert.match(pdp, /data-marketplace-critical-action/);
  assert.equal(DABRA_ACTION_RULES.request_human_support.handoff, 'support');
});
