import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  resolvePartnerProductCreateStatus,
  resolvePartnerProductUpdateStatus,
} from '../lib/partner-portal/product-status';

const root = process.cwd();
const route = fs.readFileSync(path.join(root, 'app/api/partner-portal/products/route.ts'), 'utf8');
const mediaRoute = fs.readFileSync(path.join(root, 'app/api/partner-portal/products/images/route.ts'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'components/portal/PartnerProviderPortalClient.tsx'), 'utf8');
const adminActions = fs.readFileSync(path.join(root, 'lib/actions/product-actions.ts'), 'utf8');

test('ordinary partner saves preserve every authoritative product status', () => {
  for (const status of ['published', 'draft', 'inactive', 'active', 'featured', 'archived']) {
    assert.deepEqual(resolvePartnerProductUpdateStatus(status, status, true), {
      ok: true,
      status,
      changed: false,
    });
    assert.deepEqual(resolvePartnerProductUpdateStatus(status, undefined, false), {
      ok: true,
      status,
      changed: false,
    });
  }
});

test('a draft product cannot self-publish through caller status', () => {
  assert.deepEqual(resolvePartnerProductUpdateStatus('draft', 'published', true), {
    ok: false,
    code: 'PRODUCT_STATUS_TRANSITION_DENIED',
    httpStatus: 403,
  });
});

test('partner status demotion follows the explicit draft/inactive contract', () => {
  assert.deepEqual(resolvePartnerProductUpdateStatus('published', 'draft', true), {
    ok: true,
    status: 'draft',
    changed: true,
  });
  assert.deepEqual(resolvePartnerProductUpdateStatus('published', 'inactive', true), {
    ok: true,
    status: 'inactive',
    changed: true,
  });
});

test('unknown caller status fails closed instead of becoming draft', () => {
  assert.deepEqual(resolvePartnerProductUpdateStatus('published', 'mystery', true), {
    ok: false,
    code: 'PRODUCT_STATUS_INVALID',
    httpStatus: 400,
  });
  assert.deepEqual(resolvePartnerProductCreateStatus('mystery', true), {
    ok: false,
    code: 'PRODUCT_STATUS_INVALID',
    httpStatus: 400,
  });
});

test('new products default to draft and cannot be created as published', () => {
  assert.deepEqual(resolvePartnerProductCreateStatus(undefined, false), {
    ok: true,
    status: 'draft',
    changed: false,
  });
  assert.deepEqual(resolvePartnerProductCreateStatus('published', true), {
    ok: false,
    code: 'PRODUCT_STATUS_TRANSITION_DENIED',
    httpStatus: 403,
  });
});

test('update route resolves status after owner scope and from authoritative product state', () => {
  const ownershipCheck = route.indexOf(".eq('partner_id', actor.userId)");
  const currentStatusRead = route.indexOf(".select('id, status')");
  const statusResolution = route.indexOf('resolvePartnerProductUpdateStatus(');
  const productUpdate = route.indexOf(".from('products')", currentStatusRead + 1);
  assert.ok(ownershipCheck >= 0 && ownershipCheck < currentStatusRead);
  assert.ok(currentStatusRead < statusResolution && statusResolution < productUpdate);
  assert.match(route, /PRODUCT_SCOPE_DENIED/);
});

test('publication remains an authenticated admin action outside the partner route', () => {
  assert.match(adminActions, /publishProductAction/);
  assert.match(adminActions, /requireAdminActionAccess\(\)/);
  assert.match(adminActions, /update\(\{ status: 'published', verified: true \}\)/);
  assert.doesNotMatch(route, /status:\s*['"]published['"]/);
});

test('media mutations cannot modify product publication status', () => {
  assert.doesNotMatch(mediaRoute, /from\(['"]products['"]\)[\s\S]*\.update\([\s\S]*\bstatus\b/);
});

test('Save and Continue submits the visible current status and advances only after success', () => {
  const start = portal.indexOf('async function saveExistingProduct');
  const end = portal.indexOf('  return (', start);
  const saveBlock = portal.slice(start, end);
  assert.match(saveBlock, /status: draft\.status/);
  assert.ok(saveBlock.indexOf('await loadAll()') < saveBlock.indexOf("setTab('bookings')"));
});
