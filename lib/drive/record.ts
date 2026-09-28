import type { DriveTrip } from './request';
import { validDriveModelYear, LEGACY_DRIVE_MODEL_YEARS } from './catalog';
export type PersistedDriveTrip = DriveTrip & { minimumModelYear: number | null; acceptableModelYears: readonly number[] | null };
/** Read the saved promise, never the current catalogue, for an existing REQ. */
export function savedDriveModelYears(trip: Partial<Pick<PersistedDriveTrip, 'minimumModelYear' | 'acceptableModelYears'>>): readonly number[] | null {
  if (trip.minimumModelYear === null && trip.acceptableModelYears === null) return null;
  const minimum = trip.minimumModelYear ?? 2025;
  const years: readonly number[] = Array.isArray(trip.acceptableModelYears) ? trip.acceptableModelYears : LEGACY_DRIVE_MODEL_YEARS;
  return years.filter(year => validDriveModelYear(year) && year >= minimum);
}
export type DriveRequestRecord = {
  id: string; request_reference: string; drive_offer_id: string; status: string;
  quote_amount: number | null; quote_currency: string | null; quote_expires_at: string | null;
  drive_request_context: { country: string; supplier_amount: number; supplier_currency: string;
    trip: PersistedDriveTrip; confirmed_vehicle: string | null; confirmed_vehicle_year: number | null;
    customer_accepted_at: string | null; version: number };
};
export const DRIVE_REQUEST_FIELDS = 'id,request_reference,drive_offer_id,status,quote_amount,quote_currency,quote_expires_at,drive_request_context!inner(country,supplier_amount,supplier_currency,trip,confirmed_vehicle,confirmed_vehicle_year,customer_accepted_at,version)';
