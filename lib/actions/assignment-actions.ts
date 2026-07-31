'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assignPartnerToBooking, autoAssignBooking, recalculateShieldScore } from '@/lib/assignment-engine';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { bookingStatusFromAssignmentStatus, normalizeBookingStatus } from '@/lib/booking/workflow-status';

export async function confirmBookingAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await supabase.from('bookings').update({ status: normalizeBookingStatus('Confirmed') }).eq('id', bookingId);
  await autoAssignBooking(supabase, bookingId, 'admin');
  revalidatePath('/admin/assignment');
}

export async function assignPartnerAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Manual assignment');
  revalidatePath('/admin/assignment');
}

export async function reassignPartnerAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Reassigned partner');
  revalidatePath('/admin/assignment');
}

export async function rejectAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await supabase.from('partner_assignments').update({ assignment_status: 'declined' }).eq('booking_id', bookingId);
  await supabase.from('bookings').update({ status: bookingStatusFromAssignmentStatus('declined') }).eq('id', bookingId);
  revalidatePath('/admin/assignment');
  redirect('/admin/assignment?result=assignment_rejected');
}

export async function approveAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await supabase.from('partner_assignments').update({ assignment_status: 'accepted' }).eq('booking_id', bookingId);
  await supabase.from('bookings').update({ status: bookingStatusFromAssignmentStatus('accepted') }).eq('id', bookingId);
  revalidatePath('/admin/assignment');
  redirect('/admin/assignment?result=assignment_approved');
}

export async function forceAssignmentAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  if (!bookingId || !partnerId) return;

  const { supabase } = await requireAdminActionAccess();
  await assignPartnerToBooking(supabase, bookingId, partnerId, 'admin', 'Forced assignment');
  revalidatePath('/admin/assignment');
}

export async function recalculateScoreAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  const { supabase } = await requireAdminActionAccess();
  await recalculateShieldScore(supabase, bookingId);
  revalidatePath('/admin/assignment');
}
