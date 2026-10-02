/** Public catalogue only. Never evidence of a confirmed vehicle, city or travel date. */
export const DRIVE_CATALOG_SOURCE_URL = 'https://www.dir3com.com/api/public/drive/catalog';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_OFFERS = 100;
const TIMEOUT_MS = 4000;
const currencies = ['EGP', 'USD', 'SAR', 'EUR', 'AED'];

export type DriveCatalogItem = {
  id: string;
  name: string;
  family: 'dir3-drive';
  country: 'EG';
  availability: 'request_to_confirm';
  transactionMethod: 'request_to_confirm';
  verifiedAvailability: false;
  cityAvailabilityVerified: false;
  dateAvailabilityVerified: false;
  exactModelGuaranteed: false;
  startingRate: number;
  airportStartingRate: number | null;
  currency: string;
  rateUnit: 'day';
  finalTotalRequired: true;
  source: 'DIR3COM_PUBLISHED_DRIVE_CATALOG';
  sourceUrl: typeof DRIVE_CATALOG_SOURCE_URL;
  catalogVersion: string;
  url: string;
};
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}
function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[<>\x00-\x1f]/.test(value);
}
export function canonicalCatalogDestination(value: string) {
  const normalized = value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return ['cairo', 'القاهرة', 'القاهره'].includes(normalized) ? 'cairo' : null;
}

export function validateDriveCatalog(payload: unknown, language: 'ar' | 'en'): DriveCatalogItem[] | null {
  const body = record(payload);
  if (!body || body.source !== 'DIR3COM_PUBLISHED_DRIVE_CATALOG' || body.verifiedAvailability !== false ||
    body.dateAvailabilityVerified !== false || body.cityAvailabilityVerified !== false ||
    !boundedString(body.catalogVersion, 100) || body.country !== 'EG' || body.timezone !== 'Africa/Cairo' || !Array.isArray(body.offers) ||
    body.offers.length > MAX_OFFERS || body.total !== body.offers.length) return null;
  const items: DriveCatalogItem[] = [];
  const ids = new Set<string>();
  for (const value of body.offers) {
    const offer = record(value);
    const vehicle = record(offer?.vehicle);
    const price = record(offer?.price);
    const airportPrice = record(offer?.airportPrice);
    if (!offer || !vehicle || !price || !airportPrice || !boundedString(offer.id, 100) || !/^[a-z0-9-]+$/.test(offer.id) || ids.has(offer.id) ||
      offer.country !== 'EG' || offer.availability !== 'request_to_confirm' ||
      !['safeerat-al-arab', 'egypt-operations'].includes(String(offer.supplierId)) ||
      vehicle.id !== offer.vehicleId || vehicle.exactModelGuaranteed !== false ||
      !boundedString(vehicle[language], 180) || offer.version !== body.catalogVersion ||
      !currencies.includes(String(offer.currency)) || price.currency !== offer.currency || price.unit !== 'day' ||
      price.total !== null || price.finalTotalRequired !== true || typeof price.baseAmount !== 'number' ||
      !Number.isFinite(price.baseAmount) || price.baseAmount < 0 || price.baseAmount > 1000000 ||
      airportPrice.currency !== offer.currency || airportPrice.unit !== 'transfer' || airportPrice.total !== null ||
      airportPrice.finalTotalRequired !== true || (airportPrice.baseAmount !== null &&
      (typeof airportPrice.baseAmount !== 'number' || !Number.isFinite(airportPrice.baseAmount) || airportPrice.baseAmount < 0 || airportPrice.baseAmount > 1000000))) return null;
    ids.add(offer.id);
    items.push({
      id: offer.id, name: `${vehicle[language]}${language === 'ar' ? ' أو ما يماثلها' : ' or similar'}`,
      family: 'dir3-drive', country: 'EG', availability: 'request_to_confirm', transactionMethod: 'request_to_confirm',
      verifiedAvailability: false, cityAvailabilityVerified: false, dateAvailabilityVerified: false,
      exactModelGuaranteed: false, startingRate: price.baseAmount, airportStartingRate: airportPrice.baseAmount as number | null,
      currency: String(price.currency), rateUnit: 'day',
      finalTotalRequired: true, source: 'DIR3COM_PUBLISHED_DRIVE_CATALOG', sourceUrl: DRIVE_CATALOG_SOURCE_URL,
      catalogVersion: offer.version, url: `https://www.dir3com.com/marketplace?family=dir3-drive&offer=${encodeURIComponent(offer.id)}`,
    });
  }
  return items;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('CATALOG_BODY_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('CATALOG_BODY_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function readDriveCatalog(input: {service?: string; destination?: string; query?: string; id?: string; language: 'ar' | 'en'; page: number; pageSize: number}) {
  const empty = {catalogResults: [] as DriveCatalogItem[], catalogTotal: 0, catalogReturned: 0, catalogTotalPages: 0,
    catalogSourceHealth: 'not_applicable' as 'not_applicable' | 'available' | 'unavailable'};
  if ((input.service && input.service !== 'drive') || canonicalCatalogDestination(input.destination ?? '') === null) return empty;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL(DRIVE_CATALOG_SOURCE_URL);
    const response = await fetch(url, {method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: controller.signal});
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('CATALOG_RESPONSE_INVALID');
    const payload = await boundedJson(response);
    const items = validateDriveCatalog(payload, input.language);
    if (!items) throw new Error('CATALOG_CONTRACT_INVALID');
    const query = (input.query ?? '').trim().normalize('NFKC').toLowerCase();
    const allOffers = query ? (record(payload)!.offers as unknown[]) : [];
    const filtered = items.filter((item, index) => {
      if (input.id) return item.id === input.id;
      if (!query) return true;
      const vehicle = record(record(allOffers[index])?.vehicle);
      return [item.id, vehicle?.ar, vehicle?.en].some(value => typeof value === 'string' && value.normalize('NFKC').toLowerCase().includes(query));
    });
    const pageSize = Math.max(1, Math.min(20, Math.floor(input.pageSize)));
    const page = Math.max(1, Math.min(100, Math.floor(input.page)));
    const catalogResults = filtered.slice((page - 1) * pageSize, page * pageSize);
    return {catalogResults, catalogTotal: filtered.length, catalogReturned: catalogResults.length,
      catalogTotalPages: Math.ceil(filtered.length / pageSize), catalogSourceHealth: 'available' as const};
  } catch {
    return {...empty, catalogSourceHealth: 'unavailable' as const};
  } finally { clearTimeout(timer); }
}
