'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assignPartnerToBooking, autoAssignBooking, recalculateShieldScore } from '@/lib/assignment-engine';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { synchronizeBookingLifecycle } from '@/lib/actions/operations-actions';

export async function confirmBookingAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'confirmed',
    note: 'Booking confirmed by assignment control flow',
  });
  await autoAssignBooking(supabase, bookingId, 'admin');
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'assigned',
    assignmentStatus: 'assigned',
    note: 'Booking assigned to partner',
  });
  revalidatePath('/admin/assignment');
}

export async function assignPartnerAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Manual assignment');
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'assigned',
    assignmentStatus: 'assigned',
    note: 'Manual partner assignment recorded',
  });
  revalidatePath('/admin/assignment');
}

export async function reassignPartnerAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Reassigned partner');
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'assigned',
    assignmentStatus: 'assigned',
    note: 'Partner reassignment recorded',
  });
  revalidatePath('/admin/assignment');
}

export async function rejectAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await supabase.from('partner_assignments').update({ assignment_status: 'declined' }).eq('booking_id', bookingId);
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'declined',
    assignmentStatus: 'declined',
    note: 'Assignment request was rejected',
  });
  revalidatePath('/admin/assignment');
  redirect('/admin/assignment?result=assignment_rejected');
}

export async function approveAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await supabase.from('partner_assignments').update({ assignment_status: 'accepted' }).eq('booking_id', bookingId);
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'accepted',
    assignmentStatus: 'accepted',
    note: 'Assignment accepted and operation started',
  });
  revalidatePath('/admin/assignment');
  redirect('/admin/assignment?result=assignment_approved');
}

export async function forceAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Forced assignment');
  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'assigned',
    assignmentStatus: 'assigned',
    note: 'Forced partner assignment recorded',
  });
  revalidatePath('/admin/assignment');
}

export async function recalculateScoreAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await recalculateShieldScore(supabase, bookingId);
  revalidatePath('/admin/assignment');
}
