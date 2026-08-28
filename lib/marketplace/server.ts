import { getMarketplaceAdapters } from '@/lib/marketplace/adapters';
import { fetchAllTravelProviderCards } from '@/lib/marketplace/travel-provider-integration';
import type { MarketplaceCard } from '@/lib/marketplace/cards';
import { fetchProtectedProviderCards } from '@/lib/marketplace/provider-search-protection';
import {
  filterMarketplaceServices,
  normalizeMarketplaceServices,
  queryMarketplaceServices,
  summarizeMarketplace,
  type MarketplaceCollectionKey,
  type MarketplaceDataSource,
  type MarketplaceFamilyKey,
  type MarketplacePageCategory,
  type MarketplaceQueryOptions,
  type MarketplaceService,
  type MarketplaceSortKey,
} from '@/lib/marketplace/data';

export type MarketplaceApiQuery = MarketplaceQueryOptions & {
  page?: number;
  pageSize?: number;
  checkIn?: string;
  checkOut?: string;
  departureFrom?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  children?: number;
};

export type MarketplaceRequestContext = {
  anonymous?: boolean;
  clientKey?: string;
};

export type MarketplaceSnapshot = {
  services: MarketplaceService[];
  source: MarketplaceDataSource;
  hasRealData: boolean;
  generatedAt: string;
};

export function summarizeMarketplacePageProvenance(items: MarketplaceService[]) {
  const hasRealData = items.some((service) =>
    service.provenance === 'PROVIDER_LIVE' || service.provenance === 'PARTNER_VERIFIED'
  );
  const hasFallbackData = items.some((service) => service.provenance === 'FALLBACK');
  return { hasRealData, hasFallbackData, mixedSources: hasRealData && hasFallbackData };
}

export type MarketplaceAssistantDataQuality = 'live-verified' | 'pilot-test' | 'unavailable';

function containsPilotMarker(value: unknown) {
  return /(?:phase[- ]?\d+|test|synthetic|staging|seed|provisional|review)/i.test(String(value ?? ''));
}

export function classifyMarketplaceAssistantDataQuality(
  services: Array<Pick<MarketplaceService, 'slug' | 'name_ar' | 'name_en' | 'description_ar' | 'description_en' | 'badge' | 'supplierVerified'>>,
  hasRealData: boolean,
): MarketplaceAssistantDataQuality {
  if (services.length === 0) return 'unavailable';
  const hasPilotMarkers = services.some((service) =>
    [service.slug, service.name_ar, service.name_en, service.description_ar, service.description_en, service.badge]
      .some(containsPilotMarker),
  );
  const allSuppliersVerified = services.every((service) => service.supplierVerified === true);
  return hasPilotMarkers || !hasRealData || !allSuppliersVerified ? 'pilot-test' : 'live-verified';
}

export function filterAssistantServices<T extends Pick<MarketplaceService, 'source' | 'slug' | 'name_ar' | 'name_en' | 'description_ar' | 'description_en' | 'badge' | 'supplierVerified'>>(services: T[]) {
  return services.filter((service) => service.source !== 'fallback')
    .filter((service) => service.supplierVerified === true)
    .filter((service) => ![service.slug, service.name_ar, service.name_en, service.description_ar, service.description_en, service.badge].some(containsPilotMarker));
}

export function filterCustomerMarketplaceServices<T extends Pick<MarketplaceService, 'source' | 'provenance' | 'marketplaceEnvironment' | 'fulfilmentState'>>(services: T[]) {
  return services.filter((service) =>
    service.source !== 'fallback' &&
    service.provenance !== 'FALLBACK' &&
    service.provenance !== 'SYNTHETIC_TEST' &&
    service.provenance !== 'PROVIDER_SANDBOX' &&
    service.marketplaceEnvironment === 'production' &&
    service.fulfilmentState !== 'test_sandbox'
  );
}

function withDestination(records: Array<Record<string, unknown>>) {
  return records.map((record) => {
    const products = Array.isArray(record.products)
      ? (record.products as Array<{ region?: { name_ar?: string | null; name_en?: string | null } | null }>)
      : [];
    const region = products.find((product) => product.region)?.region;

    return {
      ...record,
      region_name: region?.name_ar ?? region?.name_en ?? null,
    };
  });
}

async function fetchSupabaseServices(): Promise<MarketplaceService[]> {
  const adapters = getMarketplaceAdapters();

  for (const adapter of adapters) {
    const result = await adapter.fetchServices();

    if (!result || !Array.isArray(result.services)) {
      continue;
    }

    return normalizeMarketplaceServices(withDestination(result.services), {
      includeFallback: true,
      source: result.source,
    });
  }

  throw new Error('No marketplace provider returned data');
}

