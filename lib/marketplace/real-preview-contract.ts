import type { HotelResult, StayRate } from '@/lib/travel/contracts';
import type { TicketmasterDiscoveryEvent } from '@/lib/travel/ticketmaster/discovery';
import { isSafeProviderImageUrl } from '@/lib/marketplace/provider-url-safety';

export const previewFamilies = ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip'] as const;
export type PreviewFamily = (typeof previewFamilies)[number];
export type PreviewCity = 'Riyadh' | 'Cairo';
export type PreviewCitySelection = PreviewCity | 'all';
export type PreviewProviderStatus = 'ok' | 'no_results' | 'access_blocked' | 'unavailable';
export type PreviewEnvironment = 'production' | 'sandbox';

export type PreviewProviderBlocker = {
  expectedEnvVar: string;
  accountProduct: string;
  currentStatus: { ar: string; en: string };
  providerResponse: { ar: string; en: string };
  activationRequired: { ar: string; en: string };
};

export type PreviewSourceTrace = {
  provider: 'liteapi' | 'ticketmaster';
  providerItemId: string;
  sourceUrl: string | null;
  environment: PreviewEnvironment;
  retrievedAt: string;
  transactionMethod: 'none' | 'provider_checkout';
  fulfilmentState: 'availability_unknown' | 'test_sandbox' | 'external_provider' | 'unavailable';
};

export type RealPreviewUnavailableOffer = PreviewSourceTrace & {
  kind: 'unavailable';
  family: 'dir3-stay' | 'dir3-concierge';
  reason: Exclude<PreviewProviderStatus, 'ok'>;
  city: PreviewCity | null;
  checkIn: string | null;
  checkOut: string | null;
};

export type RealPreviewEvent = PreviewSourceTrace & {
  kind: 'event';
  id: string;
  family: 'dir3-concierge';
  provider: 'ticketmaster';
  environment: 'production';
  availability: 'available' | 'sold_out' | 'unavailable' | 'unknown';
  priceState: 'live' | 'not_supplied';
  salesStatus: string;
  title: string;
  imageUrl: string | null;
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  venue: string;
  city: string;
  countryCode: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  providerUrl: string;
};

export type RealPreviewStay = PreviewSourceTrace & {
  kind: 'stay';
  id: string;
  family: 'dir3-stay';
  provider: 'liteapi';
  city: PreviewCity;
  hotelId: string;
  rateId: string;
  availability: 'provider_result';
  priceState: 'live' | 'provider_preview';
  title: string;
  address: string;
  rating: number | null;
  imageUrl: string | null;
  roomName: string;
  boardName: string | null;
  refundable: boolean;
  cancellationDeadline: string | null;
  totalAmount: string;
  currency: string;
  checkIn: string;
  checkOut: string;
};

export type RealPreviewOffer = RealPreviewStay | RealPreviewEvent | RealPreviewUnavailableOffer;

export function formatPreviewRetrievedAt(retrievedAt: string, language: 'ar' | 'en') {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(retrievedAt));
}

export function buildUnavailablePreviewOffer(input: {
  provider: 'liteapi' | 'ticketmaster';
  providerItemId: string;
  environment: PreviewEnvironment;
  reason: RealPreviewUnavailableOffer['reason'];
  city?: PreviewCity;
  checkIn?: string;
  checkOut?: string;
}): RealPreviewUnavailableOffer {
  return {
    kind: 'unavailable',
    family: input.provider === 'liteapi' ? 'dir3-stay' : 'dir3-concierge',
    provider: input.provider,
    providerItemId: input.providerItemId,
    sourceUrl: null,
    environment: input.environment,
    retrievedAt: new Date().toISOString(),
    transactionMethod: 'none',
    fulfilmentState: 'availability_unknown',
    reason: input.reason,
    city: input.city ?? null,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
  };
}

function eventAvailability(salesStatus: string): RealPreviewEvent['availability'] {
  const normalized = salesStatus.trim().toLowerCase();
  if (normalized === 'onsale') return 'available';
  if (normalized === 'soldout' || normalized === 'sold_out') return 'sold_out';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'unavailable';
  return 'unknown';
}

export function normalizeTicketmasterPreviewEvent(
  event: TicketmasterDiscoveryEvent,
  retrievedAt = new Date().toISOString(),
): RealPreviewEvent {
  const availability = eventAvailability(event.salesStatus);
  const transactionMethod = availability === 'available' ? 'provider_checkout' : 'none';
  const fulfilmentState = availability === 'available'
    ? 'external_provider'
    : availability === 'sold_out' || availability === 'unavailable'
      ? 'unavailable'
      : 'availability_unknown';

  return {
    kind: 'event',
    id: event.id,
    family: 'dir3-concierge',
    provider: 'ticketmaster',
    providerItemId: event.id,
    sourceUrl: event.url,
    environment: 'production',
    retrievedAt,
    transactionMethod,
    fulfilmentState,
    availability,
    priceState: event.priceMin !== null && event.currency ? 'live' : 'not_supplied',
    salesStatus: event.salesStatus,
    title: event.name,
    imageUrl: event.imageUrl,
    localDate: event.localDate,
    localTime: event.localTime,
    timezone: event.timezone,
    venue: event.venue,
    city: event.city,
    countryCode: event.countryCode,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    currency: event.currency,
    providerUrl: event.url,
  };
}

function findRate(hotel: HotelResult, rateId?: string): { roomName: string; rate: StayRate } | null {
  for (const room of hotel.rooms ?? []) {
    const rate = rateId
      ? room.rates?.find((candidate) => candidate.id === rateId)
      : room.rates?.[0];
    if (rate) return { roomName: room.name || rate.roomName || 'Room', rate };
  }
  return null;
}

export function normalizeLiteApiPreviewStay(
  hotel: HotelResult,
  context: {
    city: PreviewCity;
    environment: PreviewEnvironment;
    checkIn: string;
    checkOut: string;
    retrievedAt?: string;
    rateId?: string;
  },
): RealPreviewStay | null {
  const selected = findRate(hotel, context.rateId);
  if (!selected || !hotel.id || !hotel.name) return null;
  const { rate } = selected;
  const sandbox = context.environment === 'sandbox';

  return {
    kind: 'stay',
    id: `liteapi:${hotel.id}`,
    family: 'dir3-stay',
    provider: 'liteapi',
    providerItemId: hotel.id,
    sourceUrl: null,
    environment: context.environment,
    retrievedAt: context.retrievedAt ?? new Date().toISOString(),
    transactionMethod: 'none',
    fulfilmentState: sandbox ? 'test_sandbox' : 'availability_unknown',
    city: context.city,
    hotelId: hotel.id,
    rateId: rate.id,
    availability: 'provider_result',
    priceState: sandbox ? 'provider_preview' : 'live',
    title: hotel.name,
    address: hotel.address || context.city,
    rating: hotel.rating ?? null,
    imageUrl: isSafeProviderImageUrl(hotel.imageUrl) ? hotel.imageUrl : null,
    roomName: selected.roomName,
    boardName: rate.boardName || null,
    refundable: rate.refundable,
    cancellationDeadline: rate.cancellationDeadline || null,
    totalAmount: rate.totalAmount,
    currency: rate.currency,
    checkIn: context.checkIn,
    checkOut: context.checkOut,
  };
}
