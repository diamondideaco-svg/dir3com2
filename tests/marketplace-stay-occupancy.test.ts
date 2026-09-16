import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as data from '../lib/marketplace/data';
import * as launch from '../lib/marketplace/launch-catalog';
import * as context from '../lib/marketplace/search-context';
import type { MarketplaceApiQuery } from '../lib/marketplace/server';

function isolatedServer() {
  const calls: Array<{ adults: number }> = [];
  const providerCard = { provider: 'liteapi', providerItemId: 'unit-rate', serviceType: 'stay', title: 'Unit only', subtitle: 'Unit room', location: 'Cairo', priceFrom: 123, currency: 'SAR', availabilityStatus: 'available', providerSandbox: true, fulfilmentState: 'test_sandbox', transactionMethod: 'view_only', marketplaceEnvironment: 'sandbox', retrievedAt: '2026-09-14T00:00:00Z', deepLink: '/marketplace/provider-proof/liteapi/unit-rate?hotelId=unit-hotel' };
  const deps: Record<string, unknown> = {
    '@/lib/marketplace/adapters': { getMarketplaceAdapters: () => [] },
    '@/lib/marketplace/travel-provider-integration': { fetchTravelProviderHotels() {}, fetchAllTravelProviderCards() {} },
    '@/lib/marketplace/provider-search-protection': { fetchProtectedProviderCards: async (options: { adults: number }) => { calls.push(options); return { cards: [providerCard], limited: false }; } },
    '@/lib/marketplace/data': data,
    '@/lib/marketplace/launch-catalog': launch,
    '@/lib/currency/service': { convertCurrency: async () => { throw Error('No FX expected'); } },
    '@/lib/marketplace/search-context': context,
  };
  const exports: { queryMarketplace?: typeof import('../lib/marketplace/server').queryMarketplace } = {};
  const source = readFileSync(new URL('../lib/marketplace/server.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, require(name: string) { assert.ok(name in deps, name); return deps[name]; } });
  return { calls, query: exports.queryMarketplace! };
}

for (const adults of [1, 2]) {
  test(`Stay proof queries exactly ${adults} adult(s), keeps card and detail occupancy without inventing capacity`, async () => {
    const server = isolatedServer();
    const query: MarketplaceApiQuery = { family: 'dir3-stay', destination: 'Cairo', checkIn: '2099-10-12', checkOut: '2099-10-14', travelers: String(adults), adults: 1, language: 'en' };
    const result = await server.query(query, { publicMarketplace: true, liteApiSandboxProof: true });
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].adults, adults);
    assert.equal(result.services.length, 1);
    const card = result.services[0];
    assert.equal(card.queriedAdults, adults);
    assert.equal(card.maxGuests, undefined);
    assert.equal(card.supplierPriceAmount, 123);
    assert.equal(card.supplierPriceCurrency, 'SAR');
    assert.equal(card.provenance, 'PROVIDER_SANDBOX');
    assert.equal(card.transactionMethod, 'view_only');
    assert.equal(new URL(card.href, 'http://unit.invalid').searchParams.get('adults'), String(adults));
    assert.equal(data.filterMarketplaceServices([card], { travelers: String(adults === 1 ? 2 : 1) }).length, 0);
    assert.equal(data.filterMarketplaceServices([{ ...card, provenance: 'PARTNER_VERIFIED' }], { travelers: '1' }).length, 0, 'local unknown capacity remains excluded');
  });
}

test('ambiguous, invalid, or child occupancy never produces a fabricated one-adult proof quote', async () => {
  for (const input of [{ travelers: '3+' }, { travelers: '0' }, { travelers: '21' }, { travelers: '1.5' }, { travelers: '1', children: 1 }, { travelers: 'all', adults: 1.5 }]) {
    const server = isolatedServer();
    const result = await server.query({ family: 'dir3-stay', destination: 'Cairo', checkIn: '2099-10-12', checkOut: '2099-10-14', ...input }, { publicMarketplace: true, liteApiSandboxProof: true });
    assert.equal(server.calls.length, 0);
    assert.equal(result.services.length, 0);
  }
});

test('unscoped public marketplace cannot surface provider Sandbox results', async () => {
  const server = isolatedServer();
  const result = await server.query({ family: 'dir3-stay', destination: 'Cairo', checkIn: '2099-10-12', travelers: '1', adults: 1 }, { publicMarketplace: true });
  assert.equal(result.services.length, 0);
});

test('LiteAPI detail validates exact occupancy and forwards it without changing other providers', () => {
  const source = readFileSync(new URL('../app/marketplace/provider-proof/[provider]/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /Number\.isInteger\(adults\) && adults >= 1 && adults <= 20/);
  assert.match(source, /provider !== 'liteapi' \|\| validOccupancy/);
  assert.match(source, /provider === 'liteapi' \? \{ adults \} : \{\}/);
});
