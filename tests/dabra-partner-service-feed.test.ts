import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import {
  buildDabraServiceContext,
  findDabraServiceMatches,
  isEligiblePartnerService,
  mergeDabraServices,
  normalizePartnerService,
} from '@/lib/ai2/services/partner-service-feed';
import { isServiceDiscoveryIntent } from '@/lib/ai2/runtime/chat';

const product = {
  id: 'partner-product-1',
  name_ar: 'خدمة نقل خاصة',
  name_en: 'Private transfer',
  description_ar: 'نقل خاص من المطار.',
  description_en: 'Private airport transfer.',
  city: 'Riyadh',
  base_price: 250,
  currency: 'SAR',
  status: 'active',
  synthetic: false,
};
const availability = { product_id: product.id, partner_id: 'partner-1', city: 'Riyadh', available: true };
const partner = { id: 'partner-1', company_name: 'Approved Mobility Co', status: 'active' };

test('partner eligibility includes only active, available, non-synthetic published records', () => {
  assert.equal(isEligiblePartnerService({ productStatus: 'active', partnerStatus: 'active', available: true, synthetic: false }), true);
  assert.equal(isEligiblePartnerService({ productStatus: 'published', partnerStatus: 'active', available: true, synthetic: false }), true);
  assert.equal(isEligiblePartnerService({ productStatus: 'featured', partnerStatus: 'active', available: true, synthetic: false }), true);
  for (const productStatus of ['draft', 'pending_review', 'rejected', 'inactive']) {
    assert.equal(isEligiblePartnerService({ productStatus, partnerStatus: 'active', available: true, synthetic: false }), false, productStatus);
  }
  assert.equal(isEligiblePartnerService({ productStatus: 'active', partnerStatus: 'active', available: false, synthetic: false }), false);
  assert.equal(isEligiblePartnerService({ productStatus: 'active', partnerStatus: 'inactive', available: true, synthetic: false }), false);
  assert.equal(isEligiblePartnerService({ productStatus: 'active', partnerStatus: 'active', available: true, synthetic: true }), false);
  assert.equal(isEligiblePartnerService({ productStatus: 'active', partnerStatus: 'active', available: true, synthetic: false, unpublished: true }), false);
});

test('approved partner service normalizes public-safe fields only', () => {
  const normalized = normalizePartnerService(product, availability, partner, 'airport-transfers', ['https://cdn.example.test/transfer.jpg', 'file:///private.jpg']);

  assert.deepEqual(normalized, {
    serviceId: 'partner-product-1',
    sourceType: 'partner',
    title: { ar: 'خدمة نقل خاصة', en: 'Private transfer' },
    description: { ar: 'نقل خاص من المطار.', en: 'Private airport transfer.' },
    category: 'airport-transfers',
    location: 'Riyadh',
    pricing: { amount: 250, currency: 'SAR' },
    availability: 'available',
    providerName: 'Approved Mobility Co',
    media: ['https://cdn.example.test/transfer.jpg'],
    publicationStatus: 'active',
  });
  assert.equal(JSON.stringify(normalized).includes('partner-1'), false);
});

test('ineligible partner services are excluded before normalization', () => {
  for (const status of ['draft', 'pending_review', 'rejected', 'inactive']) {
    assert.equal(normalizePartnerService({ ...product, status }, availability, partner, 'cars'), null, status);
  }
  assert.equal(normalizePartnerService(product, { ...availability, available: false }, partner, 'cars'), null);
});

test('service context uses stored language and honest fallback for missing translation', () => {
  const service = normalizePartnerService({ ...product, name_en: null, description_en: null, base_price: null }, availability, partner, 'cars');
  assert.ok(service);
  const arabicContext = buildDabraServiceContext([service], 'ar');
  const englishContext = buildDabraServiceContext([service], 'en');

  assert.match(arabicContext, /خدمة نقل خاصة/);
  assert.match(englishContext, /خدمة نقل خاصة/);
  assert.match(englishContext, /price=unavailable/);
  assert.match(englishContext, /category=cars/);
  assert.match(englishContext, /location=Riyadh/);
  assert.match(englishContext, /provider=Approved Mobility Co/);
  assert.doesNotMatch(englishContext, /email|phone|admin|review|partner-1/i);
});

test('service context preserves exact and near-matchable discovery facts', () => {
  const normalized = normalizePartnerService(product, availability, partner, 'airport-transfers');
  assert.ok(normalized);
  const context = buildDabraServiceContext([normalized], 'en');

  assert.match(context, /Private transfer/);
  assert.match(context, /Private airport transfer/);
  assert.match(context, /category=airport-transfers/);
  assert.match(context, /location=Riyadh/);
  assert.match(context, /price=250 SAR/);
  assert.match(context, /provider=Approved Mobility Co/);
});

