import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const portal = fs.readFileSync(path.join(root, 'components/portal/PartnerProviderPortalClient.tsx'), 'utf8');
const productsRoute = fs.readFileSync(path.join(root, 'app/api/partner-portal/products/route.ts'), 'utf8');

function sourceBlock(start: string, end: string) {
  const startIndex = portal.indexOf(start);
  const endIndex = portal.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source block: ${start}`);
  assert.notEqual(endIndex, -1, `missing source block end: ${end}`);
  return portal.slice(startIndex, endIndex);
}

const uploadBlock = sourceBlock('async function uploadProductImage()', 'async function replaceProductImage');
const replaceBlock = sourceBlock('async function replaceProductImage', 'async function deleteProductImage');
const deleteBlock = sourceBlock('async function deleteProductImage', 'function updateProductDraft');
const saveBlock = sourceBlock('async function saveExistingProduct', '  return (');

test('upload then save uses refreshed server media state', () => {
  assert.match(uploadBlock, /if \(!response\.ok\)[\s\S]*await loadAll\(\)[\s\S]*setProductImage\(\{ productId: '', file: null, previewUrl: '' \}\)/);
  assert.ok(portal.indexOf('async function uploadProductImage()') < portal.indexOf('async function saveExistingProduct'));
});

test('replace then save drops the replaced media draft after server reconciliation', () => {
  assert.match(replaceBlock, /if \(!response\.ok\)[\s\S]*await loadAll\(\)[\s\S]*delete next\[imageId\]/);
});

test('delete old media then save reloads without retaining the deleted media id', () => {
  assert.match(deleteBlock, /method: 'DELETE'[\s\S]*if \(!response\.ok\)[\s\S]*await loadAll\(\)/);
  assert.doesNotMatch(saveBlock, /imageId|mediaId|deletedMedia/);
});

test('upload replace delete save and continue advances exactly one portal step', () => {
  const put = saveBlock.indexOf("method: 'PUT'");
  const reload = saveBlock.indexOf('await loadAll()');
  const success = saveBlock.indexOf('setMessage(t.done)');
  const advance = saveBlock.indexOf("setTab('bookings')");
  assert.ok(put >= 0 && put < reload && reload < success && success < advance);
  assert.match(portal, /\['products', t\.tabProducts\],[\s\S]*\['bookings', t\.tabBookings\]/);
});

test('deleted media ids are never submitted in the product save payload', () => {
  assert.match(saveBlock, /body: JSON\.stringify\(\{[\s\S]*productId: draft\.productId[\s\S]*status: draft\.status/);
  assert.doesNotMatch(saveBlock, /replacementImages|productImage|imageId|mediaId/);
});

test('busy state always clears after product save success or failure', () => {
  assert.match(saveBlock, /setBusy\(true\)[\s\S]*finally \{[\s\S]*setBusy\(false\)/);
  assert.match(portal, /disabled=\{busy\}[\s\S]*saveExistingProduct/);
});

test('draft validation is rebuilt from the server after media and product mutations', () => {
  assert.match(portal, /setProductDrafts\(buildProductDrafts\(productRows\)\)/);
  assert.match(saveBlock, /await loadAll\(\)/);
});

test('successful save validates the response before advancing', () => {
  assert.match(saveBlock, /await response\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(saveBlock, /payload\?\.data\?\.product\?\.id !== productId/);
  assert.match(saveBlock, /UPDATE_PRODUCT_RESPONSE_INVALID/);
});

test('failed save shows an explicit error and cannot reach the step transition', () => {
  assert.match(saveBlock, /if \(!response\.ok\)[\s\S]*throw new Error\('UPDATE_PRODUCT_FAILED'\)/);
  assert.match(saveBlock, /catch \{[\s\S]*setMessage\(t\.saveFailed\)/);
  assert.match(portal, /saveFailed: 'تعذر حفظ الخدمة\. لم يتم الانتقال\.'/);
});

test('reload persistence is backed by the owner-scoped update response and subsequent read', () => {
  assert.match(productsRoute, /\.eq\('product_id', productId\)[\s\S]*\.eq\('partner_id', actor\.userId\)/);
  assert.match(productsRoute, /product: updatedProduct/);
  assert.match(saveBlock, /await loadAll\(\)[\s\S]*setMessage\(t\.done\)/);
  assert.match(portal, /saveContinue: 'Save & Continue'/);
});
