import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

let routeSource = '';

test.before(() => {
  routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/api/partner-portal/products/route.ts'),
    'utf8',
  );
});

test('partner product status policy is server-authoritative and never silently normalizes', () => {
  assert.match(routeSource, /resolvePartnerProductCreateStatus/);
  assert.match(routeSource, /resolvePartnerProductUpdateStatus/);
  assert.match(routeSource, /\.select\(\s*['"]id, status['"]\s*\)/);
  assert.match(routeSource, /PRODUCT_STATUS_STALE/);
  assert.doesNotMatch(routeSource, /normalizeProductStatus/);
});

test('partner product updates are owner-scoped and exclude admin fields', () => {
  assert.match(routeSource, /\.eq\(\s*['"]product_id['"]\s*,\s*productId\s*\)\s*\.eq\(\s*['"]partner_id['"]\s*,\s*actor\.userId\s*\)/);
  assert.match(routeSource, /PRODUCT_SCOPE_DENIED/);
  const productUpdate = routeSource.match(/\.from\(\s*['"]products['"]\s*\)\s*\.update\(\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.notEqual(productUpdate, '');
  assert.doesNotMatch(productUpdate, /\b(partner_id|synthetic|verified|shield_certified)\b/);
  assert.match(routeSource, /requirePortalActor\(\)/);
});

test('admin publish remains outside the partner route', () => {
  assert.doesNotMatch(routeSource, /status:\s*['"]published['"]/);
  assert.doesNotMatch(routeSource, /status:\s*['"]active['"]/);
  assert.doesNotMatch(routeSource, /status:\s*['"]featured['"]/);
});
