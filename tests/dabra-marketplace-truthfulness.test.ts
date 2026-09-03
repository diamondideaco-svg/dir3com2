import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMarketplaceAssistantDataQuality, filterAssistantServices } from '@/lib/marketplace/server';

const service = (overrides: Record<string, unknown> = {}) => ({
  id: 'service-1',
  source: 'supabase' as const,
  provenance: 'PARTNER_VERIFIED' as const,
  marketplaceEnvironment: 'production' as const,
  fulfilmentState: 'verified_requestable' as const,
  synthetic: false,
  verified: true,
  slug: 'drive-service',
  name_ar: 'خدمة موثقة',
  name_en: 'Verified service',
  description_ar: 'خدمة معتمدة',
  description_en: 'Approved service',
  badge: 'موثق',
  supplierVerified: true,
  ...overrides,
});

test('DABRA classifies inventory from authoritative truth fields rather than customer-visible names', () => {
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ slug: 'phase0-real-drive-record' })], true), 'live-verified');
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ synthetic: true, provenance: 'SYNTHETIC_TEST' })], true), 'pilot-test');
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ marketplaceEnvironment: 'sandbox', provenance: 'PROVIDER_SANDBOX' })], true), 'pilot-test');
  assert.equal(classifyMarketplaceAssistantDataQuality([service()], false), 'unavailable');
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ supplierVerified: false })], true), 'unavailable');
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ verified: false })], true), 'unavailable');
});

test('DABRA marks only non-empty verified inventory as live', () => {
  assert.equal(classifyMarketplaceAssistantDataQuality([service()], true), 'live-verified');
  assert.equal(classifyMarketplaceAssistantDataQuality([], true), 'unavailable');
});

test('DABRA assistant context does not expose pilot-marked inventory as quick links', () => {
  const entries = [
    service({ id: '1', slug: 'phase0-real-drive-record' }),
    service({ id: '2', slug: 'synthetic-drive', synthetic: true, provenance: 'SYNTHETIC_TEST' }),
    service({ id: '3', slug: 'unverified-drive', supplierVerified: false }),
    service({ id: '4', slug: 'record-not-verified', verified: false }),
  ];
  assert.deepEqual(filterAssistantServices(entries).map((entry) => entry.id), ['1']);
});
