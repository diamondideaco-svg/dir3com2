'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminActionAccess, requireAdminReadAccess } from '@/lib/auth/admin';
import { appendTimelineRecord, createAuditRecord as createAuditEntry, createNotificationRecord, publishEvent, sendNotificationRecord } from '@/lib/operations/operations-engine';
import type { CanonicalAssignmentStatus, CanonicalLifecycleOutcome } from '@/lib/booking/workflow-status';

const marketplaceRequestTransitions = {
  under_review: 'assign_owner',
  awaiting_supplier: 'contact_supplier',
  confirmed: 'notify_customer',
  declined: 'notify_customer',
  cancelled: 'none',
} as const;

type MarketplaceRequestTransition = keyof typeof marketplaceRequestTransitions;

function readOptionalEvidence(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value || undefined;
}

export async function updateMarketplaceRequestStatus(formData: FormData) {
  const requestId = formData.get('requestId')?.toString();
  const expectedStatus = formData.get('expectedStatus')?.toString();
  const status = formData.get('status')?.toString() as MarketplaceRequestTransition | undefined;
  if (!requestId || !expectedStatus || !status || !(status in marketplaceRequestTransitions)) {
    throw new Error('Invalid request transition');
  }

  const { supabase } = await requireAdminActionAccess();

  const confirmationEvidence = status === 'confirmed'
    ? {
        confirmation_source: readOptionalEvidence(formData, 'confirmationSource'),
        confirmation_reference: readOptionalEvidence(formData, 'confirmationReference'),
        payment_reference: readOptionalEvidence(formData, 'paymentReference'),
        quote_reference: readOptionalEvidence(formData, 'quoteReference'),
      }
    : {};

  const { error } = await supabase.rpc('transition_marketplace_request', {
    p_request_id: requestId,
    p_expected_status: expectedStatus,
    p_new_status: status,
    p_confirmation_evidence: confirmationEvidence,
  });
  if (error) {
    if (error.message?.includes('DIR120_STALE_REQUEST_STATE')) {
      throw new Error('Request state changed; refresh and try again');
    }
    throw new Error('Unable to update request safely');
  }

  revalidatePath('/admin/operations');
  revalidatePath('/my-account');
  revalidatePath('/my-bookings');
}

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
  ipAddress?: string;
}) {
  const { supabase, user } = await requireAdminActionAccess();
  return createAuditEntry(supabase, { ...input, performedBy: user.id });
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
}) {
  const { supabase, user } = await requireAdminActionAccess();
  return appendTimelineRecord(supabase, { ...input, performedBy: user.id });
}

export async function getOperationsSummary() {
  const { supabase } = await requireAdminReadAccess();
  const [notificationsRes, auditRes, timelineRes, eventsRes] = await Promise.all([
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(8),
    supabase.from('activity_timeline').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(8),
  ]);

  const queryError = notificationsRes.error ?? auditRes.error ?? timelineRes.error ?? eventsRes.error;
  if (queryError) {
    throw new Error('ADMIN_OPERATIONS_READ_FAILED');
  }

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
  await requireAdminActionAccess();
  void input;
  return { success: false, error: 'ADMIN_BOOKING_LIFECYCLE_MUTATION_UNAVAILABLE' };
}

export async function completeBookingLifecycleAction(formData: FormData) {
  await requireAdminActionAccess();
  void formData;
  throw new Error('ADMIN_BOOKING_LIFECYCLE_MUTATION_UNAVAILABLE');
}

export async function cancelBookingLifecycleAction(formData: FormData) {
  await requireAdminActionAccess();
  void formData;
  throw new Error('ADMIN_BOOKING_LIFECYCLE_MUTATION_UNAVAILABLE');
}
