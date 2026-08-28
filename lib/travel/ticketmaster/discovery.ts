import 'server-only';

const API_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

type TicketmasterImage = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  ratio?: unknown;
};

type TicketmasterVenue = {
  name?: unknown;
  city?: { name?: unknown };
  country?: { countryCode?: unknown };
};

export type TicketmasterDiscoveryEvent = {
  id: string;
  name: string;
  locale: string;
  url: string;
  imageUrl: string | null;
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  salesStatus: string;
  venue: string;
  city: string;
  countryCode: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
};

export type TicketmasterDiscoveryResult = {
  provider: 'ticketmaster';
  status: 'ok' | 'no_results' | 'access_blocked' | 'unavailable';
  total: number;
  events: TicketmasterDiscoveryEvent[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isAllowedTicketmasterCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'ticketmaster.com'
      || host.endsWith('.ticketmaster.com')
      || host === 'tmtickets.sa'
      || host.endsWith('.tmtickets.sa');
  } catch {
    return false;
  }
}

function isAllowedTicketmasterImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'ticketm.net'
      || host.endsWith('.ticketm.net')
      || host === 'ticketmaster.com'
      || host.endsWith('.ticketmaster.com');
  } catch {
    return false;
  }
}

function selectImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const ranked = (images as TicketmasterImage[])
    .map((image) => ({
      url: asString(image.url),
      width: asNumber(image.width) ?? 0,
      height: asNumber(image.height) ?? 0,
      ratio: asString(image.ratio),
    }))
    .filter((image) => isAllowedTicketmasterImageUrl(image.url))
    .sort((left, right) => {
      const leftLandscape = left.ratio === '16_9' || left.width >= left.height;
      const rightLandscape = right.ratio === '16_9' || right.width >= right.height;
      if (leftLandscape !== rightLandscape) return leftLandscape ? -1 : 1;
      return right.width - left.width;
    });
  return ranked[0]?.url ?? null;
}

export function normalizeTicketmasterEvent(value: unknown): TicketmasterDiscoveryEvent | null {
  const event = asRecord(value);
  if (!event) return null;
  const id = asString(event.id);
  const name = asString(event.name);
  const url = asString(event.url);
  if (!EVENT_ID_PATTERN.test(id) || !name || !isAllowedTicketmasterCheckoutUrl(url)) return null;

  const dates = asRecord(event.dates);
  const start = asRecord(dates?.start);
  const status = asRecord(dates?.status);
  const embedded = asRecord(event._embedded);
  const venues = Array.isArray(embedded?.venues) ? embedded.venues as TicketmasterVenue[] : [];
  const venue = venues[0];
  const prices = Array.isArray(event.priceRanges) ? event.priceRanges : [];
  const price = asRecord(prices[0]);

  return {
    id,
    name,
    locale: asString(event.locale) || 'en-us',
    url,
    imageUrl: selectImage(event.images),
    localDate: asString(start?.localDate) || null,
    localTime: asString(start?.localTime) || null,
    timezone: asString(dates?.timezone) || null,
    salesStatus: asString(status?.code) || 'unknown',
    venue: asString(venue?.name),
    city: asString(venue?.city?.name),
    countryCode: asString(venue?.country?.countryCode).toUpperCase(),
    priceMin: asNumber(price?.min),
    priceMax: asNumber(price?.max),
    currency: asString(price?.currency).toUpperCase() || null,
  };
}

async function ticketmasterRequest(path: string, params: URLSearchParams): Promise<unknown> {
  const key = process.env.TICKETMASTER_API_KEY?.trim()
    || process.env.TICKETMASTER_CONSUMER_KEY?.trim();
  if (!key) return null;

  const url = new URL(`${API_BASE_URL}/${path}`);
  params.forEach((value, name) => url.searchParams.set(name, value));
  url.searchParams.set('apikey', key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { __status: response.status };
    return await response.json() as unknown;
  } catch {
    return { __status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchTicketmasterEvents(input: {
  countryCode: string;
  keyword?: string;
  size?: number;
}): Promise<TicketmasterDiscoveryResult> {
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    return { provider: 'ticketmaster', status: 'unavailable', total: 0, events: [] };
  }

  if (!process.env.TICKETMASTER_API_KEY?.trim() && !process.env.TICKETMASTER_CONSUMER_KEY?.trim()) {
    return { provider: 'ticketmaster', status: 'access_blocked', total: 0, events: [] };
  }

  const params = new URLSearchParams({
    countryCode,
    size: String(Math.min(Math.max(Math.trunc(input.size ?? 20), 1), 50)),
    sort: 'date,asc',
  });
  const keyword = input.keyword?.trim();
  if (keyword) params.set('keyword', keyword.slice(0, 120));

  const payload = await ticketmasterRequest('events.json', params);
  const root = asRecord(payload);
  const status = asNumber(root?.__status);
  if (status !== null) {
    return {
      provider: 'ticketmaster',
      status: status === 401 || status === 403 ? 'access_blocked' : 'unavailable',
      total: 0,
      events: [],
    };
  }

  const embedded = asRecord(root?._embedded);
  const rawEvents = Array.isArray(embedded?.events) ? embedded.events : [];
  const events = rawEvents
    .map(normalizeTicketmasterEvent)
    .filter((event): event is TicketmasterDiscoveryEvent => event !== null);
  const page = asRecord(root?.page);
  const total = asNumber(page?.totalElements) ?? events.length;
  return {
    provider: 'ticketmaster',
    status: events.length > 0 ? 'ok' : 'no_results',
    total,
    events,
  };
}

export async function getTicketmasterEvent(id: string): Promise<TicketmasterDiscoveryEvent | null> {
  if (!EVENT_ID_PATTERN.test(id)) return null;
  const payload = await ticketmasterRequest(`events/${encodeURIComponent(id)}.json`, new URLSearchParams());
  return normalizeTicketmasterEvent(payload);
}