export async function getMarketplaceSnapshot(): Promise<MarketplaceSnapshot> {
  try {
    const services = filterCustomerMarketplaceServices(await fetchSupabaseServices());
    const hasRealData = services.some((service) => service.source !== 'fallback');
    const source = hasRealData
      ? services.find((service) => service.source !== 'fallback')?.source ?? 'supabase'
      : 'fallback';

    return {
      services,
      source,
      hasRealData,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      // Catalogue fallbacks are discovery content, never customer inventory.
      services: [],
      source: 'fallback',
      hasRealData: false,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function sanitizeMarketplaceQuery(input: URLSearchParams): MarketplaceApiQuery {
  const collection = (input.get('collection') ?? 'all') as MarketplaceCollectionKey;
  const sort = (input.get('sort') ?? 'recommended') as MarketplaceSortKey;
  const family = (input.get('family') ?? undefined) as MarketplaceFamilyKey | undefined;
  const category = (input.get('category') ?? undefined) as MarketplacePageCategory | undefined;
  const query = input.get('query') ?? undefined;
  const destination = input.get('destination') ?? undefined;
  const budget = input.get('budget') ?? undefined;
  const travelers = input.get('travelers') ?? undefined;
  const availability = (input.get('availability') ?? 'all') as MarketplaceApiQuery['availability'];
  const page = Number(input.get('page') ?? 1);
  const pageSize = Number(input.get('pageSize') ?? 9);
  const adults = Number(input.get('adults') ?? 1);
  const children = Number(input.get('children') ?? 0);

  return {
    family,
    category,
    query,
    collection,
    sort,
    destination,
    budget,
    travelers,
    availability,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 30) : 9,
    checkIn: input.get('checkIn') ?? undefined,
    checkOut: input.get('checkOut') ?? undefined,
    departureFrom: input.get('departureFrom') ?? undefined,
    departureDate: input.get('departureDate') ?? undefined,
    returnDate: input.get('returnDate') ?? undefined,
    adults: Number.isFinite(adults) && adults > 0 ? Math.min(adults, 20) : 1,
    children: Number.isFinite(children) && children >= 0 ? Math.min(children, 20) : 0,
  };
}

function providerCardsToServices(cards: MarketplaceCard[]): MarketplaceService[] {
  return cards.map((card, index) => {
    const isStay = card.serviceType === 'stay';
    const category: MarketplacePageCategory = isStay ? 'hotels' : 'airport-transfers';
    const family: MarketplaceFamilyKey = isStay ? 'dir3-stay' : 'dir3-fly';
    const name = card.title || 'Travel service';
    const description = card.subtitle || card.location;

    return {
      id: `provider-${card.serviceType}-${index}-${card.provider}`,
      slug: `provider-${card.serviceType}-${index}`,
      name_ar: name,
      name_en: name,
      description_ar: description,
      description_en: description,
      badge: card.provider,
      family,
      familyLabel: isStay ? 'dir3 Stay' : 'dir3 Fly',
      category,
      categoryLabel: isStay ? 'Hotels' : 'Flights',
      icon: isStay ? 'hotel' : 'plane',
      href: card.deepLink ?? (isStay ? '/hotels' : '/fly'),
      metric: card.rating ? `${card.rating}/5` : card.location,
      tags: [card.provider, card.location],
      basePrice: card.priceFrom ?? 0,
      currency: card.currency,
      productCount: 1,
      inventoryCount: 1,
      availability: card.availabilityStatus === 'sold-out' ? 'sold-out' : 'available',
      destination: card.location.toLowerCase(),
      featured: false,
      popular: false,
      recommended: true,
      source: 'api',
      provenance: card.verified ? 'PARTNER_VERIFIED' : 'PROVIDER_LIVE',
      fulfilmentState: card.availabilityStatus === 'sold-out' ? 'unavailable' : 'availability_unknown',
      transactionMethod: 'none',
      marketplaceEnvironment: 'production',
      supplyType: card.verified ? 'verified_local_partner' : 'global_travel_partner',
      supplierName: card.provider,
      supplierVerified: card.verified,
      createdAt: null,
      updatedAt: null,
    } satisfies MarketplaceService;
  });
}

export async function queryMarketplace(apiQuery: MarketplaceApiQuery, context: MarketplaceRequestContext = {}) {
  const snapshot = await getMarketplaceSnapshot();
  const hasTravelSearch = Boolean(
    apiQuery.destination && (apiQuery.checkIn || apiQuery.departureDate),
  );
  const providerOptions = {
        mode: 'PROVIDER_LIVE',
        destination: apiQuery.destination,
        checkIn: apiQuery.checkIn,
        checkOut: apiQuery.checkOut,
        departureFrom: apiQuery.departureFrom,
        departureDate: apiQuery.departureDate,
        returnDate: apiQuery.returnDate,
        adults: apiQuery.adults,
        children: apiQuery.children,
      } as const;
  const providerResult = hasTravelSearch
    ? await fetchProtectedProviderCards(
        providerOptions,
        context.clientKey ?? 'anonymous',
        fetchAllTravelProviderCards,
        { rateLimit: context.anonymous !== false },
      )
    : { cards: [], limited: false };
  const providerServices = providerCardsToServices(providerResult.cards);
  const services = filterCustomerMarketplaceServices(providerServices.length > 0
    ? [...providerServices, ...snapshot.services]
    : snapshot.services);

  const scoped = filterMarketplaceServices(services, {
    family: apiQuery.family,
  });

  const facets = summarizeMarketplace(scoped);
  const result = queryMarketplaceServices(services, apiQuery);
  const provenance = summarizeMarketplacePageProvenance(result.items);

  return {
    services: result.items,
    meta: {
      source: snapshot.source,
      ...provenance,
      providerSearchLimited: providerResult.limited,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      generatedAt: snapshot.generatedAt,
      facets,
    },
  };
}

export async function getMarketplaceAssistantContext() {
  const snapshot = await getMarketplaceSnapshot();
  const services = filterAssistantServices(snapshot.services);
  const topServices = services
    .slice(0, 6)
    .map((service) => ({
      id: service.id,
      title: service.name_ar,
      category: service.categoryLabel,
      price: service.basePrice,
      currency: service.currency,
      destination: service.destination,
      href: service.href,
    }));

  const dataQuality = classifyMarketplaceAssistantDataQuality(services, snapshot.hasRealData);

  const facets = summarizeMarketplace(services);

  return {
    source: snapshot.source,
    hasRealData: snapshot.hasRealData,
    dataQuality,
    totalServices: services.length,
    categories: facets.categories,
    collections: facets.collections,
    topServices,
    generatedAt: snapshot.generatedAt,
  };
}
