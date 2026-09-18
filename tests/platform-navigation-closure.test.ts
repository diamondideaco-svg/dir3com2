import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('footer legal and support destinations have implemented pages', () => {
  const footer = read('components/layout/Footer.tsx');
  for (const route of ['terms', 'privacy', 'support']) {
    assert.match(footer, new RegExp(`href: '/${route}'`));
    assert.equal(fs.existsSync(path.join(root, `app/${route}/page.tsx`)), true);
  }
});

test('public navigation makes the full DABRA route canonical', () => {
  const header = read('components/layout/Header.tsx');
  const approvedVisual = read('components/approved/ApprovedVisualPage.tsx');
  assert.match(header, /href: '\/dabra'/);
  assert.match(approvedVisual, /href="\/dabra"/);
  assert.doesNotMatch(approvedVisual, /href="\/ai\/pilot"/);
});

test('marketplace browsing remains public for late authentication', () => {
  const proxy = fs.readFileSync(path.resolve('proxy.ts'), 'utf8');
  assert.match(proxy, /PUBLIC_PATHS[^\n]*['"]\/marketplace['"]/);
});

test('approved vehicle image formats remain public without opening the full directory', () => {
  const proxy = read('proxy.ts');
  assert.match(proxy, /PUBLIC_VEHICLE_ASSET_PATH/);
  for (const extension of ['avif', 'jpe?g', 'png', 'webp']) {
    assert.ok(proxy.includes(extension), `${extension} must remain in the exact vehicle asset allowlist`);
  }
  assert.match(proxy, /PUBLIC_VEHICLE_ASSET_PATH\.test\(pathname\)/);
  assert.doesNotMatch(proxy, /pathname\.startsWith\(['"]\/vehicles\/['"]\)/);
});

test('admin shell wires all approved routes and reuses canonical logout', () => {
  const shell = read('components/admin/AdminPlatformShell.tsx');
  const catalog = read('lib/navigation/route-catalog.ts');
  for (const route of ['/admin/audit', '/admin/events', '/admin/notifications', '/admin/shield', '/admin/partners/vip-local-egypt']) {
    assert.ok(catalog.includes(route), `${route} must be linked by the authoritative navigation model`);
  }
  assert.match(shell, /visibleProtectedNavigation/);
  assert.match(shell, /LogoutButton/);
  assert.match(read('components/layout/Header.tsx'), /LogoutButton/);
  assert.match(read('components/auth/LogoutButton.tsx'), /fetch\('\/api\/auth\/logout'/);
});
