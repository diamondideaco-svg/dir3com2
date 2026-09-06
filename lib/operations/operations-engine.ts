import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationItem } from '@/lib/supabase/types';

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

export interface InAppNotificationInput {
  profileId: string;
  title: string;
  body?: string;
  kind?: NotificationItem['kind'];
}

// The caller must authorize an administrator before passing its server client.
// Recipient identity is resolved against profiles, never a delivery address.
export async function createNotificationRecord(supabase: SupabaseClient, input: InAppNotificationInput) {
  if (!input || typeof input.profileId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.profileId)
      || typeof input.title !== 'string' || !input.title.trim()
      || (input.body !== undefined && typeof input.body !== 'string')
      || (input.kind !== undefined && !['info', 'booking', 'promotion', 'system'].includes(input.kind))) {
    return { success: false, error: 'INVALID_NOTIFICATION_INPUT' };
  }
  const { data: recipient, error: recipientError } = await supabase.from('profiles')
    .select('id').eq('id', input.profileId).eq('status', 'active').is('deleted_at', null).maybeSingle();
  if (recipientError || !recipient) return { success: false, error: 'NOTIFICATION_RECIPIENT_UNAVAILABLE' };

  const { data, error } = await supabase.from('notifications').insert({
    profile_id: recipient.id,
    title: input.title.trim(),
    body: input.body ?? null,
    kind: input.kind ?? 'info',
    status: 'active',
  }).select('id, profile_id, title, body, kind, status, created_at').single();

  if (error || !data) return { success: false, error: 'NOTIFICATION_CREATE_FAILED' };
  return { success: true, notification: data };
}
