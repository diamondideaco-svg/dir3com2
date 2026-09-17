import { driveOffer } from './catalog';
import { cairoInstant, validateDriveSearch, type DriveSearch } from './search';
export type DriveTrip = DriveSearch & { name: string; phone: string; flightNumber: string; flightArrival: string; specialRequest: string; notes: string; acknowledged: boolean };
export function parseDriveTrip(value: unknown, now = Date.now()): { trip: DriveTrip; error: null } | { error: string; trip: null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'INVALID_TRIP', trip: null };
  const source = value as Record<string, unknown>;
  const strings = ['pickup','dropoff','pickupAt','returnAt','mode','currency','name','phone','flightNumber','flightArrival','specialRequest','notes'];
  if (strings.some(key => typeof source[key] !== 'string')) return { error: 'INVALID_TRIP', trip: null };
  const trip = Object.fromEntries(strings.map(key => [key, (source[key] as string).trim()])) as unknown as DriveTrip;
  trip.passengers = source.passengers as number; trip.luggage = source.luggage as number; trip.acknowledged = source.acknowledged === true;
  const searchError = validateDriveSearch(trip, now);
  if (searchError) return { error: searchError, trip: null };
  if (trip.dropoff.length < 2 || trip.name.length < 2 || trip.name.length > 120 || !/^[+\d ()-]{7,30}$/.test(trip.phone)
    || trip.notes.length > 1000 || trip.specialRequest.length > 500 || !trip.acknowledged) return { error: 'CONTACT_OR_ACK_REQUIRED', trip: null };
  if (trip.mode === 'airport' && (!/^[A-Za-z0-9 -]{2,20}$/.test(trip.flightNumber) || cairoInstant(trip.flightArrival) === null)) return { error: 'FLIGHT_DETAILS_REQUIRED', trip: null };
  if (trip.mode !== 'airport') { trip.flightNumber = ''; trip.flightArrival = ''; }
  return { trip, error: null };
}
export function validateDriveOfferRequest(offerId: unknown, trip: DriveTrip) {
  const offer = driveOffer(offerId);
  return offer && offer[trip.mode] !== null ? offer : null;
}
export function driveRequestState(status: string, expires: string | null, now = Date.now()) {
  if (status === 'awaiting_customer_acceptance' && expires && Date.parse(expires) <= now) return 'expired';
  return status === 'awaiting_customer_acceptance' ? 'confirmed_payment_pending' : status;
}
