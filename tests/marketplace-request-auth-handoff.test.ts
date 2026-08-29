import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildMarketplaceLoginHandoff,
  buildMarketplaceRequestReturnPath,
} from '../lib/auth/marketplace-request-handoff';
import { getPostLoginDestination } from '../lib/auth/redirect';
import { buildOAuthCallbackUrl, getOAuthCallbackOrigin } from '../lib/auth/oauth-callback';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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

test('login and OAuth callback honor the existing safe return mechanism', () => {
  const login = read('app/(auth)/login/page.tsx');
  const callback = read('app/auth/callback/route.ts');

  assert.match(login, /resolvePostLoginDestination\(requestedDestination, redirectTo\)/);
  assert.match(callback, /getPostLoginDestination\(requestedDestination, origin\)/);
  assert.match(callback, /requestedDestination\s*\?\s*safeRequestedDestination/);
});

test('preview OAuth uses the stable Vercel branch origin and preserves request state', () => {
  const branchOrigin = getOAuthCallbackOrigin(
    'https://dir3com2-random-dir3com.vercel.app',
    'preview',
    'dir3com2-git-fix-marketplace-drive-p0-read-path-v1-dir3com.vercel.app',
  );

  assert.equal(
    branchOrigin,
    'https://dir3com2-git-fix-marketplace-drive-p0-read-path-v1-dir3com.vercel.app',
  );

  const previousEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const previousBranchUrl = process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;
  process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
  process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL = 'dir3com2-git-fix-marketplace-drive-p0-read-path-v1-dir3com.vercel.app';

  try {
    const destination = '/services/drive-product?intent=request_to_confirm&product=drive-1&family=drive';
    const callback = new URL(buildOAuthCallbackUrl('https://dir3com2-random-dir3com.vercel.app', destination));
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
