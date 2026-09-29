'use server';
import { revalidatePath } from 'next/cache';
import { normalizeCountryKey, requireScopedAdminActionAccess } from '@/lib/auth/admin';
import { UUID_PATTERN } from '@/lib/contact/contract';
export async function progressContact(form: FormData) {
  const { supabase, user, scope } = await requireScopedAdminActionAccess('operations:write');
  const id = form.get('id'), expected = form.get('expected'), status = form.get('status'), note = form.get('note');
  if (typeof id !== 'string' || !UUID_PATTERN.test(id) || typeof expected !== 'string'
    || typeof status !== 'string' || typeof note !== 'string' || note.length > 2000) throw new Error('CONTACT_INVALID');
  const { error } = await supabase.rpc('progress_contact_enquiry', {
    p_id: id, p_actor: user.id, p_countries: scope.mode === 'global' ? null : scope.countries.map(normalizeCountryKey),
    p_expected: expected, p_status: status, p_note: note.trim(),
  });
  if (error) throw new Error('Contact update unavailable. Refresh before retrying. / تعذر التحديث، حدّث الصفحة قبل المحاولة.');
  revalidatePath('/admin/operations/contact');
}
