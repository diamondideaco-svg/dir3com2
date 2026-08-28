import { isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';
import { sanitizeText } from '@/lib/security/validation';

export function isProductBookable(product: Record<string, unknown>) {
  if (!isPublicMarketplaceProduct({
    status: sanitizeText(product.status, '').toLowerCase(),
    synthetic: typeof product.synthetic === 'boolean' ? product.synthetic : null,
    marketplace_environment: typeof product.marketplace_environment === 'string' ? product.marketplace_environment : null,
    fulfilment_state: typeof product.fulfilment_state === 'string' ? product.fulfilment_state : null,
    deleted_at: typeof product.deleted_at === 'string' ? product.deleted_at : null,
  })) return false;
  return product.fulfilment_state === 'live_bookable' && product.transaction_method === 'instant_booking';
}
