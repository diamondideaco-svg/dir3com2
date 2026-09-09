import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPersistedPortalRecord } from '../lib/partner-portal/persisted-record';
import { readPortalSections } from '../lib/partner-portal/section-load';
import { isCurrentPartnerAssignment } from '../lib/partner-portal/booking-visibility';

const record = { id: 'asset-a', ownerId: 'owner-a', ownerKind: 'drive_partner' };
const row = { id: 'asset-a', owner_id: 'owner-a', owner_kind: 'drive_partner', record };
test('durable identity accepts only physical tenant-bound records', () => {
  assert.equal(readPersistedPortalRecord(row), record);
  for (const patch of [{ id: 'asset-b' }, { ownerId: 'owner-b' }, { ownerKind: 'stay_supplier' }, { ownerId: undefined }]) {
    assert.throws(() => readPersistedPortalRecord({ ...row, record: { ...record, ...patch } }), /IDENTITY_CONFLICT/);
  }
  assert.throws(() => readPersistedPortalRecord({ ...row, owner_id: '' }), /IDENTITY_CONFLICT/);
});
test('durable media and review association columns cannot be forged in JSON', () => {
  for (const physical of [{ asset_id: 'other' }, { storage_path: 'other-owner/file' }, { media_id: 'other-media' }]) {
    assert.throws(() => readPersistedPortalRecord({ ...row, ...physical }), /IDENTITY_CONFLICT/);
  }
  assert.deepEqual(readPersistedPortalRecord({ ...row, media_id: null, record: { ...record, mediaId: 'catalog-update' } }), { ...record, mediaId: 'catalog-update' });
});
const read = (file: string) => readFileSync(file, 'utf8');
test('partner presentation is route-scoped and preserves public chrome branches', () => {
  const shell = read('components/layout/SiteShell.tsx');
  assert.match(shell, /pathname === '\/partner-portal' \|\| pathname === '\/partner-portal\/requests'/);
  assert.match(shell, /pathname === '\/'\) return <HomeChrome/);
  assert.match(shell, /pathname === '\/login'\) return <Chrome/);
  const css = read('components/portal/partner-workspace.module.css');
  assert.match(css, /\.workspace\[dir='rtl'\]/);
  assert.match(css, /--font-tajawal/);
  assert.match(css, /--font-montserrat/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /row-reverse|linear-gradient|radial-gradient/);
});
test('partner UI never turns load failures into editable empty success', () => {
  const ui = read('components/portal/PartnerProviderPortalClient.tsx');
  assert.match(ui, /readPortalSections\(\)/);
  assert.match(ui, /loadState === 'ready'/);
  assert.match(ui, /loadState === 'ready' && !sectionErrors\[tab\]/);
  assert.match(ui, /There are no records in this section yet/);
  assert.match(ui, /There are no services in the list yet/);
  assert.doesNotMatch(ui, /tab === 'products' && products.length === 0/);
  const assets = read('components/portal/OnboardingAssetsPanel.tsx');
  assert.match(assets, /operational \? Promise.resolve\(null\)/);
  assert.match(assets, /!operational && <div[\s\S]*t\.reviewQueue/);
  assert.match(assets, /!assetsRes.ok/);
  assert.match(assets, /fetch\(operational \? '\/api\/partner-portal\/assets'/);
  assert.match(assets, /assets.find\(\(asset\) => asset.id === assetId\)\?\.ownerKind/);
});
test('partner read failures fail truthfully and review authority stays privileged', () => {
  for (const name of ['documents', 'compliance', 'bookings', 'settlements']) {
    const route = read(`app/api/partner-portal/${name}/route.ts`);
    assert.match(route, /status: 500/);
    assert.doesNotMatch(route, /if \(error\)[\s\S]{0,80}return NextResponse.json\(\{ data: \[\] \}/);
  }
  assert.match(read('app/api/partner-portal/assets/route.ts'), /verificationStatus: isPrivilegedPortalActor\(actor\)/);
  assert.match(read('components/portal/PartnerRequestsClient.tsx'), /A request is not a confirmed booking/);
});

test('each section contains HTTP, network and malformed-payload failures without hiding healthy sections', async () => {
  for (const failure of ['http', 'network', 'shape']) {
    const request = (async (url: string | URL | Request) => {
      const endpoint = String(url).split('/').at(-1);
      if (endpoint === 'settlements') {
        if (failure === 'network') throw new Error('offline');
        return Response.json({ error: { code: 'PORTAL_SETTLEMENTS_UNAVAILABLE' } }, { status: failure === 'http' ? 503 : 200 });
      }
      const data = endpoint === 'profile' ? { partner: { id: 'own-partner' } }
        : endpoint === 'compliance' ? { requiredDocuments: [], missingDocuments: [], expiredDocuments: [], pendingReviews: 0 } : [];
      return Response.json({ data });
    }) as typeof fetch;
    const result = await readPortalSections(request);
    assert.deepEqual(result.settlements, { state: 'error' });
    for (const section of ['profile', 'docs', 'products', 'bookings', 'compliance'] as const) assert.equal(result[section].state, 'ready');
  }
});

test('booking visibility rejects historical, declined, missing and ambiguous ownership', () => {
  const current = { partner_id: 'a', assignment_status: 'assigned', assigned_at: '2026-09-09T10:00:00Z' };
  const old = { ...current, assigned_at: '2026-09-08T10:00:00Z' };
  assert.equal(isCurrentPartnerAssignment([current, old], 'a'), true);
  assert.equal(isCurrentPartnerAssignment([{ ...current, assignment_status: 'accepted' }], 'a'), true);
  for (const rows of [null, [], [{ ...current, partner_id: 'b' }, old], [{ ...current, assignment_status: 'declined' }], [current, current], [{ ...current, assigned_at: '' }]]) {
    assert.equal(isCurrentPartnerAssignment(rows, 'a'), false);
  }
  const route = read('app/api/partner-portal/bookings/route.ts');
  assert.match(route, /\.from\('partner_assignments'\)/);
  assert.match(route, /\.eq\('partner_id', actor.userId\)/);
  assert.match(route, /\.in\('id', ids\)/);
  assert.match(route, /referencedTable: 'partner_assignments', ascending: false/);
  assert.match(route, /isCurrentPartnerAssignment\(row.partner_assignments, actor.userId\)/);
  assert.doesNotMatch(route, /guest_name|guest_email|guest_phone/);
});
