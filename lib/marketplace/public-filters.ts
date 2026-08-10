const PUBLISHED_STATUSES = ['published', 'active', 'featured'] as const;

export function applyPublicServiceFilters<T>(query: T): T {
  return (query as { eq: (column: string, value: unknown) => unknown }).eq('synthetic', false) as T;
}

export function applyPublicProductFilters<T>(query: T): T {
  const chained = (query as { in: (column: string, values: readonly string[]) => unknown })
    .in('status', PUBLISHED_STATUSES) as { eq: (column: string, value: unknown) => unknown };
  return chained.eq('synthetic', false) as T;
}

export function applyPublicCategoryFilters<T>(query: T): T {
  return (query as { eq: (column: string, value: unknown) => unknown }).eq('synthetic', false) as T;
}

export function applyPublicAssetSyntheticFilter<T>(query: T): T {
  return (query as { eq: (column: string, value: unknown) => unknown }).eq('synthetic', false) as T;
}

export function isPublicMarketplaceProduct(input: { status: string | null | undefined; synthetic: boolean | null | undefined }) {
  const status = String(input.status || '').toLowerCase();
  return PUBLISHED_STATUSES.includes(status as (typeof PUBLISHED_STATUSES)[number]) && input.synthetic === false;
}
