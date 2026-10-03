import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { buildOAuthCallbackUrl } from '../lib/auth/oauth-callback';
import { getPostLoginDestination } from '../lib/auth/redirect';

// Execute the real page handler, then let the installed SDK build its OAuth URL.
// No Google/Supabase network call, session, customer record or credential is used.
async function startGoogle(page: 'login' | 'register', consent = true, requested: string | null = null) {
  const path = `app/(auth)/${page}/page.tsx`;
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlerName = page === 'login' ? 'handleGoogleLogin' : 'handleGoogle';
  let handler: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === handlerName) handler = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(handler, `${handlerName} exists on the real page`);
  const storage = new Map<string, string>();
  const client = createClient('https://qa.example.invalid', 'isolated-test-public-key', {
    auth: {
      flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false,
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value); },
        removeItem: key => { storage.delete(key); },
      },
    },
    global: { fetch: async () => { throw new Error('Network is forbidden in this test'); } },
  });
  let calls = 0;
  let destination = '';
  const compiled = ts.transpileModule(`exports.run = ${handler.getText(parsed)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: { run?: () => Promise<void> } = {};
  runInNewContext(compiled, {
    exports, consent, consentInput: { current: { focus() {} } }, ar: false,
    requestedDestination: requested,
    redirectTo: getPostLoginDestination(requested, 'https://example.invalid'),
    buildOAuthCallbackUrl, getPostLoginDestination,
    setLoading() {}, setError() {}, t: { googleRedirectError: 'Missing redirect' },
    window: { location: { origin: 'https://example.invalid', assign(url: string) { destination = url; } } },
    supabase: { auth: { async signInWithOAuth(input: Parameters<typeof client.auth.signInWithOAuth>[0]) {
      calls++;
      assert.equal(input.provider, 'google');
      assert.equal(input.options?.skipBrowserRedirect, true);
      return client.auth.signInWithOAuth(input);
    } } },
  });
  await exports.run!();
  return { calls, destination, storage };
}

for (const page of ['login', 'register'] as const) {
  test(`${page}: explicit Google action requests account choice and preserves PKCE`, async () => {
    const result = await startGoogle(page);
    assert.equal(result.calls, 1);
    const url = new URL(result.destination);
    assert.equal(url.origin, 'https://qa.example.invalid');
    assert.equal(url.pathname, '/auth/v1/authorize');
    assert.equal(url.searchParams.get('provider'), 'google');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    assert.ok([...result.storage.keys()].some(key => key.endsWith('-code-verifier')));
    assert.equal(url.searchParams.has('login_hint'), false);
    assert.equal(url.searchParams.has('access_type'), false);
    assert.equal(new URL(url.searchParams.get('redirect_to')!).pathname, '/auth/callback');
  });
}

test('login keeps the requested product return and rejects external redirects', async () => {
  for (const requested of ['/services/test?request=1', 'https://outside.invalid', '//outside.invalid']) {
    const result = await startGoogle('login', true, requested);
    const callback = new URL(new URL(result.destination).searchParams.get('redirect_to')!);
    assert.equal(callback.origin, 'https://example.invalid');
    assert.equal(callback.searchParams.get('redirect'), requested.startsWith('/services/') ? requested : '/');
    assert.equal(callback.searchParams.get('next'), callback.searchParams.get('redirect'));
  }
});

test('registration still requires policy consent before starting Google OAuth', async () => {
  const result = await startGoogle('register', false);
  assert.equal(result.calls, 0);
  assert.equal(result.destination, '');
  assert.equal(result.storage.size, 0);
});
