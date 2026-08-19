import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/partner-portal/products/route.ts'),
  'utf8',
);

test('partner product status policy allows drafts only and never publishes', () => {
  assert.match(routeSource, /new Set\(\['draft', 'inactive'\]\)/);
  assert.doesNotMatch(routeSource, /new Set\(\[[^\]]*['"](published|active|featured)['"]/);
});

test('partner product updates are owner-scoped and exclude admin fields', () => {
  assert.match(routeSource, /\.eq\('product_id', productId\)\s*\.eq\('partner_id', actor\.userId\)/);
  assert.match(routeSource, /PRODUCT_SCOPE_DENIED/);
  const productUpdate = routeSource.match(/\.from\('products'\)\s*\.update\(\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.notEqual(productUpdate, '');
  assert.doesNotMatch(productUpdate, /\b(partner_id|synthetic|verified|shield_certified)\b/);
  assert.match(routeSource, /requirePortalActor\(\)/);
});

test('admin publish remains outside the partner route', () => {
  assert.doesNotMatch(routeSource, /status:\s*['"]published['"]/);
  assert.doesNotMatch(routeSource, /status:\s*['"]active['"]/);
  assert.doesNotMatch(routeSource, /status:\s*['"]featured['"]/);
});
