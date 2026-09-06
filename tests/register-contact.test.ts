import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeRegisterContact, registerCountries, registerSocialLinks } from '../lib/auth/register-contact';

test('Register normalizes national/international, Arabic and Persian phone digits to E.164', () => {
  for (const phone of ['0501234567', '+966 50 123 4567', '00966-50-123-4567', '٠٥٠١٢٣٤٥٦٧', '۰۵۰۱۲۳۴۵۶۷']) {
    assert.deepEqual(normalizeRegisterContact('SA', phone), { phone_e164: '+966501234567', country_code: 'SA', calling_code: '+966' });
  }
  assert.deepEqual(normalizeRegisterContact('EG', '01012345678'), { phone_e164: '+201012345678', country_code: 'EG', calling_code: '+20' });
});

test('invalid numbers, extensions, unsafe text and mismatched countries fail closed', () => {
  for (const phone of ['', '123', '0501234567 ext 123', '+966501234567\nadmin', '+201012345678', '0'.repeat(100), '<script>']) {
    assert.equal(normalizeRegisterContact('SA', phone), null);
  }
  assert.equal(normalizeRegisterContact('XX', '+966501234567'), null);
  assert.equal(normalizeRegisterContact('US', '+14165550123'), null); // shared +1 is not proof of US
});

test('country list provides real selectable calling regions, never authorization scope', () => {
  assert.ok(registerCountries.includes('SA') && registerCountries.includes('EG') && registerCountries.includes('GB'));
  const contact = normalizeRegisterContact('GB', '02079460000');
  assert.ok(contact);
  assert.deepEqual(Object.keys(contact).sort(), ['calling_code', 'country_code', 'phone_e164']);
});

test('contact is signup-only unverified metadata; existing users and OAuth authority remain untouched', () => {
  const page = readFileSync(new URL('../app/(auth)/register/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('registration_contact: contact'));
  assert.ok(page.includes('normalizeRegisterContact(country, phone)'));
  assert.ok(page.indexOf('normalizeRegisterContact(country, phone)') < page.indexOf('supabase.auth.signUp'));
  assert.doesNotMatch(page, /auth\.updateUser|\.upsert\(|phone_verified|phone_confirmed|app_metadata|country_scope|role:/);
  const oauth = page.slice(page.indexOf('const handleGoogle'), page.indexOf('    return ('));
  assert.doesNotMatch(oauth, /registration_contact|phone|country|queryParams/);
  assert.match(page, /Google is a separate sign-in flow/);
});

test('Register uses exactly the five CEO-approved social destinations, not shared placeholders', () => {
  assert.deepEqual(registerSocialLinks.map(s => s.href).sort(), [
    'https://www.instagram.com/dir3com', 'https://www.facebook.com/dir3com',
    'https://www.tiktok.com/@dir3com', 'https://x.com/dir3com', 'https://linkedin.com/company/dir3com',
  ].sort());
});

test('localized country names are applied after hydration, not dependent on server/browser ICU ordering', () => {
  const page = readFileSync(new URL('../app/(auth)/register/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('useSyncExternalStore(subscribeToBrowser, browserSnapshot, serverSnapshot)'));
  assert.ok(page.includes('if (!browserReady) return registerCountries.map(code => ({ code, name: String(code) }))'));
  assert.match(page, /const serverSnapshot = \(\) => false/);
  assert.doesNotMatch(page, /setCountries/);
});
