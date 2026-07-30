import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPayload, NotificationStatus } from '@/lib/operations/notification-provider';
import { notificationProviderRegistry } from '@/lib/operations/notification-provider';

export interface EventDispatcherSubscription {
  eventName: string;
  handler: (payload: Record<string, unknown>) => void | Promise<void>;
}

export class EventDispatcher {
  private subscriptions = new Map<string, Array<EventDispatcherSubscription>>();

  subscribe(eventName: string, handler: (payload: Record<string, unknown>) => void | Promise<void>) {
    const handlers = this.subscriptions.get(eventName) ?? [];
    handlers.push({ eventName, handler });
    this.subscriptions.set(eventName, handlers);
  }

  async dispatch(eventName: string, payload: Record<string, unknown>) {
    const handlers = this.subscriptions.get(eventName) ?? [];
    await Promise.all(handlers.map((subscription) => subscription.handler(payload)));
  }
}

export const operationsEventDispatcher = new EventDispatcher();

export interface AuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  performedBy?: string;
  ipAddress?: string;
}

export interface TimelineInput {
  entityType: string;
  entityId: string;
  eventType: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  performedBy?: string;
}

export async function createAuditRecord(supabase: SupabaseClient, input: AuditLogInput) {
  const { data, error } = await supabase.from('audit_logs').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_values: input.oldValues ?? {},
    new_values: input.newValues ?? {},
    performed_by: input.performedBy,
    ip_address: input.ipAddress,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, auditLog: data };
}

export async function appendTimelineRecord(supabase: SupabaseClient, input: TimelineInput) {
  const { data, error } = await supabase.from('activity_timeline').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    event_type: input.eventType,
    summary: input.summary,
    metadata: input.metadata ?? {},
    performed_by: input.performedBy,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, timelineRecord: data };
}

export async function publishEvent(supabase: SupabaseClient, eventName: string, payload: Record<string, unknown>, source = 'operations-engine') {
  const { data, error } = await supabase.from('system_events').insert({
    event_name: eventName,
    entity_type: (payload.entityType as string) ?? null,
    entity_id: (payload.entityId as string) ?? null,
    payload,
    source,
  }).select().single();

  if (error) return { success: false, error: error.message };

  await operationsEventDispatcher.dispatch(eventName, payload);
  return { success: true, event: data };
}

export async function createNotificationRecord(supabase: SupabaseClient, input: {
  recipientType: string;
  recipientId?: string;
  channel: string;
  subject?: string;
  body: string;
  provider?: string;
  status?: NotificationStatus;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.from('notifications').insert({
    recipient_type: input.recipientType,
    recipient_id: input.recipientId,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    provider: input.provider ?? 'internal',
    status: input.status ?? 'Pending',
    metadata: input.metadata ?? {},
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, notification: data };
}

export async function sendNotificationRecord(supabase: SupabaseClient, notificationId: string, providerName = 'internal') {
  const { data: notification, error: fetchError } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
  if (fetchError || !notification) return { success: false, error: fetchError?.message ?? 'Notification not found' };

  const adapter = notificationProviderRegistry.get(notification.channel, providerName);
  const payload: NotificationPayload = {
    recipientType: notification.recipient_type,
    recipientId: notification.recipient_id,
    channel: notification.channel,
    subject: notification.subject ?? undefined,
    body: notification.body,
    metadata: notification.metadata ?? {},
  };

  const result = adapter
    ? await adapter.send(payload)
    : { success: true, status: 'Queued' as NotificationStatus };

  const nextStatus = result.success ? (result.status ?? 'Sent') : 'Failed';
  await supabase.from('notifications').update({ status: nextStatus }).eq('id', notificationId);
  await supabase.from('notification_logs').insert({ notification_id: notificationId, provider: providerName, status: nextStatus, response: result.error ?? 'ok' });
  return { success: result.success, status: nextStatus };
}
