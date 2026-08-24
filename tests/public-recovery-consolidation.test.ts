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
const approvedHome = read('components/approved/ApprovedVisualPage.tsx');
const publicHero = read('components/public/PublicHero.tsx');
const floatingDibrah = read('components/layout/FloatingDibrah.tsx');
const header = read('components/layout/Header.tsx');

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

test('public DABRA CTAs open the canonical floating assistant', () => {
  assert.match(approvedHome, /dispatchEvent\(new Event\('dir3com:open-dibrah'\)\)/);
  assert.match(publicHero, /dispatchEvent\(new Event\('dir3com:open-dibrah'\)\)/);
  assert.match(floatingDibrah, /addEventListener\('dir3com:open-dibrah', handleOpenRequest\)/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.approved-visual-page\[data-approved-page='home'\] \.service-search-table\s*\{[\s\S]*position:\s*relative;[\s\S]*top:\s*auto;/);
});

test('header utilities target real sections and expose live weather', () => {
  assert.match(header, /navigateToSection\(isHome \? '\/' : '\/services', 'service-search'\)/);
  assert.match(header, /navigateToSection\('\/services', 'home-weather'\)/);
  assert.match(header, /navigateToSection\('\/services', 'home-currency'\)/);
  assert.match(header, /api\/public\/runtime\?lang=/);
  assert.match(header, /Math\.round\(temperature\).*°C/);
});

test('theme and accessibility panel have visible and dismissible behavior', () => {
  assert.match(css, /html\[data-theme='dark'\] body::after/);
  assert.match(header, /addEventListener\('pointerdown', closeOnOutsidePointer\)/);
  assert.match(header, /addEventListener\('keydown', closeOnEscape\)/);
  assert.match(header, /positionAccessibilityPanel\(trigger\)/);
});
