import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isLocalPreviewExecutionEnabled, isLocalPreviewRequest } from '@/lib/marketplace/local-preview-mode';
import { resolveMarketplaceRequestContext } from '@/lib/marketplace/request-context';
import { summarizeMarketplacePageProvenance } from '@/lib/marketplace/server';
import {
  fetchProtectedProviderCards,
  resetProviderSearchProtection,
} from '@/lib/marketplace/provider-search-protection';
import { normalizeMarketplaceCard } from '@/lib/marketplace/cards';
import { createMarketplaceFallbackServices } from '@/lib/marketplace/data';

const card = normalizeMarketplaceCard({
  serviceType: 'stay',
  title: 'Verified hotel',
  location: 'Cairo',
  provider: 'LiteAPI',
  priceFrom: 100,
  currency: 'SAR',
});
assert(card);
const environment = process.env as Record<string, string | undefined>;

function request(url: string, headers?: HeadersInit) {
  return new Request(url, { headers });
}

test('security: production local preview is denied even on localhost', () => {
  const previous = process.env.NODE_ENV;
  const flag = process.env.DIR3COM_LOCAL_PREVIEW_ENABLED;
  environment.NODE_ENV = 'production';
  environment.DIR3COM_LOCAL_PREVIEW_ENABLED = 'true';
  try {
    assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox')), false);
    assert.equal(isLocalPreviewRequest(request('http://attacker.example/api/local-preview/marketplace?preview=sandbox')), false);
    assert.equal(isLocalPreviewRequest(request('http://demo.local/api/local-preview/marketplace?preview=sandbox')), false);
  } finally {
    if (previous === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = previous;
    if (flag === undefined) delete environment.DIR3COM_LOCAL_PREVIEW_ENABLED; else environment.DIR3COM_LOCAL_PREVIEW_ENABLED = flag;
  }
});

test('security: HTTP local preview fails closed without a trusted peer address', () => {
  const previous = process.env.NODE_ENV;
  const flag = process.env.DIR3COM_LOCAL_PREVIEW_ENABLED;
  environment.NODE_ENV = 'development';
  delete environment.DIR3COM_LOCAL_PREVIEW_ENABLED;
  assert.equal(isLocalPreviewExecutionEnabled(), false);
  environment.DIR3COM_LOCAL_PREVIEW_ENABLED = 'true';
  assert.equal(isLocalPreviewExecutionEnabled(), true);
  assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox')), false);
  assert.equal(isLocalPreviewRequest(request('http://127.0.0.1/api/local-preview/marketplace?preview=sandbox')), false);
  assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox', { forwarded: 'host=attacker.example' })), false);
  if (previous === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = previous;
  if (flag === undefined) delete environment.DIR3COM_LOCAL_PREVIEW_ENABLED; else environment.DIR3COM_LOCAL_PREVIEW_ENABLED = flag;
});

test('security: authentication requires validated server-side user resolution', async () => {
  const invalidInputs = [
    new NextRequest('http://localhost/api/services', { headers: { authorization: 'invalid' } }),
    new NextRequest('http://localhost/api/services', { headers: { authorization: 'Bearer garbage' } }),
    new NextRequest('http://localhost/api/services', { headers: { cookie: 'sb-fake=1' } }),
  ];
  for (const input of invalidInputs) {
    const context = await resolveMarketplaceRequestContext(input, async () => null);
    assert.equal(context.anonymous, true);
  }
  const failed = await resolveMarketplaceRequestContext(
    new NextRequest('http://localhost/api/services'),
    async () => { throw new Error('expired session'); },
  );
  assert.equal(failed.anonymous, true);
  const authenticated = await resolveMarketplaceRequestContext(
    new NextRequest('http://localhost/api/services'),
    async () => ({ user: { id: 'user-1' } } as Awaited<ReturnType<AuthenticationResolverForTest>>),
  );
  assert.equal(authenticated.anonymous, false);
  assert.equal(authenticated.clientKey, 'authenticated:user-1');
});

test('security: Vercel anonymous provider budgets are isolated without retaining raw addresses', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    const first = await resolveMarketplaceRequestContext(
      new NextRequest('http://localhost/api/services', { headers: { 'x-vercel-forwarded-for': '203.0.113.10' } }),
      async () => null,
    );
    const second = await resolveMarketplaceRequestContext(
      new NextRequest('http://localhost/api/services', { headers: { 'x-vercel-forwarded-for': '203.0.113.11' } }),
      async () => null,
    );
    assert.notEqual(first.clientKey, second.clientKey);
    assert.match(first.clientKey, /^anonymous:[a-f0-9]{24}$/);
    assert.doesNotMatch(first.clientKey, /203\.0\.113\.10/);
  } finally {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
  }
});

