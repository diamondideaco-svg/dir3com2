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
  const migration = read('supabase/migrations/20260827152245_partner_portal_durable_state_and_documents.sql');
  for (const table of ['partner_portal_assets', 'partner_portal_asset_media', 'partner_portal_review_queue', 'partner_portal_contracts']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /\(select auth\.uid\(\)\) = owner_id/);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = owner_id\)/);
  assert.match(migration, /revoke all[\s\S]*from anon, authenticated/);
  assert.doesNotMatch(migration, /grant update[\s\S]{0,160}verified/);
  assert.match(migration, /revoke update, delete on table public\.partner_documents from authenticated/);

  const remediation = read('supabase/migrations/20260827155608_partner_document_review_boundary_and_image_cleanup.sql');
  assert.match(remediation, /drop policy if exists partner_documents_owner_update/);
  assert.match(remediation, /revoke update, delete on table public\.partner_documents from authenticated/);
  assert.match(remediation, /revoke all on table public\.partners, public\.partner_documents from anon, authenticated/);
  assert.doesNotMatch(remediation, /grant select on table public\.partners/);
  assert.match(remediation, /grant select on table public\.partner_documents to authenticated/);
  assert.match(remediation, /to_regclass\('public\.partner_users'\)/);
  assert.doesNotMatch(remediation, /grant select on table public\.partner_users to authenticated/);
  assert.match(remediation, /create table if not exists public\.partner_image_cleanup_queue/);
  assert.match(remediation, /revoke all on table public\.partner_image_cleanup_queue from anon, authenticated/);
});

test('admin partner reads stay server-authoritative after partner table grants are revoked', () => {
  const listPage = read('app/admin/partners/page.tsx');
  const detailPage = read('app/admin/partners/[id]/page.tsx');

  for (const source of [listPage, detailPage]) {
    assert.match(source, /supabaseAdmin/);
    assert.doesNotMatch(source, /createSupabaseServerClient/);
  }
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
