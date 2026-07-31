import { filterMarketplaceServices } from '@/lib/marketplace/data';
import type {
  AIProviderId,
  AIProviderSearchContext,
  AIProviderSearchResponse,
  MarketplaceSearchResultItem,
} from '@/lib/ai/types';

function scoreBySignals(index: number, baseLength: number, service: AIProviderSearchContext['services'][number]) {
  const rankSignal = Math.max(0, baseLength - index) / Math.max(1, baseLength);
  const featuredSignal = service.featured ? 0.18 : 0;
  const popularSignal = service.popular ? 0.14 : 0;
  const recommendedSignal = service.recommended ? 0.22 : 0;

  return Number((rankSignal + featuredSignal + popularSignal + recommendedSignal).toFixed(4));
}

function buildRationale(service: AIProviderSearchContext['services'][number], request: AIProviderSearchContext['request']) {
  const tags = service.tags.slice(0, 2).join(' + ');
  const destinationHint = request.destination !== 'all' ? `وجهة ${request.destination}` : 'وجهة مرنة';

  return `${service.categoryLabel} | ${destinationHint}${tags ? ` | ${tags}` : ''}`;
}

export function buildScoredItems(context: AIProviderSearchContext) {
  const normalizedCategory = context.request.serviceType === 'all' ? undefined : context.request.serviceType;

  const filteredServices = filterMarketplaceServices(context.services, {
    family: context.request.family,
    category: normalizedCategory as never,
    query: context.request.query || context.request.userIntent,
    collection: context.request.collection,
    sort: context.request.sort,
    destination: context.request.destination,
    budget: context.request.budget,
    travelers: context.request.travelers,
    availability: context.request.availability,
  });

  const scoredItems: MarketplaceSearchResultItem[] = filteredServices.map((service, index) => ({
    service,
    score: scoreBySignals(index, filteredServices.length, service),
    rationale: buildRationale(service, context.request),
  }));

  return {
    scoredItems,
    total: filteredServices.length,
  };
}

export function createMockProviderResponse(
  provider: AIProviderId,
  context: AIProviderSearchContext,
  fallbackReason?: string
): AIProviderSearchResponse {
  const ranked = buildScoredItems(context);

  return {
    provider,
    items: ranked.scoredItems,
    usedAI: provider !== 'local',
    fallbackReason,
  };
}
