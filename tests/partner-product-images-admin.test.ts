import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('admin product table exposes existing images through the admin preview route', () => {
  const page = fs.readFileSync(path.join(root, 'app/admin/products/page.tsx'), 'utf8');
  const table = fs.readFileSync(path.join(root, 'components/products/ProductTable.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'app/api/admin/products/images/[id]/route.ts'), 'utf8');

  assert.match(page, /product_images\(id, product_id, image_url/);
  assert.match(table, /api\/admin\/products\/images/);
  assert.match(table, /product\.product_images/);
  assert.match(route, /requireAdminActionAccess\(\)/);
  assert.match(route, /createSignedUrl\(image\.image_url, 300\)/);
  assert.doesNotMatch(route, /object\/public/);
});

test('admin image preview route rejects missing image ids before storage access', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/admin/products/images/[id]/route.ts'), 'utf8');
  assert.match(route, /IMAGE_ID_REQUIRED/);
  assert.match(route, /IMAGE_NOT_FOUND/);
});

test('admin image preview distinguishes a missing private object from a storage outage', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/admin/products/images/[id]/route.ts'), 'utf8');

  assert.match(route, /isMissingStorageObject\(signedError\)/);
  assert.match(route, /IMAGE_OBJECT_NOT_FOUND/);
  assert.match(route, /status: 404/);
  assert.match(route, /ADMIN_IMAGE_PREVIEW_FAILED/);
  assert.match(route, /status: 500/);
});
