import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { marketplaceBadgeLabels, marketplaceOptionCountLabel } from '@/lib/marketplace/localization';
import { languageDirection } from '@/lib/i18n/config';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('Marketplace badges are localized for Arabic and English', () => {
  const flags = { popular: true, recommended: true };
  assert.deepEqual(marketplaceBadgeLabels('ar', flags), ['شائع', 'موصى به']);
  assert.deepEqual(marketplaceBadgeLabels('en', flags), ['Popular', 'Recommended']);
});

test('Marketplace option counts use locale-aware singular and plural labels', () => {
  assert.equal(marketplaceOptionCountLabel(1, 'ar'), '1 خيار');
  assert.equal(marketplaceOptionCountLabel(2, 'ar'), '2 خيارات');
  assert.equal(marketplaceOptionCountLabel(1, 'en'), '1 option');
  assert.equal(marketplaceOptionCountLabel(2, 'en'), '2 options');
});

test('Marketplace and PDP bind their local direction to the canonical locale', () => {
  assert.equal(languageDirection('ar'), 'rtl');
  assert.equal(languageDirection('en'), 'ltr');
  assert.match(read('components/public/MarketplaceExplorer.tsx'), /dir=\{direction\} lang=\{language\}/);
  assert.match(read('components/public/PublicServiceDetailClient.tsx'), /dir=\{direction\} lang=\{language\}/);
});

test('mobile request form exposes a safe zone and DABRA uses a context-aware avoidance position', () => {
  const detail = read('components/public/PublicServiceDetailClient.tsx');
  const dabra = read('components/layout/FloatingDibrah.tsx');
  assert.match(detail, /data-marketplace-request-form/);
  assert.match(detail, /pb-24[\s\S]*sm:pb-0/);
  assert.match(dabra, /data-marketplace-critical-action/);
  assert.match(dabra, /getBoundingClientRect\(\)/);
  assert.match(dabra, /placeDabraLauncher\(\{ language, viewport/);
  assert.match(dabra, /\[language, pathname, positionStorageKey\]/);
});
