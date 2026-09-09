import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { customerNavigationItems, partnerNavigationItems, protectedNavigationItems, publicSitemapPaths, routeCatalog, visibleProtectedNavigation } from '../lib/navigation/route-catalog';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('public sitemap contains only classified public indexable routes', () => {
  assert.ok(publicSitemapPaths.includes('/'));
  for (const route of ['/services', '/services/drive', '/services/stay', '/services/fly', '/services/concierge', '/services/vip', '/marketplace', '/about', '/contact', '/dabra', '/terms', '/privacy', '/support']) {
    assert.ok(publicSitemapPaths.includes(route), `${route} must be publicly discoverable`);
  }
  assert.equal(publicSitemapPaths.some((route) => /^(\/admin|\/partner-portal|\/provider-portal|\/my-|\/api|\/auth|\/booking|\/dashboard|\/profile)/.test(route)), false);
  assert.ok(routeCatalog.filter((entry) => entry.indexable).every((entry) => entry.audience === 'public' && !entry.protected));
});

test('robots excludes authenticated and internal route families', () => {
  const robots = read('app/robots.ts');
  for (const prefix of ['/admin/', '/partner-portal/', '/provider-portal/', '/my-account', '/my-bookings', '/my-documents', '/my-wallet', '/my-requests', '/auth/', '/api/']) {
    assert.ok(robots.includes(`'${prefix}'`), `${prefix} must be disallowed`);
  }
});

test('public route hub exposes bilingual labels without inventing destinations', () => {
  const source = read('components/public/public-page-data.ts');
  const hub = read('components/public/PublicRouteIndex.tsx');
  for (const route of ['/services', '/marketplace', '/apartments', '/experiences', '/offers', '/about', '/contact']) {
    assert.ok(source.includes(`href: '${route}'`), `${route} needs a public hub path`);
  }
  assert.match(hub, /link\.ar/);
  assert.match(hub, /link\.en/);
  assert.match(hub, /dir=\{direction\}/);
});

test('every static top-level user page is classified', () => {
  const classified = new Set(routeCatalog.map((entry) => entry.path));
  const pages: string[] = [];
  function visit(directory: string, segments: string[]) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'api') continue;
      const routeSegments = entry.name.startsWith('(') ? segments : [...segments, entry.name];
      if (routeSegments.some((segment) => segment.includes('['))) continue;
      const child = path.join(directory, entry.name);
      if (fs.existsSync(path.join(child, 'page.tsx'))) pages.push(`/${routeSegments.join('/')}`);
      visit(child, routeSegments);
    }
  }
  visit(path.join(root, 'app'), []);
  for (const route of pages) assert.ok(classified.has(route), `${route} needs an explicit classification`);
});

test('customer and partner top-level routes have bilingual authoritative navigation', () => {
  assert.deepEqual(customerNavigationItems.map((item) => item.href), ['/my-account', '/my-bookings', '/my-wallet', '/my-documents', '/favorites', '/my-profile', '/support']);
  assert.deepEqual(partnerNavigationItems.map((item) => item.href), ['/partner-portal', '/partner-portal/requests']);
  for (const item of [...customerNavigationItems, ...partnerNavigationItems]) {
    assert.ok(item.ar.trim() && item.en.trim());
    assert.ok(routeCatalog.some((entry) => entry.path === item.href));
  }
});

test('protected navigation is permission-aware and global modules never leak to scoped staff', () => {
  const scoped = visibleProtectedNavigation(false, ['customers:read']);
  assert.deepEqual(scoped.map((item) => item.href), ['/admin/customers']);
  assert.equal(scoped.some((item) => item.globalOnly), false);
  assert.equal(visibleProtectedNavigation(false, []).length, 0);
  const global = visibleProtectedNavigation(true, []);
  assert.deepEqual(global, protectedNavigationItems);
  assert.ok(global.some((item) => item.href === '/admin/bookings'));
  assert.ok(global.some((item) => item.href === '/admin/dashboard'));
});

test('dynamic detail routes are contextual rather than sidebar entries', () => {
  const dynamic = routeCatalog.filter((entry) => entry.path.includes('['));
  assert.ok(dynamic.length > 0);
  assert.ok(dynamic.every((entry) => entry.discoverability === 'contextual' && entry.parent));
  assert.equal(protectedNavigationItems.some((item) => item.href.includes('[')), false);
});
