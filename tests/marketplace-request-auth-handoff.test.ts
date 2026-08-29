import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildMarketplaceLoginHandoff,
  buildMarketplaceRequestReturnPath,
} from '../lib/auth/marketplace-request-handoff';
import { getPostLoginDestination } from '../lib/auth/redirect';

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
