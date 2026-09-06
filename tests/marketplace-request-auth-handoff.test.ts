import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import {
  buildMarketplaceLoginHandoff,
  buildMarketplaceRequestReturnPath,
} from '../lib/auth/marketplace-request-handoff';
import * as routing from '../lib/auth/redirect';
import { getPostLoginDestination } from '../lib/auth/redirect';
import { buildOAuthCallbackUrl, getOAuthCallbackOrigin, getTrustedVercelPreviewOrigin } from '../lib/auth/oauth-callback';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, URL,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected callback dependency: ${id}`);
      return dependencies[id];
    },
  }, { filename: path });
  return exports as T;
}

const identity = load<typeof import('../lib/auth/identity')>('lib/auth/identity.ts', { 'server-only': {} });

async function callbackDestination(role: string | null, parameters: Record<string, string> = {}) {
  const actorId = '11111111-1111-4111-8111-111111111111';
  let exchanges = 0;
  const profile = {
    select: () => profile,
    eq: (column: string, value: string) => {
      assert.equal(column, 'id');
      assert.equal(value, actorId);
      return profile;
    },
    maybeSingle: async () => ({ data: { role }, error: null }),
  };
  const supabase = {
    auth: { exchangeCodeForSession: async () => {
      exchanges++;
      return { data: { user: { id: actorId } }, error: null };
    } },
    from: (table: string) => { assert.equal(table, 'profiles'); return profile; },
  };
  const route = load<{ GET(request: Request): Promise<{ url: string }> }>('app/auth/callback/route.ts', {
    'next/server': { NextResponse: { redirect: (url: string) => ({ url }) } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => supabase, supabaseAdmin: null },
    '@/lib/auth/redirect': routing,
    '@/lib/auth/identity': { ...identity, ensureCanonicalProfileFromAuthUser: async () => undefined },
    '@/lib/security/safe-logger': { logServerError() {}, logServerEvent() {} },
  });
  const query = new URLSearchParams({ code: 'test', ...parameters });
  const result = await route.GET(new Request(`https://example.invalid/auth/callback?${query}`));
  assert.equal(exchanges, 1);
  return result.url;
}

test('request-to-confirm login handoff preserves product, PDP, family, and intent', () => {
  const returnPath = buildMarketplaceRequestReturnPath({
    slug: 'hyundai-elantra',
    productId: 'product-123',
    family: 'drive',
    intent: 'request_to_confirm',
  });
  const loginPath = buildMarketplaceLoginHandoff(returnPath);
  const loginUrl = new URL(loginPath, 'https://dir3com.com');

  assert.equal(returnPath, '/services/hyundai-elantra?intent=request_to_confirm&product=product-123&family=drive');
  assert.equal(loginUrl.pathname, '/login');
  assert.equal(loginUrl.searchParams.get('redirect'), returnPath);
  assert.equal(loginUrl.searchParams.get('next'), returnPath);
  assert.equal(getPostLoginDestination(returnPath, 'https://dir3com.com'), returnPath);
});

