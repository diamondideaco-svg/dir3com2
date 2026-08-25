/**
 * Travel Provider Integration for Marketplace
 *
 * Connects real Travel Provider results (Duffel, LiteAPI, etc.) into
 * the Marketplace card rendering pipeline.
 *
 * Enforces:
 * - Public production: only PROVIDER_LIVE and PARTNER_VERIFIED
 * - Local preview: PROVIDER_SANDBOX also available
 * - Blocked vendors: always fail-closed (CarTrawler, Viator)
 * - Synthetic: only in test fixtures, never in production
 */

import { searchDuffelFlights } from '@/lib/travel/duffel/search';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import type { FlightSearchResult, StaySearchResult } from '@/lib/travel/contracts';
import {
  mapFlightOffers,
  mapHotelOffers,
  mapCarTrawlerQuotes,
  mapViatorActivities,
  mapVIPServices,
  isPublicSafeMode,
  isLocalPreviewMode,
  type DataSourceMode,
} from '@/lib/marketplace/travel-provider-adapter';
import type { MarketplaceCard } from '@/lib/marketplace/cards';

export type TravelProviderMarketplaceOptions = {
  /**
   * The data source mode: PROVIDER_LIVE, PROVIDER_SANDBOX, PARTNER_VERIFIED, SYNTHETIC_TEST, FALLBACK
   */
  mode: DataSourceMode;

  /**
   * Destination city (e.g., 'Cairo', 'Riyadh')
   */
  destination?: string;

  /**
   * Check-in date for stays (YYYY-MM-DD)
   */
  checkIn?: string;

  /**
   * Check-out date for stays (YYYY-MM-DD)
   */
  checkOut?: string;

  /**
   * Departure city for flights
   */
  departureFrom?: string;

  /**
   * Departure date for flights (YYYY-MM-DD)
   */
  departureDate?: string;

  /**
   * Return date for flights (YYYY-MM-DD)
   */
  returnDate?: string;

  /**
   * Number of adults
   */
  adults?: number;

  /**
   * Number of children
   */
  children?: number;

  /**
   * Guest nationality country code
   */
  guestNationality?: string;

  /**
   * Language preference
   */
  language?: 'ar' | 'en';
};

/**
 * Fetch live flight offers from Duffel for marketplace rendering
 *
 * Only renders if mode is PROVIDER_LIVE or PARTNER_VERIFIED
 */
export async function fetchTravelProviderFlights(
  options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  if (!isPublicSafeMode(options.mode)) {
    return [];
  }

  if (!options.destination || !options.departureDate) {
    return [];
  }

  // Map city names to IATA codes (simplified; should be in a lookup table)
  const cityToIATA: Record<string, string> = {
    'Cairo': 'CAI',
    'Riyadh': 'RUH',
    'Jeddah': 'JED',
    'Dammam': 'DMM',
    'Madinah': 'MED',
    'Alexandria': 'HBE',
    'Hurghada': 'HRG',
    'Sharm El Sheikh': 'SSH',
  };

  const from = options.departureFrom ? cityToIATA[options.departureFrom] : 'RUH'; // Default to Riyadh
  const to = cityToIATA[options.destination];

  if (!to) {
    return [];
  }

  try {
    const result = await searchDuffelFlights({
      from,
      to,
      departureDate: options.departureDate,
      returnDate: options.returnDate,
      adults: options.adults ?? 1,
      cabin: undefined,
    });

    return mapFlightOffers(result, {
      mode: options.mode,
      language: options.language,
    });
  } catch {
    // Provider unavailable or errored—fail-closed
    return [];
  }
}

/**
 * Fetch live hotel offers from LiteAPI for marketplace rendering
 *
 * Only renders if mode is PROVIDER_LIVE or PARTNER_VERIFIED
 */
export async function fetchTravelProviderHotels(
  options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  if (!isPublicSafeMode(options.mode)) {
    return [];
  }

  if (!options.destination || !options.checkIn || !options.checkOut) {
    return [];
  }

  // Map city names to country codes (simplified)
  const cityToCountry: Record<string, string> = {
    'Cairo': 'EG',
    'Alexandria': 'EG',
    'Hurghada': 'EG',
    'Sharm El Sheikh': 'EG',
    'Riyadh': 'SA',
    'Jeddah': 'SA',
    'Dammam': 'SA',
    'Madinah': 'SA',
  };

  const countryCode = cityToCountry[options.destination];

  if (!countryCode) {
    return [];
  }

  try {
    const result = await searchLiteApiHotels({
      cityName: options.destination,
      countryCode,
      checkIn: options.checkIn,
      checkOut: options.checkOut,
      occupancies: [
        {
          adults: options.adults ?? 1,
          childAges:
            options.children && options.children > 0
              ? Array(options.children).fill(8)
              : undefined,
        },
      ],
      currency: 'SAR',
      guestNationality: options.guestNationality ?? countryCode,
      maxRatesPerHotel: 5,
    });

    return mapHotelOffers(result, {
      mode: options.mode,
      language: options.language,
    });
  } catch {
    // Provider unavailable or errored—fail-closed
    return [];
  }
}

/**
 * Fetch drive offers from CarTrawler (currently blocked)
 *
 * Always returns empty array (vendor-access blocked)
 */
export async function fetchTravelProviderDrive(
  _options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  // CarTrawler vendor access blocked
  return [];
}

/**
 * Fetch concierge/activity offers from Viator (currently blocked)
 *
 * Always returns empty array (entitlement blocked)
 */
export async function fetchTravelProviderConcierge(
  _options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  // Viator entitlement blocked
  return [];
}

/**
 * Fetch VIP offers (currently blocked for public)
 *
 * Always returns empty array (synthetic test data only)
 */
export async function fetchTravelProviderVIP(
  _options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  // VIP synthetic test data—never public
  return [];
}

/**
 * Aggregate all travel provider marketplace cards for a destination
 *
 * Returns only public-safe cards based on mode and availability.
 */
export async function fetchAllTravelProviderCards(
  options: TravelProviderMarketplaceOptions,
): Promise<MarketplaceCard[]> {
  const [flights, hotels, _drives, _concierge, _vip] = await Promise.all([
    fetchTravelProviderFlights(options),
    fetchTravelProviderHotels(options),
    fetchTravelProviderDrive(options),
    fetchTravelProviderConcierge(options),
    fetchTravelProviderVIP(options),
  ]);

  return [...flights, ...hotels];
}
