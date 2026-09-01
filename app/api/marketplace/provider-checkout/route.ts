import { NextRequest, NextResponse } from 'next/server';
import { normalizeProviderCheckoutInput, ProviderCheckoutError, resolveProviderCheckout } from '@/lib/marketplace/provider-checkout';
import { consumeProviderRequestBudget } from '@/lib/marketplace/provider-search-protection';
import { resolveMarketplaceRequestContext } from '@/lib/marketplace/request-context';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const input = normalizeProviderCheckoutInput({
      provider: request.nextUrl.searchParams.get('provider'),
      providerItemId: request.nextUrl.searchParams.get('item'),
    });
    const context = await resolveMarketplaceRequestContext(request);
    if (!consumeProviderRequestBudget(`provider-checkout:${context.clientKey}`)) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'private, no-store',
            'Retry-After': '60',
          },
        },
      );
    }

    const target = await resolveProviderCheckout(input);

    logServerEvent('marketplace.provider_checkout.handoff', {
      provider: target.provider,
      providerItemId: target.providerItemId,
      handoffReference: target.handoffReference,
      retrievedAt: target.retrievedAt,
    });

    const response = NextResponse.redirect(target.checkoutUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-DIR3COM-Handoff-Reference', target.handoffReference);
    return response;
  } catch (error) {
    const status = error instanceof ProviderCheckoutError
      ? error.code === 'INVALID_REQUEST' ? 400 : 409
      : 500;

    if (!(error instanceof ProviderCheckoutError)) {
      logServerError('marketplace.provider_checkout.failed', error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof ProviderCheckoutError ? error.code : 'INTERNAL_ERROR',
      },
      { status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
