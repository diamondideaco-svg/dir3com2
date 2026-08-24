import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('components/home/PlatformFoundationHome.tsx');
const css = read('app/globals.css');
const languageProvider = read('components/i18n/LanguageProvider.tsx');
const marketplace = read('components/public/MarketplaceExplorer.tsx');
const serviceCard = read('components/shared/ServiceCard.tsx');
const drivePage = read('app/services/drive/page.tsx');

test('service page media is bounded by a positioned aspect-ratio container', () => {
  assert.match(css, /\.home-service-image\s*\{[\s\S]*position:\s*relative/);
  assert.match(css, /\.home-service-image\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /\.home-service-image\s+img\s*\{[\s\S]*object-fit:\s*cover/);
  assert.match(home, /className="home-service-image"/);
});

test('services page keeps the approved search, practical information, and category order', () => {
  const search = home.indexOf('<ServiceSearchTable />');
  const utilities = home.indexOf('<HomeUtilities />');
  const services = home.indexOf('t.services.map');
  assert.ok(search > 0);
  assert.ok(utilities > search);
  assert.ok(services > utilities);
});

test('language changes persist before refreshing the server component tree', () => {
  assert.match(languageProvider, /persistLanguage\(nextLanguage\);[\s\S]*setLanguageState\(nextLanguage\);[\s\S]*router\.refresh\(\)/);
  assert.match(languageProvider, /const nextLanguage = language === 'ar' \? 'en' : 'ar'/);
});

test('marketplace content alignment follows the active writing direction', () => {
  assert.doesNotMatch(marketplace, /className=\{`[^`]*text-right/);
  assert.match(marketplace, /text-start transition/);
  assert.match(serviceCard, /p-6 text-start shadow/);
});

test('shared service detail and marketplace cards bind copy to the active language', () => {
  assert.match(drivePage, /<ServicePageContent service="drive"/);
  assert.match(serviceCard, /const \{ language \} = useLanguage\(\)/);
  assert.match(serviceCard, /service\.name_en/);
  assert.match(serviceCard, /service\.description_en/);
  assert.match(serviceCard, /language === 'ar' \? 'مميز' : 'Featured'/);
  assert.match(serviceCard, /language === 'ar' \? 'عرض الخدمة' : 'View service'/);
});
