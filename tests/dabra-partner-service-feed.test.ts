import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDabraServiceContext,
  isEligiblePartnerService,
  normalizePartnerService,
} from '@/lib/ai2/services/partner-service-feed';

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
