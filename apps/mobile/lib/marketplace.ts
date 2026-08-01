const MARKETPLACE_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_MARKETPLACE_SEARCH_LENGTH = 2;
const MAX_MARKETPLACE_SEARCH_LENGTH = 80;

export type MarketplaceItemsQueryInput = {
  category: string;
  page?: number;
  pageSize?: number;
  q?: string | null;
};

export function normalizeMarketplaceIdentifier(value: string | null | undefined) {
  const normalized = decodeURIComponent((value ?? '').trim()).toLowerCase();

  if (!normalized || normalized.length > 120 || !MARKETPLACE_IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizePublicImageUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeMarketplaceSearchQuery(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return { value: null as string | null, error: null as string | null };
  }

  const compacted = value.trim().replace(/\s+/g, ' ');
  if (!compacted) {
    return { value: null as string | null, error: null as string | null };
  }

  if (compacted.length < MIN_MARKETPLACE_SEARCH_LENGTH || compacted.length > MAX_MARKETPLACE_SEARCH_LENGTH) {
    return { value: null as string | null, error: 'Search must be between 2 and 80 characters.' };
  }

  const sanitized = compacted.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  if (sanitized.length < MIN_MARKETPLACE_SEARCH_LENGTH) {
    return { value: null as string | null, error: 'Search contains unsupported characters.' };
  }

  return { value: sanitized, error: null as string | null };
}

export function buildMarketplaceItemsQuery(input: MarketplaceItemsQueryInput) {
  const category = normalizeMarketplaceIdentifier(input.category);
  if (!category) {
    return null;
  }

  const search = normalizeMarketplaceSearchQuery(input.q);
  if (search.error) {
    return { error: search.error, query: null as string | null };
  }

  const page = typeof input.page === 'number' && Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
  const pageSize = typeof input.pageSize === 'number' && Number.isInteger(input.pageSize) && input.pageSize > 0 ? Math.min(input.pageSize, 30) : 12;

  const params = new URLSearchParams();
  params.set('category', category);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  if (search.value) {
    params.set('q', search.value);
  }

  return { error: null as string | null, query: params.toString() };
}
