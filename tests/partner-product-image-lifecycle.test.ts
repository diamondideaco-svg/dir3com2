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

test('delete persists cleanup intent and removes the row before the private object', () => {
  const source = route();
  assert.match(source, /from\('partner_image_cleanup_queue'\)\.upsert[\s\S]*from\('product_images'\)[\s\S]*\.delete\(\)[\s\S]*storage\.from\(BUCKET\)\.remove\(\[image\.image_url\]\)/);
  assert.match(source, /IMAGE_CLEANUP_PENDING/);
  assert.match(source, /export async function DELETE/);
});

test('replace persists new image before cleaning up old image', () => {
  const source = route();
  const newInsert = source.indexOf('.insert({');
  const durableCleanup = source.indexOf('deleteImageDurably(actor.userId, oldImage)');
  assert.notEqual(newInsert, -1);
  assert.notEqual(durableCleanup, -1);
  assert.ok(newInsert < durableCleanup);
  assert.match(source, /OLD_IMAGE_CLEANUP_PENDING/);
  assert.match(source, /replaceImageId/);
});

test('replacement upload fails closed before association or old-image cleanup', () => {
  const source = route();
  const uploadFailure = source.indexOf('if (!upload.ok)');
  const newInsert = source.indexOf('.insert({', uploadFailure);
  const durableCleanup = source.indexOf('deleteImageDurably(actor.userId, oldImage)');
  assert.notEqual(uploadFailure, -1);
  assert.notEqual(newInsert, -1);
  assert.notEqual(durableCleanup, -1);
  assert.ok(uploadFailure < newInsert);
  assert.ok(newInsert < durableCleanup);
  assert.match(source, /if \(error\) \{[\s\S]*storage\.from\(BUCKET\)\.remove\(\[path\]\)[\s\S]*throw error/);
});

test('replacement retries one server-authored path and reconciles ambiguous storage results', () => {
  const source = route();
  assert.match(source, /uploadStorageObjectWithRecovery/);
  assert.match(source, /bucket\.list\(folder, \{ limit: 2, search: filename \}\)/);
  assert.match(source, /item\.name === filename/);
  assert.match(source, /const path = buildPath\(actor\.userId, productId/);
  assert.doesNotMatch(source, /upsert:\s*true/);
});

test('missing old object completes durable row cleanup without deleting the replacement', () => {
  const source = route();
  assert.match(source, /if \(!storageError \|\| isMissingStorageObject\(storageError\)\)/);
  assert.match(source, /from\('partner_image_cleanup_queue'\)[\s\S]*\.delete\(\)[\s\S]*return \{ cleanupPending: false \}/);
  assert.match(source, /storage\.from\(BUCKET\)\.remove\(\[image\.image_url\]\)/);
});

test('replacement never changes product ownership and invalid media IDs fail closed', () => {
  const source = route();
  assert.match(source, /const replaceImageId = safeImageId\(formData\.get\('replaceImageId'\)\)/);
  assert.match(source, /if \(replaceImageId\)[\s\S]*getOwnedImage\(replaceImageId, actor\.userId\)/);
  assert.match(source, /owned\.image\.product_id !== productId/);
  assert.doesNotMatch(source, /from\('product_availability'\)[\s\S]{0,160}\.update\(/);
});

test('partner preview distinguishes a missing object from a storage outage', () => {
  const source = route();
  assert.match(source, /isMissingStorageObject\(error\)/);
  assert.match(source, /IMAGE_OBJECT_NOT_FOUND/);
  assert.match(source, /status: 404/);
  assert.match(source, /PRODUCT_IMAGE_PREVIEW_FAILED/);
  assert.match(source, /status: 500/);
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
