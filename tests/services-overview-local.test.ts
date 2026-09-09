import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalServices } from '../lib/services/canonical';
import sitemap from '../app/sitemap';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
const read = (path: string) => fs.readFileSync(path, 'utf8');
const overview = read('components/services/ServicesOverview.tsx');

test('CEO secondary landing composition is intro, five families, light assistance only', () => {
  const page = read('app/services/page.tsx');
  assert.match(page, /return <ServicesOverview \/>/);
  assert.doesNotMatch(page + overview, /ServiceSearchTable|HomeUtilities|StoriesCarousel|PartnersTicker|getTravelStoriesFeed|PlatformFoundationHome/);
  assert.equal((overview.match(/<h1\b/g) ?? []).length, 1);
  assert.match(overview, /جميع الخدمات.*All services/);
  const sequence = ['className={styles.intro}', 'data-service-families', 'data-services-assistance'].map(marker => overview.indexOf(marker));
  assert.ok(sequence.every((position, index) => position >= 0 && (!index || position > sequence[index - 1])));
  assert.equal((overview.match(/<section\b/g) ?? []).length, 3);
  assert.doesNotMatch(overview, /href="\/booking"|price|availability|inventory|confirmed|fetch\(/);
});

test('cards use exactly five canonical families, original content/assets and one direct CTA', () => {
  assert.deepEqual(canonicalServices.map(service => service.slug), ['drive', 'stay', 'fly', 'concierge', 'vip']);
  assert.match(overview, /canonicalServices.map\(service/);
  assert.match(overview, /src=\{service.hero\}/);
  assert.match(overview, /ar \? service.descriptionAr : service.descriptionEn/);
  assert.equal((overview.match(/href={`\/services\/\$\{service.slug\}`}/g) ?? []).length, 1);
  for (const service of canonicalServices) {
    assert.ok(fs.existsSync(`app/services/${service.slug}/page.tsx`));
    assert.ok(fs.existsSync(`public${service.hero}`));
  }
  assert.match(read('components/approved/ApprovedVisualPage.tsx'), /href={`\/services\/\$\{service.slug\}`}/);
});

test('removed route sections remain available as unmodified reusable components', () => {
  for (const file of ['components/shared/ServiceSearchTable.tsx', 'components/home/HomeUtilities.tsx', 'components/shared/StoriesCarousel.tsx', 'components/shared/PartnersTicker.tsx', 'components/home/PlatformFoundationHome.tsx']) {
    assert.ok(fs.existsSync(file));
  }
  assert.match(read('components/shared/PartnersTicker.tsx'), /if \(homePresentation\)/);
  assert.match(read('components/shared/StoriesCarousel.tsx'), /if \(homeDiscovery\)/);
});

test('metadata has its own canonical and sitemap contains only the authorized public discovery URLs', () => {
  const page = read('app/services/page.tsx');
  assert.match(page, /title: 'All services \| جميع الخدمات'/);
  assert.match(page, /description: 'Drive, Stay, Fly, Concierge and VIP/);
  assert.match(page, /alternates: \{ canonical: '\/services' \}/);
  assert.doesNotMatch(page, /redirect\(|noindex|canonical:.*marketplace/);
  assert.deepEqual(sitemap().map(item => item.url), ['', '/services', ...canonicalServices.map(service => `/services/${service.slug}`)].map(path => `https://dir3com.com${path}`));
  assert.ok(sitemap().every(item => !('lastModified' in item)));
});

test('secondary footer access reuses its existing heading and does not change Customer/Auth defaults', () => {
  const footer = read('components/v6/CustomerChrome.tsx');
  assert.match(footer, /servicesOverviewAccess = false/);
  assert.match(footer, /servicesOverviewAccess \? <Link href="\/services" aria-label=\{ar \? 'خدماتنا — جميع الخدمات' : 'Services — All services'\}>\{ar \? 'خدماتنا' : 'Services'\}<\/Link>/);
  assert.match(read('components/home/HomeChrome.tsx'), /servicesOverviewAccess/);
  assert.match(read('components/services/ServicesChrome.tsx'), /servicesOverviewAccess/);
  assert.match(read('components/layout/SiteShell.tsx'), /if \(pathname === '\/services'\) return <ServicesChrome>/);
});

test('anonymous sitemap access does not exempt private routes or similarly named paths', () => {
  const publicResponse = proxy(new NextRequest('https://dir3com.com/sitemap.xml'));
  assert.equal(publicResponse.headers.get('x-middleware-next'), '1');
  assert.equal(publicResponse.headers.get('location'), null);
  for (const path of ['/sitemap.xml/private', '/sitemap.xml-backup', '/my-account', '/my-documents', '/my-wallet', '/dashboard', '/admin']) {
    const response = proxy(new NextRequest(`https://dir3com.com${path}`));
    assert.equal(response.status, 307);
    const destination = new URL(response.headers.get('location')!);
    assert.equal(destination.pathname, '/login');
    assert.equal(destination.searchParams.get('next'), path);
  }
});

test('header links no longer target removed Services sections; no new utility implementation', () => {
  const header = read('components/layout/Header.tsx');
  assert.doesNotMatch(header, /\/services#(?:service-search|home-weather|home-currency)/);
  assert.equal((header.match(/<Link href="\/marketplace" className=\{utilityClass\}/g) ?? []).length, 2);
  assert.equal(header.split("onHomeSearch ? '#home-weather' : '/#home-weather'").length - 1, 2);
  assert.equal(header.split("onHomeSearch ? '#home-currency' : '/#home-currency'").length - 1, 2);
});

test('responsive cards and optional DABRA retain accessible links and existing consent-gated launcher', () => {
  const css = read('components/services/services-overview.module.css');
  assert.match(css, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*\.grid \{ grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.doesNotMatch(css, /row-reverse|scaleX|position:fixed|100vh/);
  assert.match(overview, /href="\/dabra"/);
  assert.match(overview, /aria-label=.*Explore service/);
  assert.equal((overview.match(/data-dabra-avoid/g) ?? []).length, 3);
  assert.match(read('components/services/ServicesChrome.tsx'), /<FloatingDibrah \/>/);
});
