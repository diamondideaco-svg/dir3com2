import type { MarketplaceCard } from './cards';
import { mapFlightOffers, mapHotelOffers, mapSabreItineraries } from './travel-provider-adapter';
import { searchDuffelFlights } from '@/lib/travel/duffel/search';
import { getDuffelFlightOffer } from '@/lib/travel/duffel/flights';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import { TravelProviderError } from '@/lib/travel/errors';
import { SabreAuthError } from '@/lib/sabre/auth';
import { SabreProviderError } from '@/lib/sabre/client';
import { searchSabreFlights } from '@/lib/sabre/search';
import {
  isProviderProofEnabled,
  proofEnvironmentAllowed,
  providerEnvironmentAllowed,
  providerProofMode,
  providerProofProviders,
  type ProviderProofEnvironment,
  type ProviderProofProvider,
} from './provider-proof-mode';
import { PROVIDER_CITY_TO_COUNTRY, PROVIDER_CITY_TO_IATA } from './travel-provider-integration';

export type ProviderProofSearchInput = {
  environment: ProviderProofEnvironment;
  destination: string;
  departureFrom?: string;
  departureDate?: string;
  returnDate?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  language?: 'ar' | 'en';
  providers?: ProviderProofProvider[];
};

export type ProviderProofStatus = 'ok' | 'no_results' | 'access_blocked' | 'unavailable';

export type ProviderProofResult = {
  provider: ProviderProofProvider;
  environment: ProviderProofEnvironment;
  status: ProviderProofStatus;
  retrievedAt: string;
  cards: MarketplaceCard[];
  errorCode?: string;
};

export type ProviderProofDependencies = {
  searchFlights: typeof searchDuffelFlights;
  searchHotels: typeof searchLiteApiHotels;
  searchSabreFlights?: typeof searchSabreFlights;
};

const defaultDependencies: ProviderProofDependencies = {
  searchFlights: searchDuffelFlights,
  searchHotels: searchLiteApiHotels,
};

function statusFromError(error: unknown): ProviderProofStatus {
  if (error instanceof TravelProviderError && error.code === 'UNAUTHORIZED_VENDOR_ACCESS') return 'access_blocked';
  if (error instanceof SabreAuthError || (error instanceof SabreProviderError && (error.status === 401 || error.status === 403))) return 'access_blocked';
  return 'unavailable';
}

function errorCodeFromError(error: unknown): string {
  if (error instanceof TravelProviderError) return error.code;
  if (error instanceof SabreAuthError) return 'PROVIDER_ACCESS_BLOCKED';
  if (error instanceof SabreProviderError && (error.status === 401 || error.status === 403)) return 'PROVIDER_ACCESS_BLOCKED';
  return 'PROVIDER_UNAVAILABLE';
}

function statusFromProvider(status: 'ok' | 'no_results' | 'blocked' | 'unavailable'): ProviderProofStatus {
  return status === 'blocked' ? 'access_blocked' : status;
}

function uniqueProviders(input: ProviderProofProvider[] | undefined, env: NodeJS.ProcessEnv): ProviderProofProvider[] {
  const allowlist = providerProofProviders(env);
  const requested = input?.length ? input : allowlist;
  return [...new Set(requested)].filter((provider) => allowlist.includes(provider));
}

