/**
 * Travel Provider to Marketplace Card Adapter
 *
 * Canonical adapter layer that converts normalized Travel Provider results
 * into MarketplaceCard payloads for public rendering.
 *
 * Enforces truth safety:
 * - PROVIDER_LIVE → public rendering
 * - PARTNER_VERIFIED → public rendering
 * - PROVIDER_SANDBOX → local/preview only
 * - SYNTHETIC_TEST → blocked from public
 * - FALLBACK → internal only
 */

import type { FlightSearchResult, StaySearchResult } from '@/lib/travel/contracts';
import type { TicketmasterDiscoveryResult } from '@/lib/travel/ticketmaster/discovery';
import { isAllowedTicketmasterCheckoutUrl } from '@/lib/marketplace/provider-url-safety';
import type { MarketplaceCard, MarketplaceCardInput } from '@/lib/marketplace/cards';
import { normalizeMarketplaceCard } from '@/lib/marketplace/cards';

export type DataSourceMode =
  | 'PROVIDER_LIVE'
  | 'PROVIDER_SANDBOX'
  | 'PARTNER_VERIFIED'
  | 'SYNTHETIC_TEST'
  | 'FALLBACK';

export type TravelProviderCardInput = {
  mode: DataSourceMode;
  language?: 'ar' | 'en';
};

/**
 * FLY mapping: Duffel flight offers → MarketplaceCard[]
 */
export function mapFlightOffers(
  result: FlightSearchResult,
  input: TravelProviderCardInput,
): MarketplaceCard[] {
  // Enforce truth safety: reject non-live/non-verified for public
  if (
    input.mode === 'PROVIDER_SANDBOX' ||
    input.mode === 'SYNTHETIC_TEST' ||
    input.mode === 'FALLBACK'
  ) {
    return [];
  }

  if (result.status !== 'ok' || result.offers.length === 0) {
    return [];
  }

  return result.offers.map((offer) => {
    const departureParts = offer.departureDate?.split('T') ?? [];
    const departureDate = departureParts[0] ?? '';
    const departureTime = departureParts[1]?.substring(0, 5) ?? '';

    const cardInput: MarketplaceCardInput = {
      serviceType: 'fly',
      title: `${offer.origin} → ${offer.destination}`,
      subtitle:
        departureDate && departureTime
          ? `${departureDate} · ${departureTime}`
          : departureDate
            ? departureDate
            : 'Available',
      location: offer.destination,
      provider: offer.provider,
      providerItemId: offer.id,
      retrievedAt: new Date().toISOString(),
      image: null, // Duffel doesn't provide images directly
      priceFrom: Number(offer.totalAmount) || null,
      totalPrice: Number(offer.totalAmount) || null,
      currency: offer.currency || 'SAR',
      availabilityStatus: 'available',
      rating: null,
      category: 'flights',
      deepLink: offer.id
        ? `/flights?offer=${encodeURIComponent(offer.id)}`
        : null,
      capabilityStatus: 'available',
      verified: input.mode === 'PARTNER_VERIFIED',
      synthetic: false,
      providerSandbox: false,
      transactionMethod: 'none',
      fulfilmentState: 'availability_unknown',
      marketplaceEnvironment: 'production',
    };

    const card = normalizeMarketplaceCard(cardInput);
    return card;
  }).filter((card): card is MarketplaceCard => card !== null);
}

/**
 * STAY mapping: LiteAPI hotel results → MarketplaceCard[]
 */
export function mapHotelOffers(
  result: StaySearchResult,
  input: TravelProviderCardInput,
): MarketplaceCard[] {
  // Enforce truth safety
  if (
    input.mode === 'PROVIDER_SANDBOX' ||
    input.mode === 'SYNTHETIC_TEST' ||
    input.mode === 'FALLBACK'
  ) {
    return [];
  }

  if (result.status !== 'ok' || result.hotels.length === 0) {
    return [];
  }

  const cards: MarketplaceCard[] = [];

  for (const hotel of result.hotels) {
    for (const room of hotel.rooms ?? []) {
      const rate = room.rates?.[0];
      if (!rate) continue;

      const cardInput: MarketplaceCardInput = {
        serviceType: 'stay',
        title: hotel.name || 'Hotel',
        subtitle: room.name || 'Standard Room',
        location: hotel.address || 'Hotel Location',
        provider: hotel.provider,
        providerItemId: rate.id,
        retrievedAt: new Date().toISOString(),
        image: hotel.imageUrl || null,
        imageSource: hotel.imageUrl ? 'PROVIDER' : 'DIR3COM_FALLBACK',
        priceFrom: Number(rate.totalAmount) || null,
        totalPrice: Number(rate.totalAmount) || null,
        currency: rate.currency || 'SAR',
        availabilityStatus: 'available',
        rating: hotel.rating || null,
        category: 'hotels',
        deepLink: rate.id
          ? `/hotels?rate=${encodeURIComponent(rate.id)}`
          : null,
        capabilityStatus: 'available',
        verified: input.mode === 'PARTNER_VERIFIED',
        synthetic: false,
        providerSandbox: false,
        transactionMethod: 'none',
        fulfilmentState: 'availability_unknown',
        marketplaceEnvironment: 'production',
      };

      const card = normalizeMarketplaceCard(cardInput);
      if (card) {
        cards.push(card);
      }
    }
  }

  return cards;
}

