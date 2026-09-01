import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('login renders all existing auth controls from the authoritative shared locale', () => {
  const source = read('app/(auth)/login/page.tsx');

  assert.match(source, /useLanguage\(\)/);
  assert.match(source, /const t = loginCopy\[language\]/);
  assert.match(source, /lang=\{language\} dir=\{direction\}/);
  assert.match(source, /direction\s*\}/);

  for (const copy of [
    'Sign in',
    'Welcome back to DIR3COM',
    'Sign in with Google',
    'Email address',
    'Password',
    'Enter your email address and password.',
    'Enter a valid email address.',
    'Signing in...',
    "Don't have an account?",
    'Create a new account',
  ]) {
    assert.ok(source.includes(copy), `missing English login copy: ${copy}`);
  }

  for (const copy of ['تسجيل الدخول', 'البريد الإلكتروني', 'كلمة المرور', 'إنشاء حساب جديد']) {
    assert.ok(source.includes(copy), `missing Arabic login copy: ${copy}`);
  }

  assert.match(source, /getPostLoginDestination/);
  assert.match(source, /buildOAuthCallbackUrl/);
  assert.match(source, /supabase\.auth\.signInWithPassword/);
  assert.match(source, /supabase\.auth\.signInWithOAuth/);
  assert.match(source, /<form onSubmit=\{handleEmailLogin\} noValidate>/);
});

test('marketplace loading, error, empty, and success states remain mutually truthful', () => {
  const source = read('components/public/MarketplaceExplorer.tsx');

  assert.ok(source.includes('جاري تحميل النتائج…'));
  assert.ok(source.includes('Loading results…'));
  assert.match(source, /!loading && !error \?/);
  assert.match(source, /loading \? \([\s\S]*role="status"[\s\S]*t\.loadingResults/);
  assert.match(source, /\) : error \? \([\s\S]*t\.loadError/);
  assert.match(source, /\) : \([\s\S]*t\.visible[\s\S]*t\.total[\s\S]*t\.source/);
  assert.match(source, /services\.length === 0 \?/);

  const loadingBranch = source.slice(source.indexOf('{loading ? ('), source.indexOf(') : error ? ('));
  assert.doesNotMatch(loadingBranch, /t\.visible|t\.total|t\.noVerified|t\.emptyTitle/);

  const hook = read('components/public/useMarketplaceServices.ts');
  assert.match(hook, /setError\(interfaceLanguage === 'en'/);
  assert.doesNotMatch(hook, /setError\(fetchError instanceof Error \? fetchError\.message/);
});