export async function runProviderProofSearch(
  input: ProviderProofSearchInput,
  dependencies: ProviderProofDependencies = defaultDependencies,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderProofResult[]> {
  if (!isProviderProofEnabled(env)) return [];

  const mode = providerProofMode(input.environment);
  const retrievedAt = new Date().toISOString();
  const providers = uniqueProviders(input.providers, env);
  const results: ProviderProofResult[] = [];

  if (providers.includes('sabre')) {
    if (!providerEnvironmentAllowed('sabre', input.environment, env)) {
      results.push({ provider: 'sabre', environment: input.environment, status: 'access_blocked', retrievedAt, cards: [], errorCode: 'ENVIRONMENT_NOT_CONFIGURED' });
    } else {
      const to = PROVIDER_CITY_TO_IATA[input.destination];
      const from = input.departureFrom ? PROVIDER_CITY_TO_IATA[input.departureFrom] : 'RUH';
      if (!to || !from || !input.departureDate) {
        results.push({ provider: 'sabre', environment: input.environment, status: 'no_results', retrievedAt, cards: [], errorCode: 'MISSING_FLIGHT_CRITERIA' });
      } else {
        try {
          const response = await (dependencies.searchSabreFlights ?? searchSabreFlights)({
            origin: from,
            destination: to,
            departureDate: input.departureDate,
            adults: input.adults ?? 1,
          });
          results.push({
            provider: 'sabre',
            environment: input.environment,
            status: response.itineraries.length ? 'ok' : 'no_results',
            retrievedAt,
            cards: mapSabreItineraries(response, { mode, language: input.language, proofMode: true, retrievedAt }).slice(0, 20),
          });
        } catch (error) {
          results.push({ provider: 'sabre', environment: input.environment, status: statusFromError(error), retrievedAt, cards: [], errorCode: errorCodeFromError(error) });
        }
      }
    }
  }

  if (providers.includes('duffel')) {
    if (!providerEnvironmentAllowed('duffel', input.environment, env)) {
      results.push({ provider: 'duffel', environment: input.environment, status: 'access_blocked', retrievedAt, cards: [], errorCode: 'ENVIRONMENT_NOT_CONFIGURED' });
    } else {
    const to = PROVIDER_CITY_TO_IATA[input.destination];
    const from = input.departureFrom ? PROVIDER_CITY_TO_IATA[input.departureFrom] : 'RUH';
    if (!to || !input.departureDate) {
      results.push({ provider: 'duffel', environment: input.environment, status: 'no_results', retrievedAt, cards: [], errorCode: 'MISSING_FLIGHT_CRITERIA' });
    } else {
      try {
        const response = await dependencies.searchFlights({
          from,
          to,
          departureDate: input.departureDate,
          returnDate: input.returnDate,
          adults: input.adults ?? 1,
          cabin: undefined,
        });
        results.push({
          provider: 'duffel', environment: input.environment, status: statusFromProvider(response.status), retrievedAt,
          cards: mapFlightOffers(response, { mode, language: input.language, proofMode: true }).slice(0, 20),
          errorCode: response.error?.code,
        });
      } catch (error) {
        results.push({ provider: 'duffel', environment: input.environment, status: statusFromError(error), retrievedAt, cards: [], errorCode: error instanceof TravelProviderError ? error.code : 'PROVIDER_UNAVAILABLE' });
      }
    }
    }
  }

  if (providers.includes('liteapi')) {
    if (!providerEnvironmentAllowed('liteapi', input.environment, env)) {
      results.push({ provider: 'liteapi', environment: input.environment, status: 'access_blocked', retrievedAt, cards: [], errorCode: 'ENVIRONMENT_NOT_CONFIGURED' });
    } else {
    const countryCode = PROVIDER_CITY_TO_COUNTRY[input.destination];
    if (!countryCode || !input.checkIn || !input.checkOut) {
      results.push({ provider: 'liteapi', environment: input.environment, status: 'no_results', retrievedAt, cards: [], errorCode: 'MISSING_STAY_CRITERIA' });
    } else if ((input.children ?? 0) > 0) {
      // Child ages are required by LiteAPI; never invent an age from a count.
      results.push({ provider: 'liteapi', environment: input.environment, status: 'no_results', retrievedAt, cards: [], errorCode: 'CHILD_AGES_REQUIRED' });
    } else {
      try {
        const response = await dependencies.searchHotels({
          cityName: input.destination,
          countryCode,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          occupancies: [{ adults: input.adults ?? 1 }],
          currency: 'SAR',
          guestNationality: countryCode,
          maxRatesPerHotel: 5,
        });
        results.push({
          provider: 'liteapi', environment: input.environment, status: statusFromProvider(response.status), retrievedAt,
          cards: mapHotelOffers(response, { mode, language: input.language, proofMode: true }).slice(0, 20),
          errorCode: response.error?.code,
        });
      } catch (error) {
        results.push({ provider: 'liteapi', environment: input.environment, status: statusFromError(error), retrievedAt, cards: [], errorCode: error instanceof TravelProviderError ? error.code : 'PROVIDER_UNAVAILABLE' });
      }
    }
    }
  }

  return results;
}

export async function getProviderProofFlightOffer(id: string) {
  if (!isProviderProofEnabled() || (!proofEnvironmentAllowed('sandbox') && !proofEnvironmentAllowed('live'))) return null;
  try {
    return await getDuffelFlightOffer(id);
  } catch {
    return null;
  }
}

export async function getProviderProofOffer(input: ProviderProofSearchInput & {
  provider: ProviderProofProvider;
  providerItemId: string;
  hotelId?: string;
}) {
  if (!isProviderProofEnabled()
    || !providerProofProviders().includes(input.provider)
    || !providerEnvironmentAllowed(input.provider, input.environment)) return null;
  const mode = providerProofMode(input.environment);
  if (input.provider === 'duffel') {
    try {
      const offer = await getDuffelFlightOffer(input.providerItemId);
      const cards = mapFlightOffers({ provider: 'duffel', status: 'ok', offers: [offer] }, { mode, language: input.language, proofMode: true });
      return cards[0] ?? null;
    } catch {
      return null;
    }
  }
  if (input.provider === 'sabre') {
    if (input.environment !== 'sandbox' || !input.departureDate) return null;
    const destination = PROVIDER_CITY_TO_IATA[input.destination];
    const origin = input.departureFrom ? PROVIDER_CITY_TO_IATA[input.departureFrom] : 'RUH';
    if (!origin || !destination) return null;
    try {
      const response = await searchSabreFlights({ origin, destination, departureDate: input.departureDate, adults: input.adults ?? 1 });
      const cards = mapSabreItineraries(response, { mode, language: input.language, proofMode: true });
      return cards.find((card) => card.providerItemId === input.providerItemId) ?? null;
    } catch {
      return null;
    }
  }
  if (!input.hotelId || !input.checkIn || !input.checkOut) return null;
  const countryCode = PROVIDER_CITY_TO_COUNTRY[input.destination];
  if (!countryCode) return null;
  try {
    const response = await searchLiteApiHotels({
      hotelIds: [input.hotelId],
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      occupancies: [{ adults: input.adults ?? 1 }],
      currency: 'SAR',
      guestNationality: countryCode,
      maxRatesPerHotel: 5,
    });
    const cards = mapHotelOffers(response, { mode, language: input.language, proofMode: true });
    // LiteAPI rate/offer IDs are session-scoped and may rotate between the
    // list request and this detail revalidation. The request is still pinned
    // to the selected hotel ID, so use the latest provider-returned rate for
    // that hotel when the original rate ID is no longer present.
    return cards.find((card) => card.providerItemId === input.providerItemId) ?? cards[0] ?? null;
  } catch {
    return null;
  }
}
