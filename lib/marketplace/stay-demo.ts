import type { StaySearchInput, StaySearchResult } from '../travel/contracts';
import { canonicalCity } from './search-context';

// Client-safe contracts only. Provider credentials and execution stay server-side.
export const STAY_DEMO_NOTICE = {
  ar: 'Sandbox Demo — أسعار وإتاحة تجريبية، غير قابلة للحجز أو الدفع',
  en: 'Sandbox Demo — test prices and availability; no booking or payment',
} as const;
export const STAY_DESTINATIONS = [
  { city: 'Cairo', ar: 'القاهرة', country: 'EG' },
  { city: 'Alexandria', ar: 'الإسكندرية', country: 'EG' },
  { city: 'Hurghada', ar: 'الغردقة', country: 'EG' },
  { city: 'Sharm El Sheikh', ar: 'شرم الشيخ', country: 'EG' },
  { city: 'Riyadh', ar: 'الرياض', country: 'SA' },
  { city: 'Jeddah', ar: 'جدة', country: 'SA' },
  { city: 'Dammam', ar: 'الدمام', country: 'SA' },
  { city: 'Madinah', ar: 'المدينة المنورة', country: 'SA' },
] as const;
export type StayDemoQuery = { destination: string; checkIn: string; checkOut: string; adults: number; rooms: number; nationality: string; currency: string };
export type StayDemoCard = {
  hotelId: string; offerId: string; name: string; location: string | null; image: string | null;
  rating: number | null; room: string; price: number; currency: string;
  provider: 'LiteAPI'; environment: 'sandbox'; availability: 'sandbox_available'; retrievedAt: string;
};
export type StayDemoResult = { status: 'ok' | 'no_results' | 'unavailable' | 'rate_limited'; cards: StayDemoCard[]; retrievedAt: string; retryAfterSeconds?: number };

export function isStayDemoResult(value: unknown): value is StayDemoResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!['ok', 'no_results', 'unavailable', 'rate_limited'].includes(String(result.status))
    || !Array.isArray(result.cards) || result.cards.length > 20
    || typeof result.retrievedAt !== 'string' || !Number.isFinite(Date.parse(result.retrievedAt))) return false;
  if ((result.status === 'ok') !== (result.cards.length > 0)) return false;
  return result.cards.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const card = entry as Record<string, unknown>;
    return typeof card.hotelId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(card.hotelId)
      // LiteAPI offer IDs are opaque encoded payloads, not short catalogue IDs.
      && typeof card.offerId === 'string' && card.offerId.length > 0 && card.offerId.length <= 8192
      && typeof card.name === 'string' && card.name.trim().length > 0 && card.name.length <= 500
      && (card.location === null || (typeof card.location === 'string' && card.location.length <= 500))
      && (card.image === null || (typeof card.image === 'string' && card.image.startsWith('https://')))
      && (card.rating === null || (typeof card.rating === 'number' && Number.isFinite(card.rating) && card.rating > 0 && card.rating <= 10))
      && typeof card.room === 'string' && card.room.trim().length > 0 && card.room.length <= 500
      && typeof card.price === 'number' && Number.isFinite(card.price) && card.price >= 0
      && typeof card.currency === 'string' && /^[A-Z]{3}$/.test(card.currency)
      && card.provider === 'LiteAPI' && card.environment === 'sandbox'
      && card.availability === 'sandbox_available'
      && typeof card.retrievedAt === 'string' && Number.isFinite(Date.parse(card.retrievedAt));
  });
}

/** Preserve the existing service-family form contract when entering this Demo. */
export function normalizeStayDemoSearch(search: string): string {
  const params = new URLSearchParams(search);
  if (params.get('service') === 'stay') {
    if (!params.has('destination') && params.has('city')) {
      const city = params.get('city')!;
      params.set('destination', canonicalCity(city)?.en ?? city);
    }
    if (!params.has('adults') && params.has('guests')) params.set('adults', params.get('guests')!);
  }
  if (params.get('service') === 'stay' || params.get('providerProof') === 'liteapi') {
    if (!params.has('searched') && params.has('checkIn') && params.has('checkOut')) params.set('searched', '1');
  }
  return params.toString();
}

