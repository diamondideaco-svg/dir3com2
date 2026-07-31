import { getAISearchConfig } from '@/lib/ai/config';
import { aiProviderRegistry } from '@/lib/ai/providers';
import { createMockProviderResponse } from '@/lib/ai/providers/shared';
import type {
  AIProviderAdapter,
  AIProviderId,
  MarketplaceAISearchPayload,
  MarketplaceSearchRequest,
} from '@/lib/ai/types';
import { normalizeMarketplaceSearchRequest } from '@/lib/ai/types';
import { filterMarketplaceServices, summarizeMarketplace, type MarketplaceCollectionKey, type MarketplaceService } from '@/lib/marketplace/data';

function providerPriority(primary: AIProviderId) {
  const rest = aiProviderRegistry.filter((provider) => provider.id !== primary && provider.id !== 'local');
  const preferred = aiProviderRegistry.find((provider) => provider.id === primary);

  return [preferred, ...rest, aiProviderRegistry.find((provider) => provider.id === 'local')]
    .filter(Boolean) as AIProviderAdapter[];
}

function facetScope(services: MarketplaceService[], family?: string) {
  if (!family) {
    return services;
  }

  return services.filter((service) => service.family === family);
}

export async function runMarketplaceAISearch(input: {
  request: Partial<MarketplaceSearchRequest>;
  services: MarketplaceService[];
  source: 'supabase' | 'api' | 'fallback';
  hasRealData: boolean;
  generatedAt: string;
}): Promise<MarketplaceAISearchPayload> {
  const config = getAISearchConfig();
  const request = normalizeMarketplaceSearchRequest(input.request);

  const context = {
    request,
    services: input.services,
  };

  const providers = providerPriority(config.provider);

  let selected = createMockProviderResponse('local', context, 'AI search disabled or provider unavailable');

  if (config.aiEnabled) {
    for (const provider of providers) {
      if (!provider.isEnabled(config)) {
        continue;
      }

      const response = await provider.search(context);
      if (response) {
        selected = response;
        break;
      }
    }
  }

  const allResults = selected.items;
  const total = allResults.length;
  const totalPages = Math.max(1, Math.ceil(total / request.pageSize));
  const page = Math.min(Math.max(1, request.page), totalPages);
  const start = (page - 1) * request.pageSize;
  const pagedItems = allResults.slice(start, start + request.pageSize);

  const scopedFacets = summarizeMarketplace(facetScope(input.services, request.family));

  return {
    services: pagedItems.map((item) => item.service),
    meta: {
      source: input.source,
      hasRealData: input.hasRealData,
      total,
      page,
      pageSize: request.pageSize,
      totalPages,
      generatedAt: input.generatedAt,
      facets: {
        categories: scopedFacets.categories,
        collections: scopedFacets.collections as Record<MarketplaceCollectionKey, number>,
      },
      search: {
        provider: selected.provider,
        usedAI: selected.usedAI,
        fallbackReason: selected.fallbackReason,
      },
    },
  };
}

export function shouldUseAIOrchestration() {
  return getAISearchConfig().aiEnabled;
}

export function localMarketplaceFallback(services: MarketplaceService[], request: Partial<MarketplaceSearchRequest>) {
  const normalized = normalizeMarketplaceSearchRequest(request);

  return filterMarketplaceServices(services, {
    family: normalized.family,
    category: normalized.serviceType === 'all' ? undefined : (normalized.serviceType as never),
    query: normalized.query || normalized.userIntent,
    collection: normalized.collection,
    sort: normalized.sort,
    destination: normalized.destination,
    budget: normalized.budget,
    travelers: normalized.travelers,
    availability: normalized.availability,
  });
}
