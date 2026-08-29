export type MarketplaceRequestIntent = 'request_to_confirm' | 'request_quote';

export function buildMarketplaceRequestReturnPath(input: {
  slug: string;
  productId: string;
  family: string;
  intent: MarketplaceRequestIntent;
}) {
  const params = new URLSearchParams({
    intent: input.intent,
    product: input.productId,
    family: input.family,
  });

  return `/services/${encodeURIComponent(input.slug)}?${params.toString()}`;
}

export function buildMarketplaceLoginHandoff(returnPath: string) {
  const encoded = encodeURIComponent(returnPath);
  return `/login?redirect=${encoded}&next=${encoded}`;
}
