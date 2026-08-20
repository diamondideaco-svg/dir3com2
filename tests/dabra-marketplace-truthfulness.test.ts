import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMarketplaceAssistantDataQuality, filterAssistantServices } from '@/lib/marketplace/server';

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

test('DABRA assistant context does not expose pilot-marked inventory as quick links', () => {
  const entries = [
    { source: 'supabase' as const, slug: 'phase4-staging-drive-test', name_ar: 'سيارة اختبار', name_en: 'Test vehicle', description_ar: '', description_en: '', badge: '', id: '1' },
    { source: 'supabase' as const, slug: 'verified-drive', name_ar: 'خدمة موثقة', name_en: 'Verified service', description_ar: '', description_en: '', badge: '', id: '2' },
  ];
  assert.deepEqual(filterAssistantServices(entries).map((entry) => entry.id), ['2']);
});