import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DOCUMENT_UPLOAD_LIMIT_BYTES, validateAndNormalizeDocumentFile } from '../lib/security/document-validation';

const repoRoot = process.cwd();

test('invalid partner uploads are rejected by the shared policy before callers can fetch', async () => {
  const txt = new File([new TextEncoder().encode('plain text')], 'notes.txt', { type: 'text/plain' });
  const empty = new File([], 'empty.png', { type: 'image/png' });
  const oversized = new File([new Uint8Array(DOCUMENT_UPLOAD_LIMIT_BYTES + 1)], 'large.png', { type: 'image/png' });

  const txtResult = await validateAndNormalizeDocumentFile(txt);
  const emptyResult = await validateAndNormalizeDocumentFile(empty);
  const oversizedResult = await validateAndNormalizeDocumentFile(oversized);

  assert.equal(txtResult.ok, false);
  assert.equal(emptyResult.ok, false);
  assert.equal(oversizedResult.ok, false);
  if (!emptyResult.ok) assert.equal(emptyResult.code, 'DOCUMENT_INVALID_FILE');
  if (!oversizedResult.ok) assert.equal(oversizedResult.code, 'DOCUMENT_TOO_LARGE');
});

test('all partner upload callers validate before issuing their POST request', () => {
  const portal = fs.readFileSync(path.join(repoRoot, 'components/portal/PartnerProviderPortalClient.tsx'), 'utf8');
  const assets = fs.readFileSync(path.join(repoRoot, 'components/portal/OnboardingAssetsPanel.tsx'), 'utf8');

  assert.match(portal, /async function uploadDocument[\s\S]*validateAndNormalizeDocumentFile\(selectedFile\)[\s\S]*fetch\('\/api\/partner-portal\/documents'/);
  assert.match(portal, /async function uploadProductImage[\s\S]*validateAndNormalizeDocumentFile\(productImage\.file\)[\s\S]*fetch\('\/api\/partner-portal\/products\/images'/);
  assert.match(assets, /async function uploadMedia[\s\S]*validateAndNormalizeDocumentFile\(local\.file\)[\s\S]*fetch\('\/api\/partner-portal\/assets\/media'/);
  assert.equal((portal.match(/accept=\{uploadAccept\}/g) || []).length, 2);
  assert.equal((assets.match(/accept=\{uploadAccept\}/g) || []).length, 1);
});

test('private media previews use the authenticated signed URL route', () => {
  const panel = fs.readFileSync(path.join(repoRoot, 'components/portal/OnboardingAssetsPanel.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/partner-portal/assets/media/route.ts'), 'utf8');

  assert.doesNotMatch(panel, /storage\/v1\/object\/public\/partner-media/);
  assert.match(panel, /assets\/media\?mediaId=/);
  assert.match(route, /requirePortalActor\(\)/);
  assert.match(route, /ownedStoragePath/);
  assert.match(route, /createSignedUrl\(media\.url, 300\)/);
});

test('verified Arabic technical values have presentation mappings', () => {
  const sources = [
    fs.readFileSync(path.join(repoRoot, 'components/portal/PartnerProviderPortalClient.tsx'), 'utf8'),
    fs.readFileSync(path.join(repoRoot, 'components/portal/OnboardingAssetsPanel.tsx'), 'utf8'),
  ].join('\n');

  for (const value of ['commercial_registration', 'registration_commercial', 'pending', 'unverified', 'pending_review', 'review_pending']) {
    assert.match(sources, new RegExp(`${value}:`));
  }
  assert.match(sources, /[\u0600-\u06ff]/);
});
