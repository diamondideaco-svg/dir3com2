import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/(auth)/register/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/(auth)/register/register.module.css', import.meta.url), 'utf8');

test('Register derives local language, direction and existing fonts from active locale', () => {
  assert.match(page, /const \{ language, direction \} = useLanguage\(\)/);
  assert.match(page, /lang=\{language\} dir=\{direction\}/);
  assert.match(page, /language === 'ar' \? 'var\(--font-arabic\)' : 'var\(--font-latin\)'/);
  assert.doesNotMatch(page, /direction: 'rtl'|font-display|Playfair/);
  assert.ok(css.includes('.register button, .register select { font-family: inherit;'));
});

test('Desktop Register contains geometry without mirroring hero/form or changing mobile direction', () => {
  assert.match(css, /@media\(min-width:721px\) \{\s*\.composition \{ direction:rtl; \}/);
  assert.match(css, /\.register\[dir='ltr'\] \.composition > :is\(\.panel,\.hero\) \{ direction:ltr; \}/);
  assert.match(css, /\.register\[dir='rtl'\] \.composition > :is\(\.panel,\.hero\) \{ direction:rtl; \}/);
  assert.match(css, /\.register\[dir='ltr'\] \.composition \{ padding-left:3\.9%; padding-right:5\.75%; \}/);
  assert.doesNotMatch(css, /row-reverse|scaleX\(-1\)/);
  assert.match(css, /\.stage \{[^}]*dir3com-login-background-approved\.png'\) center \/ cover no-repeat/);
  assert.match(css, /\.composition, \.register\[dir='ltr'\] \.composition \{ display: flex; flex-direction: column;/);
});

test('Register focus styles are local and each input has an associated label', () => {
  for (const id of ['register-name', 'register-email', 'register-phone', 'register-password']) {
    assert.ok(page.includes(`htmlFor="${id}"`));
    assert.ok(page.includes(`id="${id}"`));
  }
  assert.doesNotMatch(page, /outline: 'none'/);
  assert.match(css, /\.register input:focus-visible/);
  assert.match(css, /outline: 3px solid var\(--register-ink\)/);
  assert.doesNotMatch(css, /:global|\bbody\b|\bhtml\b/);
  assert.doesNotMatch(page, /register-contact-note|styles\.contactNote/);
});

test('Register retains real signup, validation, profile payload and success destination', () => {
  assert.match(page, /password.length < 6/);
  assert.ok(page.includes('options: { data: { full_name: fullName, registration_contact: contact } }'));
  assert.match(page, /supabase.auth.signUp/);
  assert.ok(page.includes("router.push('/auth/verify-email')"));
  assert.match(page, /supabase.auth.getSession\(\)/);
  assert.equal((page.match(/required/g) || []).length, 7);
});

test('approved composition is real UI with a Register-only shell and preserved family destinations', () => {
  const shell = readFileSync(new URL('../components/layout/SiteShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /if \(pathname === '\/register'\) return <>\{children\}<\/>/);
  for (const element of ['panel', 'hero', 'canonicalFooter']) assert.ok(page.includes(`styles.${element}`));
  assert.match(page, /<CustomerHeader /);
  assert.match(page, /<CustomerFooter /);
  assert.match(css, /grid-template-columns: minmax\(0,470px\) minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(page + css, /dir3com-register-page-approved\.png/);
  assert.match(readFileSync(new URL('../components/v6/CustomerChrome.tsx', import.meta.url), 'utf8'), /\['Drive', 'Stay', 'Concierge', 'VIP', 'Fly'\]/);
});

test('confirmation and policy controls are local gates, not extra identity or authority writes', () => {
  assert.match(page, /password !== confirmation/);
  assert.match(page, /id="register-consent" type="checkbox" required/);
  assert.match(page, /href="\/terms"/);
  assert.match(page, /href="\/privacy"/);
  assert.doesNotMatch(page, /\.from\(|role:|phone:/);
  assert.match(readFileSync(new URL('../components/v6/CustomerChrome.tsx', import.meta.url), 'utf8'), /registerSocialLinks.map/);
  assert.match(page, /setVisible\(!visible\)/);
});

test('Google control uses the existing provider and callback contract, with safe failure recovery', () => {
  assert.match(page, /onClick=\{handleGoogle\}/);
  assert.match(page, /supabase.auth.signInWithOAuth\(\{\s*provider: 'google'/);
  assert.match(page, /buildOAuthCallbackUrl\(window.location.origin, getPostLoginDestination\(null\)\)/);
  assert.match(page, /skipBrowserRedirect: true/);
  assert.match(page, /if \(oauthError \|\| !data\?\.url\)/);
  assert.match(page, /window.location.assign\(data.url\)/);
});

test('Google cannot bypass the shared Register-local terms and privacy gate', () => {
  const handler = page.slice(page.indexOf('const handleGoogle ='), page.indexOf('    return ('));
  assert.match(page, /checked=\{consent\} onChange=\{e => setConsent\(e.target.checked\)\}/);
  assert.match(handler, /if \(!consent\) \{[\s\S]*?consentInput.current\?\.focus\(\);\s*return;\s*\}/);
  assert.ok(handler.indexOf('if (!consent)') < handler.indexOf('supabase.auth.signInWithOAuth'));
});
