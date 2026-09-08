import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Support alone selects approved shell and retains the tablet public fallback', () => {
  const shell = read('components/layout/SiteShell.tsx');
  assert.match(shell, /if \(pathname === '\/support'\) return <SupportSiteShell>/);
  assert.match(shell, /desktop \? <SupportDesktopShell>\{children\}<\/SupportDesktopShell> : <PublicSiteChrome pathname="\/support">\{children\}<\/PublicSiteChrome>/);
  assert.match(read('components/v6/ProfileDesktopFrame.tsx'), /min-width:1051px/);
});

test('Support reuses approved header, white footer and one Customer Service launcher without body replacement', () => {
  const shell = read('components/v6/SupportDesktopShell.tsx');
  assert.match(shell, /import \{ CustomerHeader, CustomerFooter \} from '\.\/CustomerChrome'/);
  assert.match(shell, /<CustomerFooter surface="white" className=\{styles.footer\}/);
  assert.equal((shell.match(/<FloatingDibrah /g) ?? []).length, 1);
  assert.match(shell, /customerStyles.customerLauncher/);
  assert.match(shell, /<DabraCompact artwork="customer-service"/);
  assert.match(shell, /role: ar \? 'خدمة العملاء' : 'Customer Service'/);
  assert.match(shell, /\{children\}/);
  assert.doesNotMatch(shell, /<main|<h1|<form|fetch\(|supabase|viewer=/);
});

test('Support footer order is component-scoped and desktop-only; no global body resets', () => {
  const css = read('components/v6/support-desktop.module.css');
  assert.match(css, /@media \(min-width:1051px\)/);
  for (const [section, column] of [[1, 3], [2, 2], [3, 1]]) {
    assert.ok(css.includes(`section:nth-child(${section}) { grid-column:${column}; grid-row:1; }`));
  }
  assert.match(css, /\.footer \{ margin-top:auto; background:#fff;/);
  assert.doesNotMatch(css, /row-reverse|\.root|^\s*(body|h1|main)\s*\{/m);
  assert.match(css, /\.shell\[data-large=true\] > main \{ zoom:1\.06; \}/);
});

test('Support still offers only its existing contact, privacy and terms links', () => {
  const body = read('app/support/page.tsx');
  assert.deepEqual([...body.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['/contact', '/privacy', '/terms']);
  assert.doesNotMatch(body, /<input|<form|<textarea/);
});
