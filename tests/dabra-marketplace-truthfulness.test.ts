import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMarketplaceAssistantDataQuality } from '@/lib/marketplace/server';

const service = (overrides: Record<string, string> = {}) => ({
  slug: 'drive-service',
  name_ar: 'خدمة موثقة',
  name_en: 'Verified service',
  description_ar: 'خدمة معتمدة',
  description_en: 'Approved service',
  badge: 'موثق',
  ...overrides,
});

test('DABRA does not describe pilot or test inventory as live', () => {
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ slug: 'phase4-staging-drive-test' })], true), 'pilot-test');
  assert.equal(classifyMarketplaceAssistantDataQuality([service({ name_en: 'Synthetic test vehicle' })], true), 'pilot-test');
  assert.equal(classifyMarketplaceAssistantDataQuality([service()], false), 'pilot-test');
});

test('DABRA marks only non-empty verified inventory as live', () => {
  assert.equal(classifyMarketplaceAssistantDataQuality([service()], true), 'live-verified');
  assert.equal(classifyMarketplaceAssistantDataQuality([], true), 'unavailable');
});