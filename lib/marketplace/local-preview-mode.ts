/**
 * Local Preview Mode Handler
 * 
 * Safely renders provider data in local/development contexts:
 * - PROVIDER_SANDBOX: local development visualization
 * - PROVIDER_LIVE + PROVIDER_SANDBOX: side-by-side comparison
 * 
 * Prevents sandbox data from leaking to production.
 * Never serves to public production endpoints.
 */

import { fetchAllTravelProviderCards } from '@/lib/marketplace/travel-provider-integration';
import type { MarketplaceCard } from '@/lib/marketplace/cards';
import type { TravelProviderMarketplaceOptions } from '@/lib/marketplace/travel-provider-integration';

/**
 * Check if this request is from a legitimate local/preview environment
 */
export function isLocalPreviewRequest(request: Request): boolean {
  const url = new URL(request.url);

  // Only allow from localhost/127.0.0.1
  const hostname = url.hostname;
  if (
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    !hostname.endsWith('.local') &&
    process.env.NODE_ENV !== 'development'
  ) {
    return false;
  }

  // Require explicit preview flag
  const preview = url.searchParams.get('preview');
  if (preview !== 'sandbox' && preview !== 'local') {
    return false;
  }

  return true;
}

/**
 * Fetch provider cards for local preview rendering
 * 
 * This is NEVER called from production public routes.
 * Only from /local-preview or similar development endpoints.
 */
export async function fetchLocalPreviewProviderCards(
  options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  // Only allow sandbox or live modes in preview
  if (
    options.mode !== 'PROVIDER_SANDBOX' &&
    options.mode !== 'PROVIDER_LIVE' &&
    options.mode !== 'PARTNER_VERIFIED'
  ) {
    return [];
  }

  try {
    return await fetchAllTravelProviderCards(options);
  } catch {
    return [];
  }
}

/**
 * Get provider data quality information for preview context
 */
export function getPreviewDataQualityLabel(mode: string): string {
  switch (mode) {
    case 'PROVIDER_LIVE':
      return '🟢 Live Production Data';
    case 'PROVIDER_SANDBOX':
      return '🟡 Sandbox Test Data (Local Only)';
    case 'PARTNER_VERIFIED':
      return '🟢 Partner Verified Data';
    case 'SYNTHETIC_TEST':
      return '🔴 Synthetic Test (Blocked from Public)';
    case 'FALLBACK':
      return '⚪ Fallback Placeholder (Internal Only)';
    default:
      return '❓ Unknown Mode';
  }
}