test('service context preserves human-readable stored category labels', () => {
  const normalized = normalizePartnerService(product, availability, partner, 'Hotel & Stay');
  assert.ok(normalized);

  assert.equal(normalized.category, 'Hotel & Stay');
  assert.match(buildDabraServiceContext([normalized], 'en'), /category=Hotel & Stay/);
});

test('service matching prefers the best exact or near title instead of a shared QA marker', () => {
  const first = normalizePartnerService({ ...product, name_en: 'QA Nile Dinner', name_ar: 'عشاء النيل' }, availability, partner, 'cars');
  const second = normalizePartnerService({ ...product, id: 'partner-product-2', name_en: 'Boutique stay', name_ar: 'إقامة فندقية' }, { ...availability, product_id: 'partner-product-2' }, partner, 'hotels');
  assert.ok(first);
  assert.ok(second);

  assert.deepEqual(findDabraServiceMatches([first, second], 'Find QA Nile Dinner').map((service) => service.serviceId), ['partner-product-1']);
  assert.deepEqual(findDabraServiceMatches([first, second], 'boutique stay').map((service) => service.serviceId), ['partner-product-2']);
});

test('duplicate stable identities are emitted once while platform and partner namespaces remain distinct', () => {
  const normalized = normalizePartnerService(product, availability, partner, 'cars');
  assert.ok(normalized);
  const platform = { ...normalized, sourceType: 'platform' as const };
  const merged = mergeDabraServices([normalized, normalized], [platform, platform]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((service) => `${service.sourceType}:${service.serviceId}`), [
    'partner:partner-product-1',
    'platform:partner-product-1',
  ]);
});

test('missing description, location, provider, and price remain honest', () => {
  const normalized = normalizePartnerService(
    { ...product, description_ar: null, description_en: null, city: null, base_price: null },
    { ...availability, city: null },
    { ...partner, company_name: null },
    'cars',
  );
  assert.ok(normalized);
  const context = buildDabraServiceContext([normalized], 'en');

  assert.match(context, /\| Unavailable \| category=cars/);
  assert.match(context, /location=unknown/);
  assert.match(context, /price=unavailable/);
  assert.match(context, /provider=unavailable/);
});

test('service-discovery queries return a local grounded partner answer before provider fallback', async () => {
  const response = await buildAI2ChatResponse('Find QA Nile Dinner');

  assert.equal(response.provider, 'local');
  assert.notEqual(response.groundingStatus, 'fallback-no-source');
  assert.ok(response.sources.length > 0, 'service-discovery should yield at least one local source');
  assert.match(response.answer, /QA Nile Dinner|Nile Dinner/i);
});

test('Arabic service-discovery requests are classified and grounded locally', async () => {
  const categoryQuery = 'ما هي فئة إقامة فندقية تجريبية؟';
  const locationQuery = 'ما الخدمات المتاحة في القاهرة؟';
  const priceQuery = 'كم سعر QA Nile Dinner؟';
  const providerQuery = 'ما الخدمات التي يقدمها DIR3COM DABRA QA Partner؟';
  const findQuery = 'ابحث عن QA Nile Dinner';
  const nonServiceQuery = 'كيف حالك اليوم؟';

  assert.equal(isServiceDiscoveryIntent(categoryQuery), true);
  assert.equal(isServiceDiscoveryIntent(locationQuery), true);
  assert.equal(isServiceDiscoveryIntent(priceQuery), true);
  assert.equal(isServiceDiscoveryIntent(providerQuery), true);
  assert.equal(isServiceDiscoveryIntent(findQuery), true);
  assert.equal(isServiceDiscoveryIntent(nonServiceQuery), false);

  const categoryResponse = await buildAI2ChatResponse(categoryQuery);
  assert.equal(categoryResponse.provider, 'local');
  assert.notEqual(categoryResponse.groundingStatus, 'fallback-no-source');
  assert.ok(categoryResponse.sources.length > 0);
  assert.match(categoryResponse.answer, /Hotel & Stay|فئة|إقامة|Boutique Stay|فندقي/i);

  const findResponse = await buildAI2ChatResponse(findQuery);
  assert.equal(findResponse.provider, 'local');
  assert.notEqual(findResponse.groundingStatus, 'fallback-no-source');
  assert.match(findResponse.answer, /عشاء النيل التجريبي|QA Nile Dinner|Nile Dinner|DIR3COM DABRA QA Partner/i);
});

test('no service match still stays on the no-source fallback path', async () => {
  const response = await buildAI2ChatResponse('qzvxx blorf nyrt ulm qxw 98431');

  assert.equal(response.provider, 'local');
  assert.equal(response.groundingStatus, 'fallback-no-source');
  assert.deepEqual(response.sources, []);
});
