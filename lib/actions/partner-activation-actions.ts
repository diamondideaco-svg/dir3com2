'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminActionAccess } from '@/lib/auth/admin';

export async function activatePartnerAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const id = String(formData.get('partnerId') || '');
  const expectedStatus = String(formData.get('expectedStatus') || '');
  const expectedUpdatedAt = String(formData.get('expectedUpdatedAt') || '');
  const reason = String(formData.get('reason') || '').trim();
  const reference = String(formData.get('reference') || '').trim();
  const confirmed = formData.get('confirmed') === 'true';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || !confirmed || reason.length < 3 || reason.length > 1000 || reference.length > 200) {
    return { ok: false, code: 'ATTESTATION_REQUIRED' } as const;
  }
  if (expectedStatus !== 'approved' || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { ok: false, code: 'STATE_CONFLICT' } as const;
  }
  // Use the authenticated client: the RPC derives the actor from auth.uid().
  const { data, error } = await supabase.rpc('activate_partner_with_attestation', {
    p_partner_id: id, p_expected_status: expectedStatus, p_expected_updated_at: expectedUpdatedAt,
    p_confirmed: confirmed, p_reason: reason, p_reference: reference || null,
  });
  if (error) {
    const code = error.code === '40001' ? 'STATE_CONFLICT'
      : error.code === '42501' ? 'FORBIDDEN'
        : error.code === '22023' ? 'ATTESTATION_REQUIRED' : 'ACTIVATION_FAILED';
    return { ok: false, code } as const;
  }
  if (data !== 'active') return { ok: false, code: 'ACTIVATION_FAILED' } as const;
  revalidatePath(`/admin/partners/${id}`);
  revalidatePath('/admin/partners');
  return { ok: true, code: 'ACTIVE' } as const;
}
