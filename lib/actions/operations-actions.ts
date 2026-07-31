'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { appendTimelineRecord, createAuditRecord as createAuditEntry, createNotificationRecord, publishEvent, sendNotificationRecord } from '@/lib/operations/operations-engine';
import { bookingStatusFromAssignmentStatus, bookingStatusFromLifecycleOutcome, normalizeBookingStatus, type CanonicalAssignmentStatus, type CanonicalLifecycleOutcome } from '@/lib/booking/workflow-status';

export async function createNotification(input: {
  recipientType: string;
  recipientId?: string;
  channel: string;
  subject?: string;
  body: string;
  provider?: string;
  status?: 'Pending' | 'Queued' | 'Sent' | 'Delivered' | 'Failed' | 'Cancelled';
  metadata?: Record<string, unknown>;
}) {
  const { supabase } = await requireAdminActionAccess();
  return createNotificationRecord(supabase, input);
}

export async function sendNotification(notificationId: string, providerName = 'internal') {
  const { supabase } = await requireAdminActionAccess();
  return sendNotificationRecord(supabase, notificationId, providerName);
}

export async function createAuditLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  performedBy?: string;
  ipAddress?: string;
}) {
  const { supabase } = await requireAdminActionAccess();
  return createAuditEntry(supabase, input);
}

export async function publishSystemEvent(eventName: string, payload: Record<string, unknown>, source = 'operations-engine') {
  const { supabase } = await requireAdminActionAccess();
  return publishEvent(supabase, eventName, payload, source);
}

export async function appendTimeline(input: {
  entityType: string;
  entityId: string;
  eventType: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  performedBy?: string;
}) {
  const { supabase } = await requireAdminActionAccess();
  return appendTimelineRecord(supabase, input);
}

export async function getOperationsSummary() {
  const { supabase } = await requireAdminActionAccess();
  const [notificationsRes, auditRes, timelineRes, eventsRes] = await Promise.all([
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(8),
    supabase.from('activity_timeline').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(8),
  ]);

  return {
    notifications: notificationsRes.data ?? [],
    audits: auditRes.data ?? [],
    timeline: timelineRes.data ?? [],
    events: eventsRes.data ?? [],
  };
}

export async function synchronizeBookingLifecycle(input: {
  bookingId: string;
  outcome: CanonicalLifecycleOutcome;
  assignmentStatus?: CanonicalAssignmentStatus | null;
  note?: string;
  source?: string;
}) {
  const { supabase, user } = await requireAdminActionAccess();
  const { data: booking } = await supabase.from('bookings').select('id, status').eq('id', input.bookingId).single();
  const { data: latestAssignment } = await supabase
    .from('partner_assignments')
    .select('assignment_status')
    .eq('booking_id', input.bookingId)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking) {
    return { success: false, error: 'Booking not found' };
  }

  const previousStatus = normalizeBookingStatus(booking.status as string | null | undefined);
  const statusFromOutcome = bookingStatusFromLifecycleOutcome(input.outcome);
  const resolvedAssignmentStatus = input.assignmentStatus
    ?? ((latestAssignment?.assignment_status as CanonicalAssignmentStatus | null | undefined) ?? null);
  const nextStatus = resolvedAssignmentStatus
    ? bookingStatusFromAssignmentStatus(resolvedAssignmentStatus)
    : statusFromOutcome;

  if (previousStatus !== nextStatus) {
    await supabase.from('bookings').update({ status: nextStatus }).eq('id', input.bookingId);
  }

  await supabase.from('booking_status_history').insert({
    booking_id: input.bookingId,
    status: nextStatus,
    changed_by: user.id,
    notes: input.note ?? `Lifecycle updated via ${input.outcome}`,
  });

  const eventType = `booking_status.${nextStatus.toLowerCase().replace(/\s+/g, '_')}`;
  const payload = {
    entityType: 'booking',
    entityId: input.bookingId,
    outcome: input.outcome,
    assignmentStatus: resolvedAssignmentStatus,
    previousStatus,
    nextStatus,
  };

  await Promise.all([
    appendTimelineRecord(supabase, {
      entityType: 'booking',
      entityId: input.bookingId,
      eventType,
      summary: input.note ?? `Booking moved to ${nextStatus}`,
      metadata: payload,
      performedBy: user.id,
    }),
    createAuditEntry(supabase, {
      entityType: 'bookings',
      entityId: input.bookingId,
      action: 'lifecycle_status_updated',
      oldValues: { status: previousStatus },
      newValues: { status: nextStatus, outcome: input.outcome, assignment_status: resolvedAssignmentStatus },
      performedBy: user.id,
    }),
    publishEvent(
      supabase,
      'booking.lifecycle.updated',
      payload,
      input.source ?? 'assignment-operations-sync',
    ),
  ]);

  return { success: true, previousStatus, nextStatus };
}

export async function completeBookingLifecycleAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'completed',
    note: 'Booking marked completed from operations workflow',
  });

  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/my-bookings');
  revalidatePath(`/my-bookings/${bookingId}`);
  redirect(`/admin/bookings/${bookingId}?result=booking_completed`);
}

export async function cancelBookingLifecycleAction(formData: FormData) {
  const bookingId = formData.get('bookingId')?.toString();
  if (!bookingId) return;

  await synchronizeBookingLifecycle({
    bookingId,
    outcome: 'cancelled',
    note: 'Booking marked cancelled from operations workflow',
  });

  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/my-bookings');
  revalidatePath(`/my-bookings/${bookingId}`);
  redirect(`/admin/bookings/${bookingId}?result=booking_cancelled`);
}
