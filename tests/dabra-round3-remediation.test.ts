import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  customerProductAliasId,
  customerProductSlug,
  hasLegacyCustomerIdentifier,
} from '@/lib/marketplace/customer-identifiers';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const productId = '06c334a0-d4a9-49ad-bc19-3018a24e8c0c';

test('real products with legacy-looking identifiers receive stable customer-safe aliases', () => {
  assert.equal(hasLegacyCustomerIdentifier('phase0-alhana-g05-jetour-t2-dark'), true);
  assert.equal(hasLegacyCustomerIdentifier('abu-al-anaq-seed-vehicle-01'), true);
  assert.equal(customerProductSlug(productId, 'phase0-alhana-g05-jetour-t2-dark'), `service-${productId}`);
  assert.equal(customerProductAliasId(`service-${productId}`), productId);
  assert.equal(customerProductSlug(productId, 'hyundai-cn7-2021-1787698612852'), 'hyundai-cn7-2021-1787698612852');
});

test('customer-safe aliases preserve the underlying product id and canonicalize old deep links', () => {
  const route = read('app/api/services/[slug]/route.ts');
  const detail = read('components/public/PublicServiceDetailClient.tsx');
  assert.match(route, /customerProductAliasId\(normalizedSlug\)/);
  assert.match(route, /customerProductSlug\(product\.id, product\.slug\)/);
  assert.match(detail, /router\.replace\(`\/services\/\$\{data\.slug\}/);
  assert.match(detail, /window\.location\.search/);
  assert.match(detail, /window\.location\.hash/);
});

test('public marketplace copy describes verified local partnership without internal-record claims', () => {
  const card = read('components/shared/ServiceCard.tsx');
  const detail = read('components/public/PublicServiceDetailClient.tsx');
  const explorer = read('components/public/MarketplaceExplorer.tsx');
  const combined = `${card}\n${detail}`;
  assert.match(combined, /verified local partner/);
  assert.match(combined, /شريك محلي موثّق/);
  assert.doesNotMatch(combined, /verified in dir3com records|موثّق وفق سجل dir3com/i);
  assert.match(explorer, /Published marketplace listings/);
  assert.doesNotMatch(explorer, /Verified inventory|No verified inventory|verified availability/i);
});

test('signed-out DABRA is public discovery and persona names are presentation-only', () => {
  const panel = read('components/dabra/DabraFamilySafetyPanel.tsx');
  const contract = read('lib/dabra/family-contract.ts');
  const route = read('app/api/dabra/family/route.ts');
  assert.match(panel, /Public discovery mode/);
  assert.match(panel, /وضع الاستكشاف العام/);
  assert.doesNotMatch(panel, /Current assistant identity|هوية المساعدة الحالية/);
  assert.match(contract, /Presentation personas, NOT values of profiles\.role/);
  assert.match(route, /identityModel: 'capability_persona'/);
  assert.match(route, /canonicalRole: actor\.platformRole/);
});

test('locale changes remount the session and abort stale assistant work', () => {
  const floating = read('components/layout/FloatingDibrah.tsx');
  assert.match(floating, /<FloatingDibrahSession key=\{language\} language=\{language\}/);
  assert.match(floating, /chatAbortRef\.current\?\.abort\(\)/);
  assert.match(floating, /controller\.signal\.aborted \|\| activeRequestIdRef\.current !== requestId/);
  assert.match(floating, /fetch\('\/api\/services\?view=assistant', \{ cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(floating, /if \(!controller\.signal\.aborted\) setAssistantContext\(null\)/);
});
