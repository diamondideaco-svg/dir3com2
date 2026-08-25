/**
 * Local Preview API Route
 * 
 * /api/local-preview/marketplace
 * 
 * Development-only endpoint for visualizing provider data in sandbox mode.
 * Never served to production public endpoints.
 */

import { NextResponse } from 'next/server';
import {
  isLocalPreviewRequest,
  fetchLocalPreviewProviderCards,
} from '@/lib/marketplace/local-preview-mode';
import type { TravelProviderMarketplaceOptions } from '@/lib/marketplace/travel-provider-integration';

export async function GET(request: Request) {
  // Strict: only allow from local environments
  if (!isLocalPreviewRequest(request)) {
    return NextResponse.json(
      { error: 'Local preview only accessible from localhost' },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);

    const mode = (url.searchParams.get('mode') ?? 'PROVIDER_LIVE') as TravelProviderMarketplaceOptions['mode'];
    const destination = url.searchParams.get('destination') ?? undefined;
    const checkIn = url.searchParams.get('checkIn') ?? undefined;
    const checkOut = url.searchParams.get('checkOut') ?? undefined;
    const departureFrom = url.searchParams.get('departureFrom') ?? undefined;
    const departureDate = url.searchParams.get('departureDate') ?? undefined;
    const returnDate = url.searchParams.get('returnDate') ?? undefined;
    const adults = url.searchParams.get('adults')
      ? Number(url.searchParams.get('adults'))
      : undefined;
    const children = url.searchParams.get('children')
      ? Number(url.searchParams.get('children'))
      : undefined;
    const language = (url.searchParams.get('language') ?? 'en') as 'ar' | 'en';

    const cards = await fetchLocalPreviewProviderCards({
      mode,
      destination,
      checkIn,
      checkOut,
      departureFrom,
      departureDate,
      returnDate,
      adults,
      children,
      language,
    });

    return NextResponse.json({
      cards,
      mode,
      destination,
      count: cards.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error fetching preview marketplace cards';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