/** CONCIERGE mapping: official Ticketmaster Discovery results → MarketplaceCard[]. */
export function mapTicketmasterEvents(
  result: TicketmasterDiscoveryResult,
  input: TravelProviderCardInput & { retrievedAt?: string },
): MarketplaceCard[] {
  if (input.mode !== 'PROVIDER_LIVE' || result.status !== 'ok') return [];

  const retrievedAt = input.retrievedAt ?? new Date().toISOString();

  return result.events
    .filter((event) => isAllowedTicketmasterCheckoutUrl(event.url))
    .map((event) => {
      const status = event.salesStatus.trim().toLowerCase();
      const available = status === 'onsale';
      const soldOut = status === 'soldout';
      return normalizeMarketplaceCard({
        serviceType: 'concierge',
        title: event.name,
        subtitle: [event.localDate, event.localTime, event.venue].filter(Boolean).join(' · ') || 'Event details',
        location: event.city || event.countryCode || 'Saudi Arabia',
        provider: result.provider,
        providerItemId: event.id,
        sourceUrl: event.url,
        retrievedAt,
        image: event.imageUrl,
        imageSource: event.imageUrl ? 'PROVIDER' : 'DIR3COM_FALLBACK',
        priceFrom: event.priceMin,
        totalPrice: event.priceMin,
        currency: event.currency ?? 'SAR',
        availabilityStatus: soldOut ? 'sold-out' : available ? 'available' : 'limited',
        rating: null,
        category: 'experiences',
        deepLink: `/marketplace/preview/${encodeURIComponent(event.id)}`,
        capabilityStatus: available ? 'available' : soldOut ? 'blocked' : 'pending',
        verified: false,
        synthetic: false,
        providerSandbox: false,
        transactionMethod: available ? 'provider_checkout' : 'none',
        fulfilmentState: available ? 'external_provider' : soldOut ? 'unavailable' : 'availability_unknown',
        marketplaceEnvironment: 'production',
      });
    })
    .filter((card): card is MarketplaceCard => card !== null);
}

/**
 * DRIVE mapping: CarTrawler quote results → MarketplaceCard[]
 *
 * Currently vendor-blocked from public rendering.
 */
export function mapCarTrawlerQuotes(
  result: unknown,
  input: TravelProviderCardInput,
): MarketplaceCard[] {
  void result;
  void input;
  // CarTrawler currently vendor-blocked
  // Return empty array for all modes (fail-closed)
  return [];
}

/**
 * CONCIERGE mapping: Viator activities → MarketplaceCard[]
 *
 * Currently entitlement-blocked from public rendering.
 */
export function mapViatorActivities(
  result: unknown,
  input: TravelProviderCardInput,
): MarketplaceCard[] {
  void result;
  void input;
  // Viator currently entitlement-blocked
  // Return empty array for all modes (fail-closed)
  return [];
}

/**
 * VIP mapping: Local partner data → MarketplaceCard[]
 *
 * Synthetic/test-only data never rendered publicly.
 */
export function mapVIPServices(
  _result: unknown,
  _input: TravelProviderCardInput,
): MarketplaceCard[] {
  // VIP synthetic test data is test-only
  // Rejected for public rendering
  if (_input.mode !== 'SYNTHETIC_TEST') {
    return [];
  }

  // Even in SYNTHETIC_TEST, we don't actually render—
  // this is a fail-closed guard. Return empty.
  return [];
}

/**
 * Public-safe adapter selector
 *
 * Determines which sources are safe for public rendering
 */
export function isPublicSafeMode(mode: DataSourceMode): boolean {
  return mode === 'PROVIDER_LIVE' || mode === 'PARTNER_VERIFIED';
}

/**
 * Local preview/sandbox mode selector
 *
 * Determines which sources are safe for local/staging rendering
 */
export function isLocalPreviewMode(mode: DataSourceMode): boolean {
  return (
    mode === 'PROVIDER_LIVE' ||
    mode === 'PROVIDER_SANDBOX' ||
    mode === 'PARTNER_VERIFIED'
  );
}