test('PDP checks trusted session identity before the durable request mutation', () => {
  const source = read('components/public/PublicServiceDetailClient.tsx');
  const identityIndex = source.indexOf("fetch('/api/auth/session-identity'");
  const requestIndex = source.indexOf("fetch('/api/marketplace/requests'");

  assert.ok(identityIndex > 0);
  assert.ok(requestIndex > identityIndex);
  assert.match(source, /identity\?\.authenticated !== true[\s\S]*window\.location\.assign\(buildMarketplaceLoginHandoff\(returnPath\)\)/);
  assert.match(source, /identity\?\.authenticated !== true[\s\S]*return;[\s\S]*setRequestState\('sending'\)[\s\S]*fetch\('\/api\/marketplace\/requests'/);
});

test('login and OAuth callback preserve safe returns alongside the staff default', async () => {
  const login = read('app/(auth)/login/page.tsx');
  assert.match(login, /resolvePostLoginDestination\(requestedDestination, redirectTo\)/);

  const returnPath = buildMarketplaceRequestReturnPath({
    slug: 'hyundai-elantra', productId: 'product-123', family: 'drive', intent: 'request_to_confirm',
  });
  for (const [role, defaultPath] of [['staff', '/admin'], ['customer', '/my-account'], ['admin', '/admin'], ['partner', '/partner-portal'], [null, '/my-account']] as const) {
    assert.equal(await callbackDestination(role), `https://example.invalid${defaultPath}`);
    assert.equal(await callbackDestination(role, { redirect: '/', next: '/' }), `https://example.invalid${role === 'staff' ? '/admin' : '/'}`);
    for (const parameter of ['redirect', 'next']) {
      for (const path of ['/', '/my-account', returnPath]) {
        assert.equal(await callbackDestination(role, { [parameter]: path }), `https://example.invalid${path}`);
      }
      for (const path of ['https://outside.invalid/', '//outside.invalid/', 'javascript:alert(1)']) {
        assert.equal(await callbackDestination(role, { [parameter]: path }), 'https://example.invalid/');
      }
    }
    assert.equal(await callbackDestination(role, { redirect: returnPath, next: returnPath }), `https://example.invalid${returnPath}`);
    assert.equal(await callbackDestination(role, { redirect: returnPath, next: '/my-account' }), `https://example.invalid${returnPath}`);
    assert.equal(await callbackDestination(role, { redirect: 'https://outside.invalid/', next: returnPath }), 'https://example.invalid/');
  }
});

test('preview OAuth uses the current trusted dir3com Preview origin and preserves request state', () => {
  const branchOrigin = getOAuthCallbackOrigin(
    'https://dir3com2-git-feat-dir118-revenue-launch-v1-dir3com.vercel.app',
    'preview',
    'dir3com2-git-fix-marketplace-drive-p0-read-path-v1-dir3com.vercel.app',
  );

  assert.equal(
    branchOrigin,
    'https://dir3com2-git-feat-dir118-revenue-launch-v1-dir3com.vercel.app',
  );

  const previousEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const previousBranchUrl = process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;
  process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
  process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL = 'dir3com2-git-fix-marketplace-drive-p0-read-path-v1-dir3com.vercel.app';

  try {
    const destination = '/services/drive-product?intent=request_to_confirm&product=drive-1&family=drive';
    const callback = new URL(buildOAuthCallbackUrl('https://dir3com2-git-feat-dir118-revenue-launch-v1-dir3com.vercel.app', destination));
    assert.equal(callback.origin, branchOrigin);
    assert.equal(callback.pathname, '/auth/callback');
    assert.equal(callback.searchParams.get('redirect'), destination);
    assert.equal(callback.searchParams.get('next'), destination);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    else process.env.NEXT_PUBLIC_VERCEL_ENV = previousEnvironment;
    if (previousBranchUrl === undefined) delete process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;
    else process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL = previousBranchUrl;
  }
});

test('OAuth callback origin preserves production and local behavior and rejects unsafe preview hosts', () => {
  assert.equal(getOAuthCallbackOrigin('https://dir3com.com', 'production', undefined), 'https://dir3com.com');
  assert.equal(getOAuthCallbackOrigin('http://localhost:3001', 'development', undefined), 'http://localhost:3001');
  assert.equal(
    getOAuthCallbackOrigin('https://safe-preview.example', 'preview', 'attacker.example'),
    'https://safe-preview.example',
  );
  assert.equal(
    getOAuthCallbackOrigin('https://safe-preview.example', 'preview', 'good.vercel.app@attacker.example'),
    'https://safe-preview.example',
  );
  assert.equal(
    getOAuthCallbackOrigin('https://dir3com2-git-another-branch-dir3com.vercel.app', 'preview', undefined),
    'https://dir3com2-git-another-branch-dir3com.vercel.app',
  );
  assert.equal(getTrustedVercelPreviewOrigin('https://attacker.vercel.app'), null);
  assert.equal(getTrustedVercelPreviewOrigin('https://dir3com2-git-safe-attacker.vercel.app'), null);
  assert.equal(getTrustedVercelPreviewOrigin('https://dir3com2-git-safe-dir3com.vercel.app.attacker.example'), null);
});

test('callback rejects external returns and exchanges the authorization code exactly once', () => {
  const callback = read('app/auth/callback/route.ts');

  assert.equal(getPostLoginDestination('https://attacker.example/collect', 'https://dir3com.com'), '/');
  assert.equal(getPostLoginDestination('//attacker.example/collect', 'https://dir3com.com'), '/');
  assert.equal(getPostLoginDestination('javascript:alert(1)', 'https://dir3com.com'), '/');
  assert.equal(callback.match(/exchangeCodeForSession\(/g)?.length, 1);
  assert.match(callback, /NextResponse\.redirect\(`\$\{origin\}\$\{next\}`\)/);
});

test('callback and refresh cannot create duplicate requests automatically', () => {
  const login = read('app/(auth)/login/page.tsx');
  const callback = read('app/auth/callback/route.ts');

  assert.doesNotMatch(login, /api\/marketplace\/requests/);
  assert.doesNotMatch(callback, /api\/marketplace\/requests/);
});

test('browse and PDP stay public while durable request ownership remains server-authoritative', () => {
  const proxy = read('proxy.ts');
  const requestRoute = read('app/api/marketplace/requests/route.ts');

  assert.match(proxy, /'\/marketplace'/);
  assert.match(proxy, /'\/services\/'/);
  assert.match(requestRoute, /createSupabaseRequestClient\(request\)/);
  assert.match(requestRoute, /if \(!auth\).*401/);
  assert.match(requestRoute, /user_id: auth\.user\.id/);
  assert.doesNotMatch(requestRoute, /body\.user_id|input\.user_id/);
});
