'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCountryAllowed, resolveVerifiedOperationalAccess } from '@/lib/auth/admin';
import { cairoInstant } from '@/lib/drive/search';
import { validDriveModelYear } from '@/lib/drive/catalog';

export async function reviewDriveRequest(_previous: string, form: FormData): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'UNAUTHORIZED';
  const access = await resolveVerifiedOperationalAccess(supabase, user, 'operations:write');
  if (!access.scope || !isCountryAllowed(access.scope,'EG')) return 'FORBIDDEN';
  const id = String(form.get('requestId') ?? ''); const version = Number(form.get('version'));
  const action = String(form.get('action')); const amount = Number(form.get('amount'));
  const rawYear = String(form.get('vehicleYear') ?? '').trim();
  const vehicleYear = rawYear === '' ? null : Number(rawYear);
  const expiry = cairoInstant(String(form.get('expires') ?? ''));
  if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isInteger(version) || version<0 || !['review','confirm','decline'].includes(action)) return 'INVALID';
  // The RPC also checks this year against the immutable promise saved on this REQ.
  if (action==='confirm' && (!Number.isFinite(amount) || amount<=0 || expiry===null || !validDriveModelYear(vehicleYear))) return 'INVALID';
  const { error } = await supabase.rpc('review_managed_drive_request', {
    p_request_id:id,p_version:version,p_action:action,p_vehicle:String(form.get('vehicle') ?? ''),p_vehicle_year:action==='confirm'?vehicleYear:null,
    p_amount:action==='confirm'?amount:null,p_currency:action==='confirm'?String(form.get('currency')):null,
    p_expires:action==='confirm'?new Date(expiry!).toISOString():null,p_note:String(form.get('note') ?? ''),
  });
  if (error) return error.code==='40001'?'STALE':error.code==='42501'?'FORBIDDEN':error.code==='22023'?'INVALID':'UNAVAILABLE';
  revalidatePath('/admin/operations/drive'); revalidatePath('/my-requests/[reference]/drive','page');
  return 'SAVED';
}
