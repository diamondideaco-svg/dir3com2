import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';
import { placeDabraLauncher } from '../lib/dabra/floating-layout';
import { registerSocialLinks } from '../lib/auth/register-contact';
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

test('Register and Customer share the same canonical chrome without changing operational shells', () => {
  for (const path of ['app/(auth)/register/page.tsx', 'components/v6/Chrome.tsx']) {
    assert.match(read(path), /<CustomerHeader /); assert.match(read(path), /<CustomerFooter/);
  }
  assert.match(read('components/layout/SiteShell.tsx'), /if \(pathname === '\/login'\) return <Chrome>\{children\}<\/Chrome>/);
  assert.doesNotMatch(read('components/admin/AdminPlatformShell.tsx'), /CustomerChrome|v6\/Chrome/);
  const chrome = read('components/v6/Chrome.tsx');
  for (const contract of ['getCustomerRoleLabel(viewer.role, viewer.roleRaw, language)', 'supabase.auth.signOut()', 'aria-controls="account-navigation"', 'setMenu(false)']) assert.ok(chrome.includes(contract));
});

test('AR and EN canonical chrome renders real links, transparent logo, language and accessibility controls', () => {
  for (const language of ['ar', 'en']) {
    const code = ts.transpileModule(read('components/v6/CustomerChrome.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {} as Record<string, ComponentType<Record<string, unknown>>>;
    const dependencies: Record<string, unknown> = {
      'next/image': { default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement('img', props); } }, 'next/link': { default: 'a' },
      '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, setLanguage() {} }) },
      '@/lib/auth/register-contact': { registerSocialLinks },
      './customer-chrome.module.css': { default: {} },
    };
    runInNewContext(code, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) });
    const header = renderToStaticMarkup(createElement(exports.CustomerHeader, { large: false, appearance: false, onLarge() {}, onAppearance() {} }));
    const footer = renderToStaticMarkup(createElement(exports.CustomerFooter));
    const imageFooter = renderToStaticMarkup(createElement(exports.CustomerFooter, { surface: 'image' }));
    const linkedFooter = renderToStaticMarkup(createElement(exports.CustomerFooter, { servicesOverviewAccess: true }));
    for (const markup of [footer, linkedFooter]) {
      const headings = [...markup.matchAll(/<h2>(.*?)<\/h2>/g)].map(match => match[1].replace(/<[^>]*>/g, ''));
      assert.deepEqual(headings, language === 'ar' ? ['عن الشركة', 'خدماتنا', 'تواصل معنا'] : ['Company', 'Services', 'Contact us']);
      for (const family of ['drive', 'stay', 'concierge', 'vip', 'fly']) {
        assert.equal(markup.split(`href="/services/${family}"`).length - 1, 1);
      }
    }
    assert.doesNotMatch(footer, /href="\/services"/);
    assert.equal(linkedFooter.split('href="/services"').length - 1, 1);
    assert.match(linkedFooter, /<h2><a href="\/services"/);
    assert.match(header, /dir3com-logo-transparent\.png/);
    assert.doesNotMatch(footer, /<img/); // Approved reference starts with columns, not an added logo block.
    assert.match(footer, /data-footer-surface="white"/);
    assert.ok(footer.includes(`lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"`));
    assert.equal(imageFooter.replace('data-footer-surface="image"', 'data-footer-surface="white"'), footer);
    let previousSocial = -1;
    for (const social of registerSocialLinks) {
      const position = footer.indexOf(`href="${social.href}"`);
      assert.ok(position > previousSocial);
      assert.ok(footer.includes(`aria-label="${social.label}"`));
      previousSocial = position;
    }
    for (const href of ['https://wa.me/966532867009', 'https://wa.me/201011676418', 'mailto:info@dir3com.com', 'https://www.dir3com.com', 'https://www.dir3com.net']) {
      const anchor = footer.slice(footer.indexOf(`href="${href}"`));
      assert.match(anchor.slice(0, anchor.indexOf('</a>')), /<svg/);
    }
    assert.ok(header.includes(language === 'ar' ? 'تكبير النص' : 'Increase text size'));
    assert.match(header, /lang="ar" aria-pressed="/); assert.match(header, /lang="en" aria-pressed="/);
    for (const href of ['/privacy', '/terms', '/support', '/services/drive', '/services/stay', '/services/concierge', '/services/vip', '/services/fly', 'https://wa.me/201011676418', 'https://wa.me/966532867009']) assert.ok(footer.includes(`href="${href}"`), href);
  }
});

