'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function acceptDriveQuote(_previous: string, form: FormData): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'UNAUTHORIZED';

  const requestId = String(form.get('requestId') ?? '');
  const version = Number(form.get('version'));
  if (!/^[a-f0-9-]{36}$/i.test(requestId) || !Number.isInteger(version) || version < 0 || form.get('acknowledged') !== 'yes') return 'INVALID';

  const { error } = await supabase.rpc('accept_managed_drive_quote', {
    p_request_id: requestId,
    p_version: version,
  });
  if (error) {
    if (error.code === '40001') return 'STALE';
    if (error.code === '42501') return 'FORBIDDEN';
    if (error.code === '22023') return 'INVALID_OR_EXPIRED';
    return 'UNAVAILABLE';
  }
  revalidatePath('/my-requests/[reference]/drive', 'page');
  return 'ACCEPTED';
}
