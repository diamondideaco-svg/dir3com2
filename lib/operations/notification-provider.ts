export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push';
export type NotificationStatus = 'Pending' | 'Queued' | 'Sent' | 'Delivered' | 'Failed' | 'Cancelled';

export interface NotificationPayload {
  recipientType: string;
  recipientId?: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationProviderAdapter {
  name: string;
  channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<{ success: boolean; status: NotificationStatus; error?: string }>;
}

export class NotificationProviderRegistry {
  private adapters = new Map<string, NotificationProviderAdapter>();

  register(adapter: NotificationProviderAdapter) {
    this.adapters.set(`${adapter.channel}:${adapter.name}`, adapter);
  }

  get(channel: NotificationChannel, name = 'internal') {
    return this.adapters.get(`${channel}:${name}`);
  }
}

export const notificationProviderRegistry = new NotificationProviderRegistry();
