import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalPreviewRequest } from '@/lib/marketplace/local-preview-mode';
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

test('security: local preview requires explicit server flag and rejects forwarded host', () => {
  const previous = process.env.NODE_ENV;
  const flag = process.env.DIR3COM_LOCAL_PREVIEW_ENABLED;
  environment.NODE_ENV = 'development';
  delete environment.DIR3COM_LOCAL_PREVIEW_ENABLED;
  assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox')), false);
  environment.DIR3COM_LOCAL_PREVIEW_ENABLED = 'true';
  assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox')), true);
  assert.equal(isLocalPreviewRequest(request('http://localhost/api/local-preview/marketplace?preview=sandbox', { forwarded: 'host=attacker.example' })), false);
  if (previous === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = previous;
  if (flag === undefined) delete environment.DIR3COM_LOCAL_PREVIEW_ENABLED; else environment.DIR3COM_LOCAL_PREVIEW_ENABLED = flag;
});

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
