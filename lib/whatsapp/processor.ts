import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { shouldEscalateToHuman, resolveCountryProfileByPhoneNumberId, toCountryCode } from '@/lib/whatsapp/country-router';
import { reserveWebhookEventIfNew } from '@/lib/whatsapp/idempotency';
import { sendWhatsAppReply, type WhatsAppOutboundResult } from '@/lib/whatsapp/outbound';
import type { WhatsAppInboundMessage, WhatsAppProcessResult } from '@/lib/whatsapp/types';

type WhatsAppWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          text?: {
            body?: string;
          };
        }>;
      };
    }>;
  }>;
};

export function parseInboundMessages(payload: WhatsAppWebhookPayload): WhatsAppInboundMessage[] {
  const results: WhatsAppInboundMessage[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();

      for (const msg of value?.messages || []) {
        const messageId = String(msg.id || '').trim();
        const from = String(msg.from || '').trim();
        const text = String(msg.text?.body || '').trim();
        const timestamp = Number(msg.timestamp || NaN);

        if (!messageId || !from || !phoneNumberId || !text) continue;

        results.push({
          messageId,
          from,
          phoneNumberId,
          text,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
        });
      }
    }
  }

  return results;
}

const DABRA_RUNTIME_FALLBACK_AR = 'تعذر الوصول إلى DABRA مؤقتًا. تم تسجيل رسالتك وسيتم الرد عليك قريبًا.';

export async function processInboundMessages(
  messages: WhatsAppInboundMessage[],
  options?: {
    respondToMessage?: (text: string) => string;
    sendReply?: (input: {
      to: string;
      phoneNumberId: string;
      replyToMessageId: string;
      text: string;
    }) => Promise<WhatsAppOutboundResult>;
  },
): Promise<WhatsAppProcessResult[]> {
  const results: WhatsAppProcessResult[] = [];
  const responder = options?.respondToMessage ?? ((text: string) => buildAI2ChatResponse(text).answer);
  const sendReply = options?.sendReply ?? sendWhatsAppReply;

  async function finalizeResult(
    message: WhatsAppInboundMessage,
    base: Omit<WhatsAppProcessResult, 'outboundStatus' | 'outboundMessageId' | 'outboundErrorCode'>,
  ) {
    if (!base.responseText || base.action === 'ignored') {
      results.push({
        ...base,
        outboundStatus: 'skipped',
      });
      return;
    }

    const outbound = await sendReply({
      to: message.from,
      phoneNumberId: message.phoneNumberId,
      replyToMessageId: message.messageId,
      text: base.responseText,
    });

    results.push({
      ...base,
      outboundStatus: outbound.ok ? 'sent' : 'failed',
      outboundMessageId: outbound.metaMessageId,
      outboundErrorCode: outbound.errorCode,
    });
  }

  for (const message of messages) {
    const eventKey = `wa:${message.messageId}`;
    const dedupe = await reserveWebhookEventIfNew(eventKey);
    const profile = resolveCountryProfileByPhoneNumberId(message.phoneNumberId);
    const country = profile ? toCountryCode(profile) : 'UNKNOWN';

    if (dedupe.degraded) {
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: false,
        country,
        action: 'ignored',
        idempotencyStore: dedupe.store,
        blockerCode:
          dedupe.reason === 'MISSING_SUPABASE_ADMIN'
            ? 'WHATSAPP_IDEMPOTENCY_DEGRADED_MISSING_SUPABASE_ADMIN'
            : 'WHATSAPP_IDEMPOTENCY_DEGRADED_RPC',
      });
      continue;
    }

    if (!profile) {
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: false,
        country,
        action: 'ignored',
        idempotencyStore: dedupe.store,
        blockerCode: 'WHATSAPP_NUMBER_NOT_REGISTERED',
      });
      continue;
    }

    if (!dedupe.isNew) {
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: true,
        country,
        action: 'ignored',
        idempotencyStore: dedupe.store,
      });
      continue;
    }

    if (shouldEscalateToHuman(message.text)) {
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: false,
        country,
        action: 'handoff',
        idempotencyStore: dedupe.store,
        responseText:
          profile.language === 'ar'
            ? `تم تحويل طلبك إلى ${profile.humanHandoffLabel}.`
            : `Your request was handed off to ${profile.humanHandoffLabel}.`,
      });
      continue;
    }

    try {
      const answer = responder(message.text);
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: false,
        country,
        action: 'dabra',
        idempotencyStore: dedupe.store,
        responseText: answer,
      });
    } catch {
      await finalizeResult(message, {
        messageId: message.messageId,
        deduplicated: false,
        country,
        action: 'dabra',
        idempotencyStore: dedupe.store,
        responseText: DABRA_RUNTIME_FALLBACK_AR,
        blockerCode: 'DABRA_RUNTIME_UNAVAILABLE',
      });
    }
  }

  return results;
}