export function parseStayDemoQuery(params: URLSearchParams, now = Date.now()): StayDemoQuery | null {
  const destination = STAY_DESTINATIONS.find(d => [d.city.toLowerCase(), d.ar].includes((params.get('destination') ?? '').trim().toLowerCase()));
  const checkIn = params.get('checkIn') ?? ''; const checkOut = params.get('checkOut') ?? '';
  const day = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  const adults = Number(params.get('adults') ?? 2); const rooms = Number(params.get('rooms') ?? 1);
  const currency = params.get('currency') ?? 'SAR'; const nationality = params.get('nationality') ?? 'EG';
  if (!destination || !day(checkIn) || !day(checkOut) || checkIn < new Date(now).toISOString().slice(0,10)
    || Date.parse(checkIn) > now + 365 * 86400000 || Date.parse(checkOut) <= Date.parse(checkIn)
    || Date.parse(checkOut) - Date.parse(checkIn) > 30 * 86400000
    || !Number.isSafeInteger(adults) || adults < 1 || adults > 9 || !Number.isSafeInteger(rooms) || rooms < 1 || rooms > 4 || rooms > adults
    || !['SAR','USD','EGP','EUR','AED'].includes(currency) || !/^[A-Z]{2}$/.test(nationality)) return null;
  return { destination: destination.city, checkIn, checkOut, adults, rooms, currency, nationality };
}
export function stayDemoProviderInput(query: StayDemoQuery): StaySearchInput {
  return {
    cityName: query.destination, countryCode: STAY_DESTINATIONS.find(d => d.city === query.destination)!.country,
    checkIn: query.checkIn, checkOut: query.checkOut, currency: query.currency, guestNationality: query.nationality,
    // Explicit UI allocation: adults evenly across rooms, remainder in first rooms. No invented child ages.
    occupancies: Array.from({length: query.rooms}, (_, i) => ({ adults: Math.floor(query.adults / query.rooms) + (i < query.adults % query.rooms ? 1 : 0) })),
    maxRatesPerHotel: 1,
  };
}
function safePhoto(value: string | null | undefined): string | null {
  try { const u = new URL(value ?? ''); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function stayDemoCards(result: StaySearchResult, retrievedAt: string, rooms = 1): StayDemoCard[] {
  if (result.provider !== 'liteapi' || result.status !== 'ok' || result.sandbox !== true) return [];
  const unique = new Map<string, StayDemoCard>();
  for (const hotel of result.hotels) {
    if (hotel.provider !== 'liteapi' || !/^[A-Za-z0-9_-]{1,100}$/.test(hotel.id) || !hotel.name?.trim()) continue;
    const rate = hotel.rooms.flatMap(r => r.rates).find(r => r.provider === 'liteapi' && r.id && r.totalAmount.trim() && Number.isFinite(Number(r.totalAmount)) && Number(r.totalAmount) >= 0 && /^[A-Z]{3}$/.test(r.currency));
    if (!rate || unique.has(hotel.id)) continue;
    const total = rate.suggestedSellingAmount ?? rate.offerTotalAmount ?? (rooms === 1 ? rate.totalAmount : undefined);
    const currency = rate.suggestedSellingAmount !== undefined ? rate.suggestedSellingCurrency : rate.offerTotalAmount !== undefined ? rate.offerCurrency : rate.currency;
    if (!total?.trim() || !Number.isFinite(Number(total)) || Number(total) < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) continue;
    unique.set(hotel.id, { hotelId: hotel.id, offerId: rate.id, name: hotel.name, location: hotel.address ?? null,
      image: safePhoto(hotel.imageUrl), rating: typeof hotel.rating === 'number' && Number.isFinite(hotel.rating) && hotel.rating > 0 ? hotel.rating : null,
      room: rate.roomName, price: Number(total), currency,
      provider: 'LiteAPI', environment: 'sandbox', availability: 'sandbox_available', retrievedAt });
    if (unique.size === 20) break;
  }
  return [...unique.values()];
}
export function filterStayDemoCards(cards: StayDemoCard[], params: URLSearchParams): StayDemoCard[] {
  const max = params.get('maxPrice'); const name = (params.get('hotelName') ?? '').trim().toLocaleLowerCase();
  const currency = params.get('currency');
  const filtered = cards.filter(c => (!name || c.name.toLocaleLowerCase().includes(name)) && (!max || ((!currency || c.currency === currency) && Number.isFinite(Number(max)) && c.price <= Number(max))));
  const sort = params.get('sort');
  return sort === 'price-asc' || sort === 'price-desc' ? filtered.sort((a,b) => a.currency.localeCompare(b.currency) || (sort === 'price-asc' ? a.price-b.price : b.price-a.price)) : filtered;
}
