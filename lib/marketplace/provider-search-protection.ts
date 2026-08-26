import type { MarketplaceCard } from '@/lib/marketplace/cards';
import type { TravelProviderMarketplaceOptions } from '@/lib/marketplace/travel-provider-integration';

const WINDOW_MS = 60_000;
const MAX_ANONYMOUS_REQUESTS = 20;
const MAX_CONCURRENT_SEARCHES = 2;
const CACHE_MS = 15_000;
const MAX_CACHED_ENTRIES = 64;
const MAX_PROVIDER_CARDS = 20;

type Entry = { count: number; resetAt: number };
const requests = new Map<string, Entry>();
const cache = new Map<string, { expiresAt: number; cards: MarketplaceCard[] }>();
const inFlight = new Map<string, Promise<MarketplaceCard[]>>();
let activeSearches = 0;

export type ProviderSearchProtectionResult = {
  cards: MarketplaceCard[];
  limited: boolean;
};

function keyFor(options: TravelProviderMarketplaceOptions) {
  return JSON.stringify({ ...options, mode: 'PROVIDER_LIVE' });
}

function cap(cards: MarketplaceCard[]) {
  return cards.slice(0, MAX_PROVIDER_CARDS);
}

function isAllowed(clientKey: string, now: number) {
  const current = requests.get(clientKey);
  if (!current || current.resetAt <= now) {
    requests.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ANONYMOUS_REQUESTS) return false;
  current.count += 1;
  return true;
}

function trimCache() {
  while (cache.size > MAX_CACHED_ENTRIES) {
    const first = cache.keys().next().value as string | undefined;
    if (!first) break;
    cache.delete(first);
  }
}

export async function fetchProtectedProviderCards(
  options: TravelProviderMarketplaceOptions,
  clientKey: string,
  fetcher: (options: TravelProviderMarketplaceOptions) => Promise<MarketplaceCard[]>,
  protection: { rateLimit?: boolean } = {},
): Promise<ProviderSearchProtectionResult> {
  const now = Date.now();
  if (protection.rateLimit !== false && !isAllowed(clientKey, now)) return { cards: [], limited: true };

  const key = keyFor(options);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return { cards: cached.cards, limited: false };
  if (cached) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return { cards: await pending, limited: false };
  if (activeSearches >= MAX_CONCURRENT_SEARCHES) return { cards: [], limited: true };

  activeSearches += 1;
  const request = fetcher(options)
    .then((cards) => cap(cards))
    .catch(() => [])
    .finally(() => {
      activeSearches -= 1;
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  const cards = await request;
  cache.set(key, { cards, expiresAt: Date.now() + CACHE_MS });
  trimCache();
  return { cards, limited: false };
}

export function resetProviderSearchProtection() {
  requests.clear();
  cache.clear();
  inFlight.clear();
  activeSearches = 0;
}
