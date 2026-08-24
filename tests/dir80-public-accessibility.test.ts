import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const header = fs.readFileSync(path.join(repoRoot, 'components/layout/Header.tsx'), 'utf8');
const publicHome = fs.readFileSync(path.join(repoRoot, 'components/home/PlatformFoundationHome.tsx'), 'utf8');
const servicePage = fs.readFileSync(path.join(repoRoot, 'components/services/ServicePageContent.tsx'), 'utf8');

test('legacy public service CTA copy is removed consistently', () => {
  assert.doesNotMatch(`${publicHome}\n${servicePage}`, /Explore services/i);
  assert.match(publicHome, /secondaryCta: 'View services'/);
  assert.match(servicePage, /'عرض الخدمات' : 'View services'/);
  assert.match(servicePage, /href=\{item\.href\}/);
});

test('shared Header exposes a real bilingual accessibility entry point', () => {
  assert.match(header, /accessibility: 'إمكانية الوصول'/);
  assert.match(header, /accessibility: 'Accessibility'/);
  assert.match(header, /<FiEye \/>/);
  assert.match(header, /aria-controls="header-accessibility-panel"/);
  assert.match(header, /aria-expanded=\{accessibilityOpen\}/);
  assert.match(header, /role="dialog"/);
  assert.match(header, /aria-labelledby="header-accessibility-title"/);
});

test('accessibility panel preserves working text and theme controls', () => {
  assert.match(header, /onClick=\{toggleTextSize\}/);
  assert.match(header, /onClick=\{toggleTheme\}/);
  assert.match(header, /aria-pressed=\{largeText\}/);
  assert.match(header, /aria-pressed=\{dark\}/);
  assert.match(header, /dir3com-accessibility/);
  assert.match(header, /dir3com-theme/);
});

test('panel has keyboard close, focus restoration, and mobile-sized controls', () => {
  assert.match(header, /event\.key === 'Escape'/);
  assert.match(header, /accessibilityTriggerRef\.current\?\.focus\(\)/);
  assert.match(header, /accessibilityFirstControlRef\.current\?\.focus\(\)/);
  assert.match(header, /focus-visible:ring-2/);
  assert.match(header, /min-h-11/);
  assert.match(header, /min-w-11/);
  assert.match(header, /xl:hidden/);
});
