import { getMarketplaceAdapters } from '@/lib/marketplace/adapters';
import {
  createMarketplaceFallbackServices,
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
};

export type MarketplaceSnapshot = {
  services: MarketplaceService[];
  source: MarketplaceDataSource;
  hasRealData: boolean;
  generatedAt: string;
};

export type MarketplaceAssistantDataQuality = 'live-verified' | 'pilot-test' | 'unavailable';

function containsPilotMarker(value: unknown) {
  return /(?:phase[- ]?\d+|test|synthetic|staging|seed|provisional|review)/i.test(String(value ?? ''));
}

export function classifyMarketplaceAssistantDataQuality(
  services: Array<Pick<MarketplaceService, 'slug' | 'name_ar' | 'name_en' | 'description_ar' | 'description_en' | 'badge'>>,
  hasRealData: boolean,
): MarketplaceAssistantDataQuality {
  if (services.length === 0) return 'unavailable';
  const hasPilotMarkers = services.some((service) =>
    [service.slug, service.name_ar, service.name_en, service.description_ar, service.description_en, service.badge]
      .some(containsPilotMarker),
  );
  return hasPilotMarkers || !hasRealData ? 'pilot-test' : 'live-verified';
}

export function filterAssistantServices<T extends Pick<MarketplaceService, 'source' | 'slug' | 'name_ar' | 'name_en' | 'description_ar' | 'description_en' | 'badge'>>(services: T[]) {
  return services.filter((service) => service.source !== 'fallback')
    .filter((service) => ![service.slug, service.name_ar, service.name_en, service.description_ar, service.description_en, service.badge].some(containsPilotMarker));
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
    const services = await fetchSupabaseServices();
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
      services: createMarketplaceFallbackServices(),
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
  };
}

export async function queryMarketplace(apiQuery: MarketplaceApiQuery) {
  const snapshot = await getMarketplaceSnapshot();

  const scoped = filterMarketplaceServices(snapshot.services, {
    family: apiQuery.family,
  });

  const facets = summarizeMarketplace(scoped);
  const result = queryMarketplaceServices(snapshot.services, apiQuery);

  return {
    services: result.items,
    meta: {
      source: snapshot.source,
      hasRealData: snapshot.hasRealData,
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
  const services = snapshot.services;
  const topServices = filterAssistantServices(services)
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