type AuthenticationResolverForTest = typeof import('@/lib/supabase/server').createSupabaseRequestClient;

test('security: anonymous repeated provider searches are rate limited', async () => {
  resetProviderSearchProtection();
  let calls = 0;
  const options = { mode: 'PROVIDER_LIVE' as const, destination: 'Cairo', departureDate: '2026-09-10' };
  const fetcher = async () => { calls += 1; return [card]; };
  for (let index = 0; index < 20; index += 1) await fetchProtectedProviderCards(options, 'client-a', fetcher);
  const limited = await fetchProtectedProviderCards(options, 'client-a', fetcher);
  assert.equal(limited.limited, true);
  assert.equal(calls, 1);
});

test('security: fake authentication cannot invoke providers after the anonymous limit', async () => {
  resetProviderSearchProtection();
  const context = await resolveMarketplaceRequestContext(
    new NextRequest('http://localhost/api/services', { headers: { authorization: 'Bearer garbage', cookie: 'sb-fake=1' } }),
    async () => null,
  );
  let calls = 0;
  const options = { mode: 'PROVIDER_LIVE' as const, destination: 'Cairo', departureDate: '2026-09-10' };
  const fetcher = async () => { calls += 1; return [card]; };
  for (let index = 0; index < 20; index += 1) {
    await fetchProtectedProviderCards(options, context.clientKey, fetcher);
  }
  const limited = await fetchProtectedProviderCards(options, context.clientKey, fetcher);
  assert.equal(limited.limited, true);
  assert.equal(calls, 1);
});

test('security: identical in-flight searches coalesce and concurrent budget rejects excess work', async () => {
  resetProviderSearchProtection();
  let calls = 0;
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const options = { mode: 'PROVIDER_LIVE' as const, destination: 'Cairo', departureDate: '2026-09-10' };
  const fetcher = async () => { calls += 1; await blocker; return [card]; };
  const first = fetchProtectedProviderCards(options, 'client-a', fetcher);
  const second = fetchProtectedProviderCards({ ...options, destination: 'Riyadh' }, 'client-b', fetcher);
  const coalesced = fetchProtectedProviderCards(options, 'client-d', fetcher);
  const third = fetchProtectedProviderCards({ ...options, destination: 'Jeddah' }, 'client-c', fetcher);
  assert.equal((await third).limited, true);
  release();
  await Promise.all([first, second, coalesced]);
  assert.equal(calls, 2);
});

test('security: provider result collection is capped and fallback provenance stays explicit', async () => {
  resetProviderSearchProtection();
  const options = { mode: 'PROVIDER_LIVE' as const, destination: 'Cairo', departureDate: '2026-09-10' };
  const result = await fetchProtectedProviderCards(options, 'client-a', async () => Array.from({ length: 30 }, () => card));
  assert.equal(result.cards.length, 20);
  const fallback = createMarketplaceFallbackServices()[0];
  assert.equal(fallback.provenance, 'FALLBACK');
  assert.equal(result.cards[0]?.provider, 'LiteAPI');
});

test('security: authenticated searches retain provider caps and per-user request budgets', async () => {
  resetProviderSearchProtection();
  const options = { mode: 'PROVIDER_LIVE' as const, destination: 'Cairo', departureDate: '2026-09-10' };
  const fetcher = async () => Array.from({ length: 30 }, () => card);
  let result = await fetchProtectedProviderCards(options, 'authenticated:user-1', fetcher);
  for (let index = 1; index < 20; index += 1) {
    result = await fetchProtectedProviderCards(options, 'authenticated:user-1', fetcher);
  }
  assert.equal(result.cards.length, 20);
  assert.equal(result.limited, false);
  assert.equal((await fetchProtectedProviderCards(options, 'authenticated:user-1', fetcher)).limited, true);
});

test('security: response provenance describes only final returned items', () => {
  const fallback = createMarketplaceFallbackServices()[0];
  const live = { ...fallback, id: 'live-1', source: 'api' as const, provenance: 'PROVIDER_LIVE' as const };

  assert.deepEqual(summarizeMarketplacePageProvenance([live]), {
    hasRealData: true,
    hasFallbackData: false,
    mixedSources: false,
  });
  assert.deepEqual(summarizeMarketplacePageProvenance([fallback]), {
    hasRealData: false,
    hasFallbackData: true,
    mixedSources: false,
  });
  assert.deepEqual(summarizeMarketplacePageProvenance([live, fallback]), {
    hasRealData: true,
    hasFallbackData: true,
    mixedSources: true,
  });

  const fullCollection = [live, fallback];
  assert.equal(summarizeMarketplacePageProvenance(fullCollection.slice(0, 1)).mixedSources, false);
  assert.equal(summarizeMarketplacePageProvenance(fullCollection.slice(1, 2)).mixedSources, false);
});
