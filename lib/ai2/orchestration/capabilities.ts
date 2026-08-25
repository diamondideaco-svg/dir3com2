import { searchDuffelFlights } from '@/lib/travel/duffel/search';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import { validateTravelerCounts } from '@/lib/travel/traveler-counts';
import { sanitizeProviderError, sanitizeUntrustedText } from './security';
import type { CapabilitySearchResult, NormalizedTravelOption, TravelCapability, TravelCapabilityAdapter } from './types';

const IATA: Record<string, string> = { Cairo: 'CAI', Riyadh: 'RUH', Jeddah: 'JED', Dammam: 'DMM', Madinah: 'MED', Alexandria: 'HBE', Hurghada: 'HRG', 'Sharm El Sheikh': 'SSH' };
const COUNTRY: Record<string, string> = { Cairo: 'EG', Alexandria: 'EG', Hurghada: 'EG', 'Sharm El Sheikh': 'EG', Riyadh: 'SA', Jeddah: 'SA', Dammam: 'SA', Madinah: 'SA', Makkah: 'SA' };

function blocked(capability: TravelCapability, reason: CapabilitySearchResult['blockedReason'], language: 'ar' | 'en'): CapabilitySearchResult {
  const ar = reason === 'test_data_only' ? 'بيانات هذه الخدمة تجريبية فقط ولا يمكن عرضها كمخزون فعلي.' : 'البحث المباشر لهذه الخدمة غير متاح حاليًا.';
  const en = reason === 'test_data_only' ? 'This service has test-only data and cannot be shown as live inventory.' : 'Live supplier search for this service is temporarily unavailable.';
  return { capability, status: 'blocked', options: [], blockedReason: reason, userMessage: language === 'ar' ? ar : en };
}

export function createBlockedCapabilityAdapter(capability: TravelCapability, reason: NonNullable<CapabilitySearchResult['blockedReason']>): TravelCapabilityAdapter {
  return { capability, async search(context) { return blocked(capability, reason, context.intent.language); } };
}

function flightOption(offer: Awaited<ReturnType<typeof searchDuffelFlights>>['offers'][number]): NormalizedTravelOption {
  const segments = offer.slices.reduce((sum, slice) => sum + slice.segments, 0);
  return {
    id: `fly:${offer.id}`,
    capability: 'fly',
    title: `${sanitizeUntrustedText(offer.origin, 8)} → ${sanitizeUntrustedText(offer.destination, 8)}`,
    currency: offer.currency,
    amount: offer.totalAmount,
    evidence: [`${segments} segment${segments === 1 ? '' : 's'}`, offer.departureDate ? `Departure ${offer.departureDate}` : ''].filter(Boolean),
    providerReference: offer.id,
    expiresAt: offer.expiresAt,
    metadata: { segments, refundable: false },
  };
}

export function createDuffelCapabilityAdapter(): TravelCapabilityAdapter {
  return {
    capability: 'fly',
    async search(context) {
      const segment = context.plan.segments[0];
      const from = segment?.origin ? IATA[segment.origin] ?? segment.origin : undefined;
      const to = segment?.destination ? IATA[segment.destination] ?? segment.destination : undefined;
      if (!process.env.DUFFEL_TEST_TOKEN || !from || !to || !segment?.startDate) return blocked('fly', process.env.DUFFEL_TEST_TOKEN ? 'provider_unavailable' : 'vendor_access', context.intent.language);
      try {
        const travelers = validateTravelerCounts(context.plan.travelers.adults, context.plan.travelers.children);
        const result = await searchDuffelFlights({ from, to, departureDate: segment.startDate, returnDate: segment.endDate, adults: travelers.adults, cabin: context.intent.preferences.cabin });
        return { capability: 'fly', status: result.status === 'ok' ? 'available' : result.status, options: result.offers.map(flightOption), blockedReason: result.status === 'blocked' ? 'vendor_access' : undefined, userMessage: result.error ? sanitizeProviderError(result.error, context.intent.language) : undefined };
      } catch (error) {
        return { capability: 'fly', status: 'unavailable', options: [], blockedReason: 'provider_unavailable', userMessage: sanitizeProviderError(error, context.intent.language) };
      }
    },
  };
}

export function createLiteApiCapabilityAdapter(): TravelCapabilityAdapter {
  return {
    capability: 'stay',
    async search(context) {
      const destination = context.plan.destination;
      const segment = context.plan.segments[0];
      if (!process.env.LITEAPI_TEST_API_KEY || !destination || !segment?.startDate || !segment.endDate) return blocked('stay', process.env.LITEAPI_TEST_API_KEY ? 'provider_unavailable' : 'vendor_access', context.intent.language);
      try {
        const travelers = validateTravelerCounts(context.plan.travelers.adults, context.plan.travelers.children);
        const childAges = travelers.children > 0 ? Array(travelers.children).fill(8) : undefined;
        const result = await searchLiteApiHotels({ cityName: destination, countryCode: COUNTRY[destination], checkIn: segment.startDate, checkOut: segment.endDate, occupancies: [{ adults: travelers.adults, childAges }], currency: context.plan.budget?.currency ?? 'USD', guestNationality: COUNTRY[destination] ?? 'SA', maxRatesPerHotel: 5 });
        const options: NormalizedTravelOption[] = result.hotels.flatMap((hotel) => hotel.rooms.flatMap((room) => room.rates.slice(0, 1).map((rate) => ({ id: `stay:${rate.id}:${room.id}`, capability: 'stay' as const, title: sanitizeUntrustedText(`${hotel.name ?? 'Hotel'} — ${room.name}`), currency: rate.currency, amount: rate.totalAmount, refundable: rate.refundable, evidence: [rate.boardName, rate.refundable ? 'Refundable' : 'Non-refundable'].filter(Boolean) as string[], providerReference: rate.id, metadata: { hotelId: hotel.id, rating: hotel.rating } }))));
        return { capability: 'stay', status: options.length ? 'available' : 'no_results', options };
      } catch (error) {
        return { capability: 'stay', status: 'unavailable', options: [], blockedReason: 'provider_unavailable', userMessage: sanitizeProviderError(error, context.intent.language) };
      }
    },
  };
}

export function createDefaultCapabilityAdapters(): TravelCapabilityAdapter[] {
  return [
    createDuffelCapabilityAdapter(),
    createLiteApiCapabilityAdapter(),
    createBlockedCapabilityAdapter('drive', 'vendor_access'),
    createBlockedCapabilityAdapter('concierge', 'entitlement'),
    createBlockedCapabilityAdapter('vip', 'test_data_only'),
  ];
}
