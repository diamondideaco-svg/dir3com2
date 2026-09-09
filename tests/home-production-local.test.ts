import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalServices } from '../lib/services/canonical';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const home = read('components/approved/ApprovedVisualPage.tsx');
const css = read('components/home/home-production.module.css');

test('Home-only shell reuses approved logo/footer and the existing public Header and DABRA', () => {
  assert.match(read('components/layout/SiteShell.tsx'), /if \(pathname === '\/'\) return <HomeChrome>\{children\}<\/HomeChrome>/);
  const shell = read('components/home/HomeChrome.tsx');
  assert.match(shell, /<Header logo=\{<CustomerLogo \/>\} onHomeSearch=/);
  assert.match(shell, /<CustomerFooter surface="white"/);
  assert.match(shell, /<FloatingDibrah \/>/);
  assert.doesNotMatch(shell, /fetch\(|supabase|signOut|router\.push/);
});

test('Home retains the approved video, locale copy and real original CTA destinations', () => {
  assert.match(home, /src="\/brand\/home\/dir3com-home-hero.cropped.web.mp4"/);
  assert.ok(fs.existsSync('public/brand/home/dir3com-home-hero.web.mp4'));
  assert.ok(fs.existsSync('public/brand/home/dir3com-home-hero.cropped.web.mp4'));
  assert.match(home, /href="\/login\?redirect=%2Fbooking&next=%2Fbooking"/);
  assert.match(home, /href="#home-services-title"/);
  assert.doesNotMatch(home, /href="\/services"/);
  assert.match(home, /من فكرة السفرة/);
  assert.match(home, /From planning the journey/);
  assert.match(home, /page === 'home' \? ` \$\{homeStyles.home\}` : ''/);
});

test('small search entry opens the existing search without a duplicate search implementation', () => {
  assert.match(home, /useState\(false\)/);
  assert.match(home, /aria-expanded=\{searchOpen\} aria-controls="home-search-panel"/);
  assert.match(home, /id="home-search-panel"[^\n]+hidden=\{!searchOpen\}/);
  assert.equal((home.match(/<ServiceSearchTable \/>/g) ?? []).length, 1);
  assert.match(home, /href="\/dabra">\{homeCopy.plan\}/);
  assert.match(home, /searchTrigger.current\?\.focus\(\)/);
  assert.doesNotMatch(home, /submitSearch|URLSearchParams|fetch\(|supabase/);
});

test('existing five canonical services immediately follow the hero, with no invented service content', () => {
  assert.deepEqual(canonicalServices.map(s => s.slug), ['drive', 'stay', 'fly', 'concierge', 'vip']);
  assert.ok(home.indexOf('data-home-services') > home.indexOf('approved-visual-frame'));
  assert.ok(home.indexOf('data-home-services') < home.indexOf('<div id="home-search-panel"'));
  assert.match(home, /canonicalServices.map\(service/);
  assert.match(home, /href={`\/services\/\$\{service.slug\}`}/);
  assert.match(home, /service.descriptionAr : service.descriptionEn/);
  for (const service of canonicalServices) assert.ok(fs.existsSync(`public${service.hero}`));
});

test('Home footer mirrors Contact/Services/Company only on desktop and preserves mobile stack', () => {
  const desktop = css.slice(css.indexOf('@media(min-width:1051px)'), css.indexOf('@media(min-width:1280px)'));
  assert.match(desktop, /section:nth-child\(3\) \{ grid-column:1; grid-row:1;/);
  assert.match(desktop, /section:nth-child\(2\) \{ grid-column:2; grid-row:1;/);
  assert.match(desktop, /section:nth-child\(1\) \{ grid-column:3; grid-row:1;/);
  assert.doesNotMatch(css, /row-reverse|scaleX\(-1\)/);
  assert.match(css, /\.shell\[lang=ar\].*--font-tajawal/);
  assert.match(css, /--font-montserrat/);
  assert.match(css, /\.searchPanel\[hidden\] \{ display:none;/);
});

test('Home reuses service strips in the approved order without changing provider logic', () => {
  const utilities = home.indexOf('<HomeUtilities homePresentation />');
  const discovery = home.indexOf('<StoriesCarousel stories={travelStories} homeDiscovery />');
  const companies = home.indexOf('<PartnersTicker partners={partners} homePresentation />');
  assert.ok(utilities > home.indexOf('data-home-services') && discovery > utilities && companies > discovery);
  assert.match(read('components/home/HomeUtilities.tsx'), /homePresentation = false/);
  for (const file of ['components/home/PlatformFoundationHome.tsx', 'components/services/ServicePageContent.tsx']) {
    const source = read(file);
    assert.match(source, /<HomeUtilities \/>/);
    assert.match(source, /<PartnersTicker partners=\{partners\}/);
    assert.doesNotMatch(source, /homePresentation|homeDiscovery|showCurrency/);
  }
});

test('Home exposes truthful deferred currency and destination-context time without inventing providers', () => {
  const utilities = read('components/home/HomeUtilities.tsx');
  assert.match(utilities, /if \(homePresentation\) return;/);
  assert.match(utilities, /disabled=\{homePresentation \|\| conversionState === 'loading'\}/);
  assert.match(utilities, /homePresentation \? t.currencyDeferred/);
  assert.match(utilities, /Currency conversion is currently unavailable/);
  assert.match(utilities, /تحويل العملات غير متاح حاليًا/);
  assert.match(utilities, /homePresentation \? <article id="home-local-time"/);
  assert.match(utilities, /اختر وجهة لعرض الوقت المحلي/);
  assert.match(utilities, /Choose a destination to see local time/);
  assert.doesNotMatch(utilities, /Date\(|setInterval|timeZone|FX_RATE/);
  assert.match(utilities, /src="\/brand\/runtime\/DABRA emoji.png" alt="" width=\{40\} height=\{40\}/);
  assert.match(utilities, /الدبرة — مساعد السفر/);
  assert.match(utilities, /#dibrah > button:last-of-type/);
});

test('Home utility controls stay inline while secondary pages link to their current Home locations', () => {
  const header = read('components/layout/Header.tsx');
  for (const target of ['weather', 'currency']) {
    assert.equal(header.split(`onHomeSearch ? '#home-${target}' : '/#home-${target}'`).length - 1, 2);
  }
  assert.equal((header.match(/onClick=\{openHomeSearch\}/g) ?? []).length, 2);
  assert.match(header, /requestAnimationFrame\(\(\) => onHomeSearch\?\.\(\)\)/);
  assert.match(read('components/home/HomeChrome.tsx'), /\[data-home-search-entry\] button/);
  assert.doesNotMatch(home, /showCurrency=\{false\}/);
  const utilities = read('components/home/HomeUtilities.tsx');
  assert.match(utilities, /fetch\(`\/api\/currency\?/);
  assert.match(utilities, /fetch\(`\/api\/public\/runtime\?/);
  assert.match(utilities, /https:\/\/www.google.com\/maps\/search\//);
  assert.doesNotMatch(utilities, /href="\/services|setInterval|timeZone|hardcodedRate/);
  assert.match(css, /\.home :global\(\.home-utility-card--currency\) \{ grid-column:auto;/);
});

test('Home companies reuse the approved list and original text fallback in seamless opposing tracks', () => {
  const ticker = read('components/shared/PartnersTicker.tsx');
  assert.match(ticker, /homePresentation = false/);
  assert.match(ticker, /'الشركات العالمية' : 'Global Companies'/);
  assert.match(ticker, /index % 2 === 0/);
  assert.match(ticker, /index % 2 === 1/);
  assert.match(ticker, /\[0, 1\]\.map/);
  assert.match(ticker, /inert=\{copy === 1/);
  assert.match(ticker, /partner.logo \? <img src=\{partner.logo\}/);
  assert.doesNotMatch(ticker, /setInterval|setTimeout|fetch\(/);
  assert.match(css, /animation:home-company-flow 40s linear infinite/);
  assert.match(css, /animation-direction:reverse/);
  assert.match(css, /transform:translateX\(-50%\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.companyTrack \{ animation:none; width:100%;/);
  assert.match(css, /\.companyGroup \{ flex-wrap:wrap;/);
});

test('Saudi discovery uses existing official source records and approved imagery, not fabricated inventory', () => {
  const source = read('components/shared/StoriesCarousel.tsx');
  assert.match(source, /homeDiscovery = false/);
  assert.match(source, /source.enabled && source.countryCode === 'SA' && source.type === 'official-website'/);
  assert.match(source, /href=\{source.url\}/);
  assert.match(source, /'استكشف المملكة' : 'Discover Saudi Arabia'/);
  assert.ok(fs.existsSync('public/brand/runtime/golden_hour_over_the_rugged_desert_canyon.png'));
  assert.doesNotMatch(source, /price|availability|booking|fetch\(/);
});

test('mobile display controls keep existing handlers with bilingual accessible names and pressed state', () => {
  const header = read('components/layout/Header.tsx');
  assert.equal((header.match(/onClick=\{toggleTheme\} className=\{utilityClass\} aria-label=\{t.theme\} aria-pressed=\{dark\}/g) ?? []).length, 2);
  assert.equal((header.match(/onClick=\{toggleTextSize\} className=\{utilityClass\} aria-label=\{t.accessibility\} aria-pressed=\{largeText\}/g) ?? []).length, 2);
});

test('hero text keeps a physical left safe zone and the approved mobile crop contains the head', () => {
  assert.match(css, /left:4%; right:auto; width:38%; max-width:500px/);
  assert.match(css, /left:12px; right:auto; bottom:auto; width:40%; max-width:190px/);
  const mobile = css.slice(css.indexOf('@media(max-width:640px)'), css.indexOf('/* Home presentations'));
  assert.match(mobile, /\.home\[data-approved-page=home\] :global\(video.approved-visual-video\) \{ object-position:65% center; \}/);
  assert.equal((css.match(/object-position:/g) ?? []).length, 1);
  assert.doesNotMatch(css, /scaleX\(-1\)|row-reverse/);
});