test('scenic footer uses one continuous approved backdrop and preserves reference placement', () => {
  assert.match(read('app/(auth)/register/page.tsx'), /<CustomerFooter surface="image" className=\{styles.canonicalFooter\}/);
  assert.match(read('components/v6/EmailVerification.tsx'), /<Chrome footerInContent>/);
  assert.match(read('components/v6/EmailVerification.tsx'), /<CustomerFooter surface="image" className=\{styles.verifyFooter\}/);
  assert.match(read('components/v6/LoginSuccess.tsx'), /<Chrome scene>/);
  const chrome = read('components/v6/Chrome.tsx');
  assert.match(chrome, /data-footer-scene=\{scene \|\| undefined\}/);
  assert.match(chrome, /!footerInContent && <CustomerFooter surface=\{scene \? 'image' : 'white'\}/);
  const css = read('components/v6/customer-chrome.module.css');
  assert.match(css, /\.footer\[data-footer-surface=image\] \{ background:transparent; border:0;/);
  assert.match(read('components/v6/v6.module.css'), /\.footerScene \.welcome \{ background:none; \}/);
  for (const [file, selector] of [['app/(auth)/register/register.module.css', 'canonicalFooter'], ['components/v6/v6.module.css', 'verifyFooter']]) {
    assert.ok(read(file).includes(`.${selector} > [data-footer-copyright] { grid-column:1/-1; grid-row:3;`));
  }
  assert.doesNotMatch(read('components/v6/AccountFrame.tsx'), /\bscene\b|footerInContent/);
});

test('welcome scenic footer keeps white links readable over even a white source pixel', () => {
  const css = read('components/v6/v6.module.css');
  assert.match(css, /\.footerScene \{ background:linear-gradient\(180deg,rgba\(13,27,42,\.24\),rgba\(13,27,42,\.66\) 30%,rgba\(13,27,42,\.78\)\)/);
  const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const channels = [13, 27, 42].map(channel => linear((channel * 0.66 + 255 * 0.34) / 255));
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  assert.ok(1.05 / (luminance + 0.05) >= 4.5);
  // Actual desktop/mobile capture additionally checks the footer starts beyond this stop.
});

test('scenic footer outlines text locally without replacing or tinting the page background', () => {
  const css = read('components/v6/customer-chrome.module.css');
  assert.match(css, /\.footer\[data-footer-surface=image\] :is\(h2,p,a\) \{ color:inherit; text-shadow:-1px -1px 0 #0d1b2a,1px -1px 0 #0d1b2a,-1px 1px 0 #0d1b2a,1px 1px 0 #0d1b2a,0 1px 2px #0d1b2a;/);
  assert.match(css, /\.footer\[data-footer-surface=image\] \{ background:transparent; border:0; color:#fff; \}/);
  assert.doesNotMatch(css, /background-image|linear-gradient|\.footer::(?:before|after)/);
  assert.equal((css.match(/text-shadow:/g) || []).length, 1);
});

test('footer owns its direction, contact grid, social axis and single-column mobile layout', () => {
  const css = read('components/v6/customer-chrome.module.css');
  assert.match(css, /\.columns \{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) minmax\(260px,1\.4fr\);[^}]*align-items:start/);
  assert.match(css, /\.footer \.columns h2 \{[^}]*line-height:24px/);
  assert.match(css, /\.contactRow \{ display:grid; grid-template-columns:18px minmax\(0,1fr\)/);
  assert.match(css, /\.socials \{ display:flex; flex-wrap:nowrap; justify-content:flex-start; gap:10px; direction:inherit/);
  assert.match(css, /@media\(max-width:1050px\) \{ \.columns \{ grid-template-columns:minmax\(0,1fr\); \} \}/);
  assert.match(css, /\.columns section \{ min-width:0; \}/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /row-reverse|scaleX/);
  // The shared DOM stacks Company, Services, Contact on mobile. Desktop grid
  // columns 3, 2, 1 put Contact first in the footer's own LTR/RTL direction.
  // Actual AR/EN rendering above verifies this order both with and without the
  // approved secondary /services heading link; JSX source shape is not the UI.
  for (const [file, footer, grid] of [
    ['app/(auth)/register/register.module.css', '.canonicalFooter', '.canonicalFooter > [data-footer-columns]'],
    ['components/v6/v6.module.css', '.verifyFooter', '.authStage [data-footer-columns]'],
  ]) {
    const ast = postcss.parse(read(file));
    const placements = new Map<number, number>();
    let desktopGrids = 0;
    ast.walkRules(rule => {
      if (!rule.selector.includes(footer) && !rule.selector.startsWith(grid)) return;
      assert.doesNotMatch(rule.toString(), /row-reverse|scaleX|direction\s*:/);
      rule.walkDecls('grid-template-columns', declaration => {
        // No unscoped/mobile override may force desktop tracks at 390px.
        assert.equal(rule.selector, grid);
        assert.equal(rule.parent?.type, 'atrule');
        assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
        assert.equal(declaration.value, 'minmax(260px,1.4fr) minmax(0,1fr) minmax(0,1fr)');
        desktopGrids++;
      });
      for (const [section, column] of [[1, 3], [2, 2], [3, 1]]) {
        if (rule.selector !== `${grid} > section:nth-child(${section})`) continue;
        assert.equal(rule.parent?.type, 'atrule');
        assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
        const values = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
        assert.deepEqual(values, { 'grid-column': String(column), 'grid-row': '1' });
        assert.ok(!placements.has(section), 'No competing footer placement');
        placements.set(section, column);
      }
    });
    assert.equal(desktopGrids, 1);
    assert.deepEqual([...placements], [[1, 3], [2, 2], [3, 1]]);
  }
});

test('Services stays secondary while Home and all family searches preserve direct discovery', () => {
  const home = read('components/approved/ApprovedVisualPage.tsx');
  assert.match(home, /href={`\/services\/\$\{service.slug\}`}/);
  assert.doesNotMatch(home, /href="\/services"/);
  const family = read('components/services/ServicePageContent.tsx');
  assert.match(family, /href={`\/marketplace\?family=dir3-\$\{service\}`}/);
  assert.doesNotMatch(family, /href="\/services"/);
  const search = read('components/shared/ServiceSearchTable.tsx');
  for (const branch of ['directDrive', 'familyMarketplace']) {
    const block = search.slice(search.indexOf(`if (${branch}) {`)).split('\n    }')[0];
    assert.ok(block.includes('router.push(`/marketplace?${params.toString()}`)'));
    assert.doesNotMatch(block, /router.push\([^\n]*\/services/);
  }
  for (const key of ['stay', 'fly', 'concierge', 'vip']) {
    assert.match(read(`app/services/${key}/page.tsx`), new RegExp(`service="${key}"[^>]*familyMarketplace`));
  }
  assert.match(read('app/services/page.tsx'), /return <ServicesOverview \/>/);
  assert.doesNotMatch(read('app/services/page.tsx'), /redirect\(/);
  assert.match(read('app/sitemap.ts'), /publicSitemapPaths/);
  assert.match(read('lib\/navigation\/route-catalog.ts'), /path: '\/services'/);
});

test('public headings and accessibility copy use the active language without translating brands', () => {
  const marketplace = read('components/public/MarketplaceExplorer.tsx');
  assert.ok(marketplace.includes("eyebrow={language === 'ar' ? 'السوق' : 'MARKETPLACE'}"));
  assert.ok(marketplace.includes("{language === 'ar' ? 'البحث الذكي' : 'SMART SEARCH'}"));
  const header = read('components/layout/Header.tsx');
  assert.equal(header.split("aria-label={language === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic'}").length - 1, 2);
  assert.ok(read('components/layout/FloatingDibrah.tsx').includes("alt={language === 'ar' ? 'صورة الدبرة' : 'DABRA avatar'}"));
  assert.ok(read('components/shared/StoriesCarousel.tsx').includes("language === 'ar' ? 'روح السعودية' : 'Visit Saudi'"));
});

test('density decisions remove sidebar and banner characters without modifying approved artwork', () => {
  assert.doesNotMatch(read('components/v6/Chrome.tsx'), /styles.assistant/);
  assert.doesNotMatch(read('components/v6/Favorites.tsx') + read('components/account/MyDocumentsContent.tsx'), /DabraCompact|DabraIntroduction/);
  assert.match(read('components/v6/Chrome.tsx'), /path !== '\/my-account'/);
  assert.match(read('components/account/MyAccountContent.tsx'), /<DabraIntroduction ar=\{ar\}/);
  assert.match(read('components/v6/DabraIdentity.tsx'), /Hi, I'm DABRA/);
  assert.match(read('components/v6/DabraIdentity.tsx'), /Customer Service/);
  assert.match(read('components/v6/v6.module.css'), /wallet-reference\.png/);
  assert.doesNotMatch(read('components/v6/LoginSuccess.tsx'), /<Image|welcomeArt/);
  assert.match(read('components/v6/LoginSuccess.tsx'), /أزهلني…/);
});

test('scoped palette and typography remove cream and heavy repeated icon tiles', () => {
  const css = read('components/v6/v6.module.css');
  assert.doesNotMatch(css, /#faf7ef|#fcfaf6|#fffdf8|#fbf7ef|#fcf4e9|#fffaf0|#fbf3df/);
  assert.match(css, /\.authPanel h1[^}]+color:#88601c/);
  assert.match(css, /\.welcome h1[^}]+color:#88601c/);
  for (const name of ['walletDestinations', 'walletActions']) assert.doesNotMatch(css, new RegExp('\\.' + name + ' svg[^}]+background:#0d1b2a'));
  assert.match(read('app/(auth)/register/register.module.css'), /\.panel h1[^}]+color: var\(--register-link\)/);
  assert.doesNotMatch(read('app/(auth)/login/page.tsx'), /font-display/);
});

test('wallet informational balance region stays clear of the Arabic mobile launcher', () => {
  assert.match(read('components/v6/Wallet.tsx'), /<section className=\{styles.balance\} data-dabra-avoid>/);
  const region = { left: 16, right: 374, top: 722, bottom: 1050 };
  const result = placeDabraLauncher({ language: 'ar', viewport: { left: 0, top: 0, width: 390, height: 844 }, width: 74, height: 74, obstacles: [region] });
  assert.equal(result.visible, true);
  assert.equal(result.x, 12);
  assert.ok(result.y + 74 <= region.top - 8);
});
