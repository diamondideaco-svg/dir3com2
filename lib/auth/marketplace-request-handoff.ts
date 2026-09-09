import { withSearchContext, type SearchContext } from '../marketplace/search-context';

export type MarketplaceRequestIntent = 'request_to_confirm' | 'request_quote';

export function buildMarketplaceRequestReturnPath(input: {
  slug: string;
  productId: string;
  family: string;
  intent: MarketplaceRequestIntent;
  searchContext?: SearchContext;
}) {
  const params = new URLSearchParams({
    intent: input.intent,
    product: input.productId,
    family: input.family,
  });

  return withSearchContext(`/services/${encodeURIComponent(input.slug)}?${params.toString()}`, input.searchContext ?? {});
}

export function buildMarketplaceLoginHandoff(returnPath: string) {
  const encoded = encodeURIComponent(returnPath);
  return `/login?redirect=${encoded}&next=${encoded}`;
}
