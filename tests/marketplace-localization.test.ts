import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { marketplaceFamilyDefinitions } from '@/lib/marketplace/data';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('marketplace customer surfaces use the canonical language context and contain complete English UI copy', () => {
  for (const file of [
    'components/public/MarketplaceExplorer.tsx',
    'components/public/MarketplaceFilters.tsx',
    'components/shared/ServiceCard.tsx',
    'components/public/PublicServiceDetailClient.tsx',
    'components/account/MarketplaceRequestsPanel.tsx',
  ]) {
    assert.match(read(file), /useLanguage/);
  }
  const explorer = read('components/public/MarketplaceExplorer.tsx');
  for (const label of ['Marketplace', 'All destinations', 'All services', 'Search now', 'Reset filters', 'No published marketplace listings']) {
    assert.ok(explorer.includes(label), `${label} must have an English rendering`);
  }
  assert.doesNotMatch(explorer, /No verified inventory/);
  const detail = read('components/public/PublicServiceDetailClient.tsx');
  for (const label of ['Request confirmation', 'Request a quote', 'Booking and payment', 'Ask DABRA', 'Back to marketplace']) {
    assert.ok(detail.includes(label), `${label} must have an English rendering`);
  }
});

test('Arabic marketplace copy remains present and locale switching owns document direction', () => {
  assert.match(read('components/public/MarketplaceExplorer.tsx'), /السوق/);
  assert.match(read('components/public/PublicServiceDetailClient.tsx'), /طلب تأكيد/);
  const provider = read('components/i18n/LanguageProvider.tsx');
  assert.match(provider, /document\.documentElement\.dir = direction/);
  assert.match(provider, /languageDirection\(language\)/);
});

test('localization preserves the five-family taxonomy and truth-gated CTA eligibility', () => {
  assert.deepEqual(
    marketplaceFamilyDefinitions.map((definition) => definition.key),
    ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip'],
  );
  const card = read('components/shared/ServiceCard.tsx');
  const detail = read('components/public/PublicServiceDetailClient.tsx');
  assert.match(card, /marketplacePrimaryAction/);
  assert.match(detail, /marketplacePrimaryAction/);
  assert.match(card, /action === 'continue_to_booking'/);
  assert.match(detail, /primaryAction === 'continue_to_booking'/);
});
