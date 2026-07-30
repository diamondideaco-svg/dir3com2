'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendTimelineRecord, createAuditRecord as createAuditEntry, createNotificationRecord, publishEvent, sendNotificationRecord } from '@/lib/operations/operations-engine';

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
  const supabase = await createSupabaseServerClient();
  return createNotificationRecord(supabase, input);
}

export async function sendNotification(notificationId: string, providerName = 'internal') {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
  return createAuditEntry(supabase, input);
}

export async function publishSystemEvent(eventName: string, payload: Record<string, unknown>, source = 'operations-engine') {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
  return appendTimelineRecord(supabase, input);
}

export async function getOperationsSummary() {
  const supabase = await createSupabaseServerClient();
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
