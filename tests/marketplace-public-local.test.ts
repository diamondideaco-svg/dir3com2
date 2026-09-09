import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterMarketplaceServices, normalizeMarketplaceServices, type MarketplaceFamilyKey } from '../lib/marketplace/data';
const read = (path: string) => readFileSync(path, 'utf8');
const explorer = read('components/public/MarketplaceExplorer.tsx');
const css = read('components/public/marketplace-local.module.css');

test('only exact Marketplace opts into approved public chrome and presentation', () => {
  assert.match(read('components/layout/SiteShell.tsx'), /pathname === '\/marketplace'\) return <ServicesChrome>/);
  assert.match(read('app/marketplace/page.tsx'), /family=\{family\}\s+publicNormalization/);
  assert.match(explorer, /publicNormalization = false/);
  assert.doesNotMatch(css, /:global\(body|:global\(header|row-reverse|display:\s*none/);
});
test('Marketplace keyboard search reuses the current search action and dates have distinct names', () => {
  assert.match(explorer, /event.key === 'Enter' && event.target instanceof HTMLInputElement/);
  assert.match(explorer, /nextElementSibling\?\.querySelector\('button'\)\?\.click\(\)/);
  assert.match(explorer, /descriptiveDates=\{publicNormalization\}/);
  const filters = read('components/public/MarketplaceFilters.tsx');
  for (const name of ['Start date','End date','تاريخ البداية','تاريخ النهاية']) assert.ok(filters.includes(name));
  assert.match(explorer, /role=\{publicNormalization \? 'alert' : undefined\}/);
});
test('late-loading facets become visible and responsive filters cannot force desktop columns on phones', () => {
  assert.equal(explorer.match(/animate=\{publicNormalization \? 'visible' : undefined\}/g)?.length, 2);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /input\[type=date\] \{ width:100%/);
  assert.match(css, /focus-visible/);
});
test('normalization preserves real result, request and family contracts', () => {
  assert.match(explorer, /<ServicesGrid services=\{services.map\(service => \(\{ \.\.\.service, href: withSearchContext\(service.href, handoffContext\) \}\)\)\} loading=\{false\}/);
  assert.match(explorer, /const isActive = family === item.key/);
  assert.match(explorer, /meta.hasRealData \? t.verified : t.noVerified/);
  assert.match(explorer, /services.length === 0/);
  assert.doesNotMatch(explorer, /sampleInventory|fakePrice|booking_confirmed/);
});

// Isolated unit inputs only: never imported by the application or rendered as inventory.
for (const family of ['drive', 'stay', 'fly', 'concierge', 'vip']) {
  test(`${family} filter excludes all four other canonical families`, () => {
    const services = normalizeMarketplaceServices(['drive', 'stay', 'fly', 'concierge', 'vip'].map(key => ({
      id: `unit-${key}`, slug: `unit-${key}`, name_en: `Unit ${key}`,
      marketplace_family: key, marketplace_environment: 'production',
      fulfilment_state: 'catalog_only', transaction_method: 'none',
    })), { includeFallback: false });
    const result = filterMarketplaceServices(services, { family: `dir3-${family}` as MarketplaceFamilyKey });
    assert.equal(result.length, 1);
    assert.equal(result[0].family, `dir3-${family}`);
    assert.equal(result[0].fulfilmentState, 'catalog_only');
    assert.equal(result[0].transactionMethod, 'none');
  });
}
