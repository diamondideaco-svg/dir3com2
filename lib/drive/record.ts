import type { DriveTrip } from './request';
import type { DRIVE_MODEL_YEARS } from './catalog';
export type PersistedDriveTrip = DriveTrip & { minimumModelYear: 2025; acceptableModelYears: typeof DRIVE_MODEL_YEARS };
export type DriveRequestRecord = {
  id: string; request_reference: string; drive_offer_id: string; status: string;
  quote_amount: number | null; quote_currency: string | null; quote_expires_at: string | null;
  drive_request_context: { country: string; supplier_amount: number; supplier_currency: string;
    trip: PersistedDriveTrip; confirmed_vehicle: string | null; confirmed_vehicle_year: number | null; version: number };
};
export const DRIVE_REQUEST_FIELDS = 'id,request_reference,drive_offer_id,status,quote_amount,quote_currency,quote_expires_at,drive_request_context!inner(country,supplier_amount,supplier_currency,trip,confirmed_vehicle,confirmed_vehicle_year,version)';
