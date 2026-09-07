import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
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
      '@/lib/auth/register-contact': { registerSocialLinks: [{ channel: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/dir3com' }] },
      './customer-chrome.module.css': { default: {} },
    };
    runInNewContext(code, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) });
    const header = renderToStaticMarkup(createElement(exports.CustomerHeader, { large: false, appearance: false, onLarge() {}, onAppearance() {} }));
    const footer = renderToStaticMarkup(createElement(exports.CustomerFooter));
    assert.match(header, /dir3com-logo-transparent\.png/); assert.match(footer, /dir3com-logo-transparent\.png/);
    assert.ok(header.includes(language === 'ar' ? 'تكبير النص' : 'Increase text size'));
    assert.match(header, /lang="ar" aria-pressed="/); assert.match(header, /lang="en" aria-pressed="/);
    for (const href of ['/privacy', '/terms', '/support', '/services/drive', '/services/stay', '/services/concierge', '/services/vip', '/services/fly', 'https://wa.me/201011676418', 'https://wa.me/966532867009']) assert.ok(footer.includes(`href="${href}"`), href);
  }
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
