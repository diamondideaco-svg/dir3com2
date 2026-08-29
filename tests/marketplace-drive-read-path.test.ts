import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeMarketplaceServices } from '../lib/marketplace/data';

test('stored Drive truth controls the customer family label and partner image', () => {
  const [service] = normalizeMarketplaceServices([
    {
      id: 'drive-product',
      slug: 'drive-product',
      name_ar: 'سيارة',
      name_en: 'Car',
      description_ar: 'سيارة',
      description_en: 'Car',
      marketplace_category: 'hotels',
      marketplace_family: 'drive',
      primary_image_url: 'https://example.test/approved-drive.jpg',
      status: 'published',
      products: [{ id: 'drive-product', price_per_unit: 0 }],
    },
  ], { includeFallback: false, source: 'supabase' });

  assert.equal(service.family, 'dir3-drive');
  assert.equal(service.familyLabel, 'dir3 Drive');
  assert.equal(service.badge, 'dir3 Drive');
  assert.equal(service.category, 'cars');
  assert.equal(service.categoryLabel, 'السيارات');
  assert.equal(service.icon, 'https://example.test/approved-drive.jpg');
});

test('Drive customer copy drops internal seed and review language', () => {
  for (const description of ['Phase Zero test data', 'Seed inventory', 'REVIEW']) {
    const [service] = normalizeMarketplaceServices([{
      slug: 'hyundai-drive',
      name_en: 'Hyundai Drive',
      description_en: description,
      marketplace_family: 'drive',
      status: 'published',
    }], { includeFallback: false, source: 'supabase' });

    assert.doesNotMatch(service.description_en ?? '', /phase zero|seed|review/i);
    assert.match(service.description_en ?? '', /Vehicle and transfer options/);
    assert.equal(service.category, 'cars');
  }
});

test('Drive fallback uses the stable platform vehicle icon rather than requesting the broken SVG', () => {
  const source = readFileSync(new URL('../components/shared/ServiceCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /service\.icon === '\/icons\/drive\.svg'/);
  assert.match(source, /<FiTruck/);
});

test('requestable Drive PDP does not show a false empty-products state', () => {
  const source = readFileSync(new URL('../components/public/PublicServiceDetailClient.tsx', import.meta.url), 'utf8');
  assert.match(source, /primaryAction === 'continue_to_booking' \? <div className="luxury-section-shell">/);
  assert.match(source, /sanitizeMarketplaceCustomerCopy/);
});

test('product PDP continues to the direct product query when the legacy service join fails', () => {
  const source = readFileSync(new URL('../app/api/services/[slug]/route.ts', import.meta.url), 'utf8');

  assert.match(source, /if \(!error && service\)/);
  assert.doesNotMatch(source, /if \(error\)[\s\S]{0,500}return buildErrorResponse\('internal_error'/);
  assert.match(source, /from\('products'\)[\s\S]*\.eq\('slug', normalizedSlug\)/);
  assert.match(source, /product\.category_id\s*\? await applyPublicCategoryFilters/);
  assert.match(source, /: \{ data: null, error: null \}/);
});

test('customer Drive surface requests enough rows to render the accepted eleven records', () => {
  const source = readFileSync(new URL('../components/public/MarketplaceExplorer.tsx', import.meta.url), 'utf8');

  assert.match(source, /pageSize: 30/);
});

test('list and detail paths sign approved partner-media paths without changing image content', () => {
  const adapter = readFileSync(new URL('../lib/marketplace/adapters.ts', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../app/api/services/[slug]/route.ts', import.meta.url), 'utf8');

  assert.match(adapter, /from\('product_images'\)/);
  assert.match(adapter, /storage\.from\('partner-media'\)\.createSignedUrl/);
  assert.match(detail, /storage\.from\('partner-media'\)\.createSignedUrl/);
});
