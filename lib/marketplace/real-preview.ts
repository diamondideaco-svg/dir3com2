import 'server-only';

import { notFound } from 'next/navigation';
import { searchDuffelFlights } from '@/lib/travel/duffel/search';
import { getDuffelFlightOffer } from '@/lib/travel/duffel/flights';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import { getTicketmasterEvent, searchTicketmasterEvents } from '@/lib/travel/ticketmaster/discovery';
import {
  buildPreviewDabraContext,
  normalizeDuffelPreviewOffer,
  normalizeLiteApiPreviewStay,
  normalizeTicketmasterPreviewEvent,
} from '@/lib/marketplace/real-preview-contract';

const IATA_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRealMarketplacePreviewEnabled() {
  return process.env.VERCEL_ENV === 'preview'
    || (process.env.NODE_ENV !== 'production' && process.env.DIR3COM_REAL_MARKETPLACE_PREVIEW_ENABLED === 'true');
}

export function requireRealMarketplacePreview() {
  if (!isRealMarketplacePreviewEnabled()) notFound();
}

export async function getRealFlightPreview(input: {
  from: string;
  to: string;
  departureDate: string;
  language: 'ar' | 'en';
  countryCode?: string;
}) {
  requireRealMarketplacePreview();
  if (!IATA_PATTERN.test(input.from) || !IATA_PATTERN.test(input.to) || !DATE_PATTERN.test(input.departureDate)) notFound();

  const countryCode = input.countryCode?.trim().toUpperCase() === 'EG' ? 'EG' : 'SA';
  const checkOut = new Date(`${input.departureDate}T00:00:00.000Z`);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  const [flightProbe, stayProbe, eventProbe] = await Promise.allSettled([
    searchDuffelFlights({ from: input.from, to: input.to, departureDate: input.departureDate, adults: 1 }),
    searchLiteApiHotels({
      cityName: countryCode === 'EG' ? 'Cairo' : 'Riyadh',
      countryCode,
      checkIn: input.departureDate,
      checkOut: checkOut.toISOString().slice(0, 10),
      occupancies: [{ adults: 1 }],
      currency: 'USD',
      guestNationality: countryCode,
      maxRatesPerHotel: 2,
    }),
    searchTicketmasterEvents({ countryCode, size: 20 }),
  ]);
  const flightResult = flightProbe.status === 'fulfilled'
    ? flightProbe.value
    : { provider: 'duffel' as const, status: 'unavailable' as const, offers: [] };
  const eventResult = eventProbe.status === 'fulfilled'
    ? eventProbe.value
    : { provider: 'ticketmaster' as const, status: 'unavailable' as const, total: 0, events: [] };
  const stayResult = stayProbe.status === 'fulfilled'
    ? stayProbe.value
    : { provider: 'liteapi' as const, status: 'unavailable' as const, hotels: [] };
  const offers = flightResult.status === 'ok' ? flightResult.offers.slice(0, 10).map(normalizeDuffelPreviewOffer) : [];
  const stays = stayResult.status === 'ok'
    ? stayResult.hotels.map(normalizeLiteApiPreviewStay).filter((stay) => stay !== null).slice(0, 10)
    : [];
  const events = eventResult.status === 'ok' ? eventResult.events.map(normalizeTicketmasterPreviewEvent) : [];
  return {
    provider: 'duffel' as const,
    providerStatus: flightResult.status,
    stayProvider: 'liteapi' as const,
    stayProviderStatus: stayResult.status,
    eventProvider: 'ticketmaster' as const,
    eventProviderStatus: eventResult.status,
    offers,
    stays,
    events,
    dabraContext: buildPreviewDabraContext(offers, stays, events, input.language),
  };
}

export async function getRealPreviewOffer(id: string) {
  requireRealMarketplacePreview();
  if (id.startsWith('off_')) {
    if (id.length > 160) notFound();
    try {
      return normalizeDuffelPreviewOffer(await getDuffelFlightOffer(id));
    } catch {
      notFound();
    }
  }

  const event = await getTicketmasterEvent(id);
  if (!event) notFound();
  return normalizeTicketmasterPreviewEvent(event);
}
