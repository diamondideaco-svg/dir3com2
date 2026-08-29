import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getMarketplaceFamilyLabel,
  isMarketplaceFamilyKey,
  marketplaceFamilyDefinitions,
  type MarketplaceFamilyKey,
} from '@/lib/marketplace/data';

const explorerSource = readFileSync('components/public/MarketplaceExplorer.tsx', 'utf8');
const pageSource = readFileSync('app/marketplace/page.tsx', 'utf8');

const expectedFamilies: Array<[MarketplaceFamilyKey, string, string]> = [
  ['dir3-fly', 'الطيران', 'Fly'],
  ['dir3-stay', 'الإقامة', 'Stay'],
  ['dir3-drive', 'التنقّل', 'Drive'],
  ['dir3-concierge', 'الكونسيرج', 'Concierge'],
  ['dir3-vip', 'VIP', 'VIP'],
];

test('canonical URL family context resolves All and all five families deterministically', () => {
  assert.equal(getMarketplaceFamilyLabel(undefined, 'en', 'All'), 'All');
  assert.equal(getMarketplaceFamilyLabel(undefined, 'ar', 'الكل'), 'الكل');
  assert.deepEqual(
    marketplaceFamilyDefinitions.map((definition) => [definition.key, definition.label.ar, definition.label.en]),
    expectedFamilies,
  );
  for (const [key, ar, en] of expectedFamilies) {
    assert.equal(isMarketplaceFamilyKey(key), true);
    assert.equal(getMarketplaceFamilyLabel(key, 'ar', 'الكل'), ar);
    assert.equal(getMarketplaceFamilyLabel(key, 'en', 'All'), en);
  }
  assert.equal(isMarketplaceFamilyKey(undefined), false);
  assert.equal(isMarketplaceFamilyKey('sandbox-family'), false);
});

test('server URL context remains the single source for API and active family UI', () => {
  assert.match(pageSource, /isMarketplaceFamilyKey\(requested\)/);
  assert.match(pageSource, /<MarketplaceExplorer[\s\S]*family=\{family\}/);
  assert.match(explorerSource, /useMarketplaceServices\(\{[\s\S]*family,/);
  assert.match(explorerSource, /const isActive = family === item\.key/);
  assert.doesNotMatch(explorerSource, /useState<MarketplaceFamilyKey/);
});

test('only the selected URL family exposes the current-page accessibility state', () => {
  assert.match(explorerSource, /aria-current=\{isActive \? 'page' : undefined\}/);
  assert.match(explorerSource, /variant: isActive \? 'gold' : 'outline'/);
});

test('Browse categories reflects the selected canonical family in AR and EN', () => {
  assert.match(explorerSource, /getMarketplaceFamilyLabel\(family, language, t\.all\)/);
  assert.match(explorerSource, /\{t\.browseCategories\}: \{activeFamilyLabel\}/);
  assert.match(explorerSource, /browseCategories: 'تصفح الفئات'/);
  assert.match(explorerSource, /browseCategories: 'Browse categories'/);
});

test('technical roadmap copy is removed and replacement guidance stays neutral in AR and EN', () => {
  assert.doesNotMatch(explorerSource, /مراحل التكامل القادمة|ready for direct integration in a later phase/i);
  assert.match(explorerSource, /اختر التواريخ وعدد المسافرين لتوضيح تفضيلات بحثك/);
  assert.match(explorerSource, /Choose dates and traveller count to clarify your search preferences/);
});

test('family context hotfix preserves truthful zero-inventory and sandbox boundaries', () => {
  assert.match(explorerSource, /services\.length === 0/);
  assert.match(explorerSource, /meta\.hasRealData \? t\.verified : t\.noVerified/);
  assert.doesNotMatch(explorerSource, /PROVIDER_SANDBOX|SYNTHETIC_TEST|FALLBACK/);
});
