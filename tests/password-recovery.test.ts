import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recoveryRedirect, requestPasswordRecovery, validateRecoverySession, validateRecoveryPassword, updateRecoveredPassword } from '../lib/auth/password-recovery';
import { proxy } from '../proxy';
import { NextRequest } from 'next/server';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
// Isolated API contract doubles only. These are not JWTs, recovery tokens or live-user evidence.
function harness(options: { absent?: boolean; method?: string; expired?: boolean; claimsFailure?: boolean; userFailure?: boolean; anonymous?: boolean; switched?: boolean; updateFailure?: boolean; requestFailure?: boolean; missingUser?: boolean } = {}) {
  const calls: { name: string; args?: unknown }[] = [];
  const user = { id: 'isolated-test-user', is_anonymous: options.anonymous ?? false };
  const auth = {
    getSession: async () => ({ error: null, data: { session: options.absent ? null : { access_token: 'NON_TOKEN_TEST_DOUBLE', user } } }),
    getClaims: async () => ({ error: options.claimsFailure ? new Error('untrusted') : null, data: { claims: { sub: user.id, exp: Math.floor(Date.now() / 1000) + (options.expired ? -60 : 3600), session_id: options.switched ? 'different-session' : 'test-session', is_anonymous: user.is_anonymous, amr: [{ method: options.method ?? 'recovery' }] } } }),
    getUser: async () => ({ error: options.userFailure ? new Error('revoked') : null, data: { user } }),
    resetPasswordForEmail: async (...args: unknown[]) => { calls.push({ name: 'request', args }); return { data: {}, error: options.requestFailure ? new Error('failed') : null }; },
    updateUser: async (args: unknown) => { calls.push({ name: 'update', args }); return { error: options.updateFailure ? new Error('policy') : null, data: { user: options.missingUser ? null : user } }; },
  } as unknown as SupabaseClient['auth'];
  return { auth, calls };
}
const identity = { userId: 'isolated-test-user', sessionId: 'test-session' };

test('recovery request uses the real API contract and fixed same-origin reset route', async () => {
  const { auth, calls } = harness();
  await requestPasswordRecovery(auth, ' person@example.invalid ', 'https://example.invalid');
  assert.deepEqual(calls, [{ name: 'request', args: ['person@example.invalid', { redirectTo: 'https://example.invalid/auth/reset-password' }] }]);
  assert.equal(recoveryRedirect('http://localhost:3001'), 'http://localhost:3001/auth/reset-password');
  assert.throws(() => recoveryRedirect('http://remote.example.invalid'));
  assert.throws(() => recoveryRedirect('javascript:alert(1)'));
});
test('provider request failure cannot be returned as accepted', async () => {
  await assert.rejects(requestPasswordRecovery(harness({ requestFailure: true }).auth, 'x@example.invalid', 'https://example.invalid'), { message: 'request-failed' });
});
test('password validation uses existing minimum without trimming passwords', () => {
  assert.match(read('app/(auth)/register/page.tsx'), /password.length < 6/);
  assert.throws(() => validateRecoveryPassword('', ''), { message: 'password-required' });
  assert.throws(() => validateRecoveryPassword('12345', '12345'), { message: 'password-short' });
  assert.throws(() => validateRecoveryPassword('abcdef', 'abcdefg'), { message: 'password-mismatch' });
  assert.doesNotThrow(() => validateRecoveryPassword(' abcdef ', ' abcdef '));
});
for (const [name, options] of Object.entries({
  absent: { absent: true }, ordinaryPassword: { method: 'password' }, oauth: { method: 'oauth' },
  verification: { method: 'email/signup' }, expired: { expired: true },
  unverifiedClaims: { claimsFailure: true }, rejectedUser: { userFailure: true }, anonymous: { anonymous: true },
})) test('rejects ' + name + ' before any password update', async () => {
  const { auth, calls } = harness(options);
  await assert.rejects(updateRecoveredPassword(auth, identity, 'abcdefg', 'abcdefg'), { message: 'invalid-session' });
  assert.equal(calls.length, 0);
});
test('recovery session must have verified claims and authoritative matching user', async () => {
  assert.deepEqual(await validateRecoverySession(harness().auth), identity);
});
test('session replacement invalidates the form before update', async () => {
  const { auth, calls } = harness({ switched: true });
  await assert.rejects(updateRecoveredPassword(auth, identity, 'abcdef', 'abcdef'), { message: 'invalid-session' });
  assert.equal(calls.length, 0);
});
test('mismatch is rejected before update', async () => {
  const { auth, calls } = harness();
  await assert.rejects(updateRecoveredPassword(auth, identity, 'abcdef', 'abcdefg'), { message: 'password-mismatch' });
  assert.equal(calls.length, 0);
});
test('successful password flow sends only the password to authoritative updateUser', async () => {
  const { auth, calls } = harness();
  await updateRecoveredPassword(auth, identity, 'abcdefg', 'abcdefg');
  assert.deepEqual(calls, [{ name: 'update', args: { password: 'abcdefg' } }]);
});
for (const options of [{ updateFailure: true }, { missingUser: true }]) test('update failure/absent authoritative result cannot claim success', async () => {
  await assert.rejects(updateRecoveredPassword(harness(options).auth, identity, 'abcdefg', 'abcdefg'), { message: 'update-failed' });
});
test('only new recovery entry is added to Login; existing handlers and form order preserved', () => {
  const source = read('app/(auth)/login/page.tsx');
  assert.equal((source.match(/href="\/auth\/forgot-password"/g) ?? []).length, 1);
  assert.match(source, /supabase.auth.signInWithPassword/);
  assert.match(source, /supabase.auth.signInWithOAuth/);
  assert.match(source, /buildOAuthCallbackUrl/);
  assert.equal((source.match(/<input\s/g) ?? []).length, 2);
  assert.ok(source.indexOf('id="login-email"') < source.indexOf('id="login-password"'));
  assert.match(read('components/auth/password-recovery.module.css'), /\.loginEntry \{ display:none; \}/);
});
test('recovery pages are reachable before session creation, protected routes remain protected', () => {
  for (const route of ['/auth/forgot-password', '/auth/reset-password']) {
    const result = proxy(new NextRequest('https://example.invalid' + route));
    assert.equal(result.headers.get('x-middleware-next'), '1');
    assert.equal(result.headers.get('location'), null);
  }
  const protectedResult = proxy(new NextRequest('https://example.invalid/my-account'));
  assert.equal(new URL(protectedResult.headers.get('location')!).pathname, '/login');
});
test('new routes share bilingual accessible recovery form, not verification logic', () => {
  assert.match(read('app/auth/forgot-password/page.tsx'), /mode="forgot"/);
  assert.match(read('app/auth/reset-password/page.tsx'), /mode="reset"/);
  assert.match(read('app/auth/reset-password/page.tsx'), /referrer: 'no-referrer'/);
  const source = read('components/auth/PasswordRecovery.tsx');
  assert.match(source, /نسيت كلمة المرور؟/);
  assert.match(source, /Reset password/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /await updateRecoveredPassword[\s\S]*setUpdated\(true\)/);
  assert.match(source, /signOut\(\{ scope: 'local' \}\)/);
  assert.doesNotMatch(source, /verifyOtp|setSession|localStorage|console\./);
});
