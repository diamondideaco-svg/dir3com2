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
  assert.match(page, /fontFamily: 'inherit'/);
});

test('Register focus styles are local and each input has an associated label', () => {
  for (const id of ['register-name', 'register-email', 'register-password']) {
    assert.ok(page.includes(`htmlFor="${id}"`));
    assert.ok(page.includes(`id="${id}"`));
  }
  assert.doesNotMatch(page, /outline: 'none'/);
  assert.match(css, /\.register input:focus-visible/);
  assert.match(css, /outline: 3px solid #0d1b2a/);
  assert.doesNotMatch(css, /:global|\bbody\b|\bhtml\b/);
});

test('Register retains real signup, validation, profile payload and success destination', () => {
  assert.match(page, /password.length < 6/);
  assert.match(page, /supabase.auth.signUp\(\{\s*email,\s*password,\s*options: \{\s*data: \{ full_name: fullName \}/);
  assert.match(page, /router.push\('\/login'\)/);
  assert.match(page, /supabase.auth.getSession\(\)/);
  assert.equal((page.match(/required/g) || []).length, 3);
});
