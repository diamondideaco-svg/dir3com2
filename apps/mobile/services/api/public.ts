import { createApiClient } from '@/services/api/client';
import {
  adaptMarketplaceCategoriesResponse,
  adaptMarketplaceItemsResponse,
  type MarketplaceCategoriesResponse,
  type MarketplaceItemsResponse,
} from '@/services/api/contracts';
import { normalizeMarketplaceIdentifier } from '@/lib/marketplace';
import type { MobileApiResult } from '@/types/result';

const publicApiClient = createApiClient();

export async function fetchMarketplaceCategories(signal?: AbortSignal): Promise<MobileApiResult<MarketplaceCategoriesResponse>> {
  const result = await publicApiClient.get<unknown>('/api/public/marketplace/categories', { signal });

  if (!result.ok) {
    return result;
  }

  return adaptMarketplaceCategoriesResponse(result.data);
}

export async function fetchMarketplaceItems(
  category: string,
  signal?: AbortSignal
): Promise<MobileApiResult<MarketplaceItemsResponse>> {
  const normalizedCategory = normalizeMarketplaceIdentifier(category);

  if (!normalizedCategory) {
    return {
      ok: false,
      error: {
        code: 'http_error',
        message: 'This category is unavailable.',
        status: 400,
      },
    };
  }

  const result = await publicApiClient.get<unknown>(`/api/public/marketplace/items?category=${encodeURIComponent(normalizedCategory)}&page=1&pageSize=12`, {
    signal,
  });

  if (!result.ok) {
    return result;
  }

  return adaptMarketplaceItemsResponse(result.data);
}
