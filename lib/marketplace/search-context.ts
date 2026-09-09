import { canonicalCountries } from '../services/coverage';

// Existing ServiceSearchTable URL fields. These are customer preferences, never
// authority for product identity, availability, price or request ownership.
export const familyContextFields = {
  drive: ['country', 'pickupCity', 'dropoffCity', 'pickupDate', 'returnDate', 'passengers'],
  stay: ['country', 'city', 'checkIn', 'checkOut', 'rooms', 'guests'],
  fly: ['originCountry', 'originCity', 'destinationCountry', 'destinationCity', 'departureDate', 'returnDate', 'passengers'],
  concierge: ['country', 'city', 'serviceDate', 'guests'],
  vip: ['country', 'city', 'tripDate', 'guests'],
} as const;
const filterFields = ['destination', 'checkIn', 'checkOut', 'travelers', 'budget', 'query'] as const;
export type SearchContext = Record<string, string>;

export function readSearchContext(params: URLSearchParams): SearchContext {
  const service = params.get('service') ?? '';
  const fields = Object.hasOwn(familyContextFields, service)
    ? ['service', ...familyContextFields[service as keyof typeof familyContextFields], ...filterFields]
    : [...filterFields];
  const result: SearchContext = {};
  for (const key of new Set(fields)) {
    const values = params.getAll(key);
    // Reject ambiguous/repeated, overlong or control-character input. Do not
    // forward arbitrary URL keys into login returns or customer_brief.
    if (values.length !== 1 || !values[0] || values[0].length > 60 || /[\u0000-\u001f\u007f]/.test(values[0])) continue;
    result[key] = values[0];
  }
  return result;
}

export function serializePageQuery(query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.append(key, value);
    else if (Array.isArray(value)) value.forEach(item => params.append(key, item));
  }
  return params.toString();
}

export function partySize(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d?$/.test(value)) return undefined;
  return Number(value);
}

export function validSearchDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function canonicalCity(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return canonicalCountries.flatMap(country => country.cities)
    .find(city => [city.slug, city.en.toLowerCase(), city.ar].includes(normalized ?? ''));
}

export function initialContextFilters(context: SearchContext, family?: string) {
  const sameFamily = family === `dir3-${context.service}`;
  const city = sameFamily && context.service !== 'drive'
    ? canonicalCity(context.service === 'fly' ? context.destinationCity : context.city)?.slug : undefined;
  const count = sameFamily ? partySize(context.passengers ?? context.guests) : undefined;
  const start = context.checkIn ?? (sameFamily && context.service === 'fly' ? context.departureDate : undefined);
  const end = context.checkOut ?? (sameFamily && context.service === 'fly' ? context.returnDate : undefined);
  return {
    destination: context.destination ?? city ?? 'all',
    checkIn: validSearchDate(start), checkOut: validSearchDate(end),
    travelers: context.travelers === 'all' || context.travelers === '3+' || partySize(context.travelers)
      ? context.travelers : count ? String(count) : 'all',
    budget: ['0-2000', '2000-5000', '5000+'].includes(context.budget) ? context.budget : 'all',
  };
}

export function withSearchContext(href: string, context: SearchContext) {
  // Local navigation only; never attach customer preferences to external links.
  if (!/^\/(?:marketplace(?:\?|$)|services\/[^/?#]+(?:\?|$))/.test(href)) return href;
  const url = new URL(href, 'https://local.invalid');
  for (const [key, value] of Object.entries(readSearchContext(new URLSearchParams(context)))) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

const labels: Record<string, [string, string]> = {
  country: ['الدولة', 'Country'], pickupCity: ['مدينة الاستلام', 'Pickup city'], dropoffCity: ['مدينة الوصول', 'Drop-off city'],
  pickupDate: ['تاريخ الاستلام', 'Pickup date'], returnDate: ['تاريخ العودة', 'Return date'], passengers: ['المسافرون', 'Travellers'],
  city: ['المدينة', 'City'], checkIn: ['تاريخ البداية', 'Start date'], checkOut: ['تاريخ النهاية', 'End date'], rooms: ['الغرف', 'Rooms'], guests: ['الضيوف', 'Guests'],
  originCountry: ['دولة المغادرة', 'Origin country'], originCity: ['مدينة المغادرة', 'Origin city'], destinationCountry: ['دولة الوصول', 'Destination country'], destinationCity: ['مدينة الوصول', 'Destination city'],
  departureDate: ['تاريخ المغادرة', 'Departure date'], serviceDate: ['تاريخ الخدمة', 'Service date'], tripDate: ['تاريخ الرحلة', 'Trip date'],
  destination: ['الوجهة', 'Destination'], travelers: ['المسافرون', 'Travellers'], budget: ['الميزانية', 'Budget'], query: ['البحث', 'Search'],
};

export function contextSummary(context: SearchContext, language: 'ar' | 'en') {
  return Object.entries(context).filter(([key, value]) => key !== 'service' && value !== 'all').map(([key, value]) => {
    const city = /city|destination/i.test(key) ? canonicalCity(value) : undefined;
    const country = /country/i.test(key) ? canonicalCountries.find(item => item.code === value) : undefined;
    return `${labels[key]?.[language === 'ar' ? 0 : 1] ?? key}: ${city?.[language] ?? country?.[language] ?? value}`;
  });
}

export function searchContextBrief(context: SearchContext) {
  const safe = readSearchContext(new URLSearchParams(context));
  return Object.keys(safe).length ? { requirements: JSON.stringify(safe) } : {};
}

export function requestDetailHref(reference: string) {
  return /^REQ-[A-Z0-9-]+$/.test(reference) ? `/my-requests/${encodeURIComponent(reference)}` : null;
}
