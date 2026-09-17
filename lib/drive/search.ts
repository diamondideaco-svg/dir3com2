import { DRIVE_CURRENCIES, DRIVE_OFFERS, DRIVE_TIME_ZONE, supplierRate, vehicleFor, type DriveCurrency, type DriveMode } from './catalog';

export type DriveSearch = { pickup: string; dropoff: string; pickupAt: string; returnAt: string; mode: DriveMode; passengers: number; luggage: number; currency: DriveCurrency };
const localFormat = new Intl.DateTimeFormat('en-GB', { timeZone: DRIVE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function localKey(time: number) {
  const parts = Object.fromEntries(localFormat.formatToParts(time).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
/** Resolve wall-clock time using IANA rules. Reject impossible AND ambiguous DST wall times. */
export function cairoInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const utc = Date.parse(`${value}Z`);
  if (!Number.isFinite(utc)) return null;
  const matches = [2, 3].map(offset => utc - offset * 3600000).filter(time => localKey(time) === value);
  return matches.length === 1 ? matches[0] : null;
}
export function readDriveSearch(params: URLSearchParams): DriveSearch {
  return { pickup: params.get('pickup') ?? '', dropoff: params.get('dropoff') ?? '', pickupAt: params.get('pickupAt') ?? '', returnAt: params.get('returnAt') ?? '',
    mode: params.get('mode') === 'airport' ? 'airport' : 'chauffeur', passengers: Number(params.get('passengers') ?? 1), luggage: Number(params.get('luggage') ?? 0),
    currency: DRIVE_CURRENCIES.includes(params.get('currency') as DriveCurrency) ? params.get('currency') as DriveCurrency : 'EGP' };
}
export function validateDriveSearch(search: DriveSearch, now = Date.now()): string | null {
  if (typeof search.pickup !== 'string' || search.pickup.trim().length < 2 || search.pickup.length > 200 || typeof search.dropoff !== 'string' || search.dropoff.length > 200) return 'LOCATION_REQUIRED';
  if (!['airport', 'chauffeur'].includes(search.mode) || !DRIVE_CURRENCIES.includes(search.currency)) return 'INVALID_SEARCH';
  if (!Number.isInteger(search.passengers) || search.passengers < 1 || search.passengers > 20 || !Number.isInteger(search.luggage) || search.luggage < 0 || search.luggage > 20) return 'INVALID_TRAVELLERS';
  const pickup = cairoInstant(search.pickupAt), end = cairoInstant(search.returnAt);
  if (pickup === null || end === null) return 'INVALID_LOCAL_TIME';
  if (pickup < now + 6 * 3600000) return 'PICKUP_TOO_SOON';
  if (end <= pickup || end - pickup > 90 * 86400000) return 'INVALID_RETURN';
  return null;
}
export function driveSearchParams(search: DriveSearch) {
  return new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]));
}
export function filterDriveOffers(search: DriveSearch, filters: { vehicleClass?: string; make?: string; capacity?: number; bags?: number } = {}) {
  return DRIVE_OFFERS.filter(offer => {
    const vehicle = vehicleFor(offer);
    return supplierRate(offer, search.mode) !== null && (!filters.vehicleClass || vehicle.vehicleClass === filters.vehicleClass)
      && (!filters.make || vehicle.make === filters.make)
      && (!filters.capacity || (vehicle.passengers !== null && vehicle.passengers >= filters.capacity))
      && (!filters.bags || (vehicle.luggage !== null && vehicle.luggage >= filters.bags));
  });
}
