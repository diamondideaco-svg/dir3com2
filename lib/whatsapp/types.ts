export type WhatsAppCountryCode = 'EG' | 'SA' | 'UNKNOWN';

export type WhatsAppCountryProfile = {
  country: WhatsAppCountryCode;
  phoneE164: string;
  language: 'ar' | 'en';
  currency: 'EGP' | 'SAR' | 'USD';
  services: string[];
  humanHandoffLabel: string;
};

export type WhatsAppInboundMessage = {
  messageId: string;
  from: string;
  phoneNumberId: string;
  text: string;
  timestamp: number | null;
};

export type WhatsAppProcessResult = {
  messageId: string;
  deduplicated: boolean;
  country: WhatsAppCountryCode;
  action: 'dabra' | 'handoff' | 'ignored';
  idempotencyStore?: 'supabase' | 'memory';
  responseText?: string;
  blockerCode?: string;
  outboundStatus?: 'sent' | 'failed' | 'skipped';
  outboundMessageId?: string;
  outboundErrorCode?: string;
};
