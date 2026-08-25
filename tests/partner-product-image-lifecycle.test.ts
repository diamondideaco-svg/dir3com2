import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const route = () => fs.readFileSync(path.join(root, 'app/api/partner-portal/products/images/route.ts'), 'utf8');
const ui = () => fs.readFileSync(path.join(root, 'components/portal/PartnerProviderPortalClient.tsx'), 'utf8');

test('partner image mutations prove actor, product, and image ownership', () => {
  const source = route();
  assert.match(source, /requirePortalActor\(\)/);
  assert.match(source, /export async function POST[\s\S]*if \(!actor\)[\s\S]*status: 403/);
  assert.match(source, /export async function DELETE[\s\S]*if \(!actor\)[\s\S]*status: 403/);
  assert.match(source, /eq\('partner_id', actorId\)/);
  assert.match(source, /getOwnedImage\(imageId, actor\.userId\)/);
  assert.match(source, /owned\.image\.product_id !== productId/);
  assert.match(source, /eq\('product_id', productId\)/);
  assert.match(source, /IMAGE_ACCESS_DENIED/);
});

test('delete removes private object before its product_images row', () => {
  const source = route();
  const storageDelete = source.indexOf("storage.from(BUCKET).remove([owned.image.image_url])");
  const rowDelete = source.indexOf("from('product_images').delete().eq('id', owned.image.id)");
  assert.notEqual(storageDelete, -1);
  assert.notEqual(rowDelete, -1);
  assert.ok(storageDelete < rowDelete);
  assert.match(source, /export async function DELETE/);
});

test('replace persists new image before cleaning up old image', () => {
  const source = route();
  const newInsert = source.indexOf('.insert({');
  const oldStorageDelete = source.indexOf('oldImage.image_url');
  const oldRowDelete = source.indexOf('oldImage.id');
  assert.notEqual(newInsert, -1);
  assert.notEqual(oldStorageDelete, -1);
  assert.notEqual(oldRowDelete, -1);
  assert.ok(newInsert < oldStorageDelete);
  assert.ok(oldStorageDelete < oldRowDelete);
  assert.match(source, /replaceImageId/);
});

test('partner UI exposes replacement preview and confirmed deletion', () => {
  const source = ui();
  assert.match(source, /replaceProductImage/);
  assert.match(source, /deleteProductImage/);
  assert.match(source, /window\.confirm\(t\.confirmDelete\)/);
  assert.match(source, /URL\.createObjectURL\(file\)/);
  assert.match(source, /replaceImage/);
  assert.match(source, /deleteImage/);
});
