import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDriveTrip, validateDriveOfferRequest } from './request';

export async function createDriveRequest(supabase: SupabaseClient, body: Record<string, unknown>, key: string | null) {
  if (!key || !/^[A-Za-z0-9:_-]{16,120}$/.test(key)) return NextResponse.json({ error: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 });
  // The atomic RPC checks the current six-hour boundary after replay detection.
  // An identical retry must still recover its existing REQ after time advances.
  const parsed = parseDriveTrip(body.trip, 0);
  if (!parsed.trip) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!validateDriveOfferRequest(body.drive_offer_id, parsed.trip)) return NextResponse.json({ error: 'OFFER_UNAVAILABLE' }, { status: 409 });
  const { data, error } = await supabase.rpc('create_managed_drive_request', { p_offer_id: body.drive_offer_id, p_key: key, p_trip: parsed.trip });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : ['22023','22007','22008'].includes(error.code) ? 400 : 503;
    return NextResponse.json({ error: status === 409 ? 'IDEMPOTENCY_CONFLICT' : status === 403 ? 'REQUEST_NOT_AUTHORIZED' : status === 400 ? 'INVALID_TRIP' : 'REQUEST_SERVICE_UNAVAILABLE' }, { status });
  }
  return NextResponse.json({ request: { request_reference: data.reference, status: data.status }, replayed: data.replayed }, { status: data.replayed ? 200 : 201 });
}
