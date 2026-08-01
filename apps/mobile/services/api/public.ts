import { createApiClient } from '@/services/api/client';
import {
  adaptMarketplaceCategoriesResponse,
  adaptMarketplaceItemDetailResponse,
  adaptMarketplaceItemsResponse,
  type MarketplaceCategoriesResponse,
  type MarketplaceItemDetailResponse,
  type MarketplaceItemsResponse,
} from '@/services/api/contracts';
import { buildMarketplaceItemsQuery, normalizeMarketplaceIdentifier } from '@/lib/marketplace';
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
  input: { category: string; query?: string | null },
  signal?: AbortSignal
): Promise<MobileApiResult<MarketplaceItemsResponse>> {
  const built = buildMarketplaceItemsQuery({
    category: input.category,
    q: input.query,
    page: 1,
    pageSize: 12,
  });

  if (!built) {
    return {
      ok: false,
      error: {
        code: 'http_error',
        message: 'This category is unavailable.',
        status: 400,
      },
    };
  }

  if (built.error || !built.query) {
    return {
      ok: false,
      error: {
        code: 'http_error',
        message: built.error ?? 'This search is unavailable.',
        status: 400,
      },
    };
  }

  const result = await publicApiClient.get<unknown>(`/api/public/marketplace/items?${built.query}`, {
    signal,
  });

  if (!result.ok) {
    return result;
  }

  return adaptMarketplaceItemsResponse(result.data);
}

export async function fetchMarketplaceItemDetail(
  itemSlug: string,
  signal?: AbortSignal
): Promise<MobileApiResult<MarketplaceItemDetailResponse>> {
  const normalizedItemSlug = normalizeMarketplaceIdentifier(itemSlug);

  if (!normalizedItemSlug) {
    return {
      ok: false,
      error: {
        code: 'http_error',
        message: 'This marketplace item is unavailable.',
        status: 400,
      },
    };
  }

  const result = await publicApiClient.get<unknown>(`/api/public/marketplace/items/${encodeURIComponent(normalizedItemSlug)}`, {
    signal,
  });

  if (!result.ok) {
    if (result.error.status === 400 || result.error.status === 404) {
      return {
        ok: false,
        error: {
          ...result.error,
          message: 'This marketplace item is unavailable.',
        },
      };
    }

    return result;
  }

  return adaptMarketplaceItemDetailResponse(result.data);
}
