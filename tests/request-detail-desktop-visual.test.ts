import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('only a single-segment request detail path selects the desktop shell', () => {
  const source = read('components/layout/SiteShell.tsx');
  assert.ok(source.includes("if (/^\\/my-requests\\/[^/]+$/.test(pathname)) return <RequestDetailSiteShell"));
  const pathPattern = /^\/my-requests\/[^/]+$/;
  assert.equal(pathPattern.test('/my-requests/REQ-FC5095B5'), true);
  for (const path of ['/support', '/my-bookings', '/my-requests', '/my-requests/a/other']) assert.equal(pathPattern.test(path), false);
});

test('request detail reuses approved composition and preserves the legacy tablet fallback', () => {
  const source = read('components/layout/SiteShell.tsx');
  assert.match(source, /desktop \? <div className=\{requestStyles.desktop\}><SupportDesktopShell>\{children\}<\/SupportDesktopShell><\/div> : <PublicSiteChrome pathname=\{pathname\}>\{children\}<\/PublicSiteChrome>/);
  assert.match(read('components/v6/ProfileDesktopFrame.tsx'), /min-width:1051px/);
  const master = read('components/v6/SupportDesktopShell.tsx');
  assert.match(master, /<CustomerHeader/);
  assert.match(master, /<CustomerFooter surface="white"/);
  assert.match(master, /role: ar \? 'خدمة العملاء' : 'Customer Service'/);
  assert.equal((master.match(/<FloatingDibrah /g) ?? []).length, 1);
});

test('request palette is desktop-scoped and does not redefine geometry or mobile', () => {
  const css = read('components/v6/request-detail-desktop.module.css').split('/* Phone-only layout;')[0];
  assert.match(css, /@media \(min-width:1051px\)/);
  for (const color of ['#fff', '#f8f9fa', '#d4af37', '#0d1b2a']) assert.ok(css.includes(color));
  assert.doesNotMatch(css, /row-reverse|padding:|margin:|min-height:|height:|display:|:global|#FAF8F4/i);
});

test('the untouched request body retains its fields, navigation and explicit non-booking statement', () => {
  const body = read('components/account/MarketplaceRequestDetail.tsx');
  assert.equal((body.match(/<DetailItem /g) ?? []).length, 10);
  assert.match(body, /Marketplace request — not a booking record/);
  assert.match(body, /طلب سوق — ليس سجل حجز/);
  assert.match(body, /confirmed: 'Request confirmed'/);
  assert.match(body, /awaiting_payment: 'No confirmed payment'/);
  assert.match(body, /href="\/my-bookings"/);
  assert.doesNotMatch(body, /fetch\(|\.update\(|\.insert\(/);
});
