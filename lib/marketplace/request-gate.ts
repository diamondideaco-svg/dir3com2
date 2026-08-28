import { isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';

export type MarketplaceRequestType = 'request_to_confirm' | 'request_quote';

export function requestTypeMatchesProduct(requestType: MarketplaceRequestType, product: Record<string, unknown>) {
  if (!isPublicMarketplaceProduct({
    status: typeof product.status === 'string' ? product.status : null,
    synthetic: typeof product.synthetic === 'boolean' ? product.synthetic : null,
    marketplace_environment: typeof product.marketplace_environment === 'string' ? product.marketplace_environment : null,
    fulfilment_state: typeof product.fulfilment_state === 'string' ? product.fulfilment_state : null,
    deleted_at: typeof product.deleted_at === 'string' ? product.deleted_at : null,
  })) return false;
  if (requestType === 'request_to_confirm') return product.fulfilment_state === 'verified_requestable' && product.transaction_method === requestType;
  return product.fulfilment_state === 'verified_quote' && product.transaction_method === requestType;
}
