import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('production onboarding routes use the authoritative repository without tmpdir, memory, or runtime seeds', () => {
  const repository = read('lib/partner-portal/onboarding-repository.ts');
  const productionRoutes = [
    read('app/api/partner-portal/assets/route.ts'),
    read('app/api/partner-portal/assets/media/route.ts'),
    read('app/api/partner-portal/review-queue/route.ts'),
  ].join('\n');
  assert.match(productionRoutes, /onboarding-repository/);
  assert.doesNotMatch(productionRoutes, /onboarding-store/);
  assert.doesNotMatch(repository, /os\.tmpdir|memoryStore|seedAssets|seedMedia|seedContracts|node:fs/);
  assert.match(repository, /partner_portal_assets/);
  assert.match(repository, /partner_portal_asset_media/);
  assert.match(repository, /partner_portal_review_queue/);
  assert.match(repository, /persist_partner_portal_state/);
  assert.doesNotMatch(repository, /Promise\.all\(operations\)/);
  assert.match(repository, /\.eq\('owner_id', actor\.userId\)/);
  assert.match(repository, /record\.ownerId === actor\.userId/);
  assert.match(repository, /Partial<PortalOnboardingStore>/);
  assert.match(read('app/api/partner-portal/review-queue/route.ts'), /reviewQueue: \[queueItem\]/);
  assert.match(read('app/api/partner-portal/assets/route.ts'), /export async function POST/);
});

test('durable portal migration enforces owner-scoped RLS and client grants', () => {
  const migration = read('supabase/migrations/20260827140708_partner_portal_durable_state_and_documents.sql');
  for (const table of ['partner_portal_assets', 'partner_portal_asset_media', 'partner_portal_review_queue', 'partner_portal_contracts']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /\(select auth\.uid\(\)\) = owner_id/);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = owner_id\)/);
  assert.match(migration, /revoke all[\s\S]*from anon, authenticated/);
});

test('private document lifecycle is owner-scoped, signed, sanitized, and complete', () => {
  const route = read('app/api/partner-portal/documents/route.ts');
  const ui = read('components/portal/PartnerProviderPortalClient.tsx');
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /createSignedUrl\(document\.file_url, 300/);
  assert.match(route, /sanitizeDownloadFilename/);
  assert.match(route, /DOCUMENT_OBJECT_NOT_FOUND/);
  assert.match(route, /replaceDocumentId/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /\.eq\('partner_id', actor\.userId\)/);
  assert.match(route, /isMissingStorageObject\(storageError\)/);
  assert.match(route, /partner_storage_cleanup_queue/);
  assert.match(route, /retryPendingCleanup/);
  assert.doesNotMatch(route, /object\/public|getPublicUrl|https?:\/\//);
  assert.match(ui, /uploadDocument\(doc\.id\)/);
  assert.match(ui, /deleteDocument\(doc\.id\)/);
});
