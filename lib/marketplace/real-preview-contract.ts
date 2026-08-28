import type { FlightOffer, FlightOfferDetails, HotelResult } from '@/lib/travel/contracts';
import type { TicketmasterDiscoveryEvent } from '@/lib/travel/ticketmaster/discovery';

export const previewFamilies = ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip'] as const;
export type PreviewFamily = (typeof previewFamilies)[number];

export type RealPreviewFlightOffer = {
  kind: 'flight';
  id: string;
  family: 'dir3-fly';
  provider: 'duffel';
  environment: 'sandbox';
  fulfilmentState: 'test_sandbox';
  transactionMethod: 'none';
  supplierVerified: false;
  availability: 'available';
  origin: string;
  destination: string;
  departureDate?: string;
  expiresAt?: string;
  currency: string;
  totalAmount: string;
  slices: FlightOffer['slices'];
  conditions?: FlightOfferDetails['conditions'];
};

export type RealPreviewEvent = {
  kind: 'event';
  id: string;
  family: 'dir3-concierge';
  provider: 'ticketmaster';
  environment: 'production';
  fulfilmentState: 'external_provider';
  transactionMethod: 'external_redirect';
  supplierVerified: true;
  availability: 'available' | 'unavailable';
  priceState: 'live' | 'check_price';
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

export type RealPreviewStay = {
  kind: 'stay';
  id: string;
  family: 'dir3-stay';
  provider: 'liteapi';
  environment: 'sandbox';
  fulfilmentState: 'test_sandbox';
  transactionMethod: 'none';
  supplierVerified: false;
  availability: 'available';
  title: string;
  address: string;
  rating: number | null;
  imageUrl: string | null;
  roomName: string;
  totalAmount: string;
  currency: string;
};

export type RealPreviewOffer = RealPreviewFlightOffer | RealPreviewStay | RealPreviewEvent;

export function normalizeDuffelPreviewOffer(offer: FlightOffer | FlightOfferDetails): RealPreviewFlightOffer {
  return {
    kind: 'flight',
    id: offer.id,
    family: 'dir3-fly',
    provider: 'duffel',
    environment: 'sandbox',
    fulfilmentState: 'test_sandbox',
    transactionMethod: 'none',
    supplierVerified: false,
    availability: 'available',
    origin: offer.origin,
    destination: offer.destination,
    departureDate: offer.departureDate,
    expiresAt: offer.expiresAt,
    currency: offer.currency,
    totalAmount: offer.totalAmount,
    slices: offer.slices,
    ...('conditions' in offer && offer.conditions ? { conditions: offer.conditions } : {}),
  };
}

export function normalizeTicketmasterPreviewEvent(event: TicketmasterDiscoveryEvent): RealPreviewEvent {
  return {
    kind: 'event',
    id: event.id,
    family: 'dir3-concierge',
    provider: 'ticketmaster',
    environment: 'production',
    fulfilmentState: 'external_provider',
    transactionMethod: 'external_redirect',
    supplierVerified: true,
    availability: event.salesStatus === 'onsale' ? 'available' : 'unavailable',
    priceState: event.priceMin !== null && event.currency ? 'live' : 'check_price',
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

export function normalizeLiteApiPreviewStay(hotel: HotelResult): RealPreviewStay | null {
  const room = hotel.rooms?.find((candidate) => candidate.rates?.length > 0);
  const rate = room?.rates?.[0];
  if (!room || !rate) return null;
  return {
    kind: 'stay',
    id: rate.id,
    family: 'dir3-stay',
    provider: 'liteapi',
    environment: 'sandbox',
    fulfilmentState: 'test_sandbox',
    transactionMethod: 'none',
    supplierVerified: false,
    availability: 'available',
    title: hotel.name || 'Hotel',
    address: hotel.address || '',
    rating: hotel.rating ?? null,
    imageUrl: hotel.imageUrl ?? null,
    roomName: room.name || 'Room',
    totalAmount: rate.totalAmount,
    currency: rate.currency,
  };
}

export function buildPreviewDabraContext(offers: RealPreviewFlightOffer[], stays: RealPreviewStay[], events: RealPreviewEvent[], language: 'ar' | 'en') {
  const names = offers.slice(0, 5).map((offer) => `${offer.origin}-${offer.destination} ${offer.totalAmount} ${offer.currency}`);
  const stayNames = stays.slice(0, 5).map((stay) => `${stay.title} ${stay.totalAmount} ${stay.currency}`);
  const eventNames = events.slice(0, 5).map((event) => `${event.title}${event.city ? ` — ${event.city}` : ''}`);
  return language === 'ar'
    ? `الطيران: بيانات فعلية من بيئة Duffel التجريبية: ${names.join('، ') || 'لا توجد نتائج حالياً'}. الإقامة: بيانات LiteAPI التجريبية: ${stayNames.join('، ') || 'لا توجد نتائج حالياً'}. الكونسيرج: أحداث Ticketmaster الحالية: ${eventNames.join('، ') || 'لا توجد أحداث حالياً'}. Duffel وLiteAPI للمعاينة فقط، وإتمام تذاكر Ticketmaster يتم لدى المزود الخارجي.`
    : `Flights: actual data from Duffel's test environment: ${names.join(', ') || 'no current results'}. Stays: LiteAPI test data: ${stayNames.join(', ') || 'no current results'}. Concierge: current Ticketmaster events: ${eventNames.join(', ') || 'no current events'}. Duffel and LiteAPI are preview-only, while Ticketmaster checkout completes with the external provider.`;
}
