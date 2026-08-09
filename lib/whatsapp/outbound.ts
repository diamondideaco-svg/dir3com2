import { resolveCountryProfileByPhoneNumberId } from '@/lib/whatsapp/country-router';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com/v26.0';
const OUTBOUND_TIMEOUT_MS = 5000;

export type WhatsAppOutboundClassification =
  | 'sent'
  | 'missing_token'
  | 'unknown_number'
  | 'timeout'
  | 'network_error'
  | 'meta_4xx'
  | 'meta_5xx'
  | 'invalid_response';

export type WhatsAppOutboundResult = {
  ok: boolean;
  classification: WhatsAppOutboundClassification;
  statusCode: number | null;
  metaMessageId?: string;
  errorCode?: string;
};

export type SendWhatsAppReplyInput = {
  to: string;
  phoneNumberId: string;
  replyToMessageId: string;
  text: string;
  fetchImpl?: typeof fetch;
};

function getAccessTokenByPhoneNumberId(phoneNumberId: string) {
  const profile = resolveCountryProfileByPhoneNumberId(phoneNumberId);

  if (!profile) {
    return null;
  }

  if (profile.country === 'EG') {
    return process.env.WHATSAPP_ACCESS_TOKEN_EG?.trim() || null;
  }

  if (profile.country === 'SA') {
    return process.env.WHATSAPP_ACCESS_TOKEN_SA?.trim() || null;
  }

  return null;
}

function normalizeText(text: string) {
  return String(text || '').trim();
}

function classifyMetaFailure(statusCode: number) {
  if (statusCode >= 500) {
    return 'meta_5xx' as const;
  }

  return 'meta_4xx' as const;
}

export async function sendWhatsAppReply(input: SendWhatsAppReplyInput): Promise<WhatsAppOutboundResult> {
  const phoneNumberId = String(input.phoneNumberId || '').trim();
  const replyToMessageId = String(input.replyToMessageId || '').trim();
  const to = String(input.to || '').trim();
  const text = normalizeText(input.text);

  if (!resolveCountryProfileByPhoneNumberId(phoneNumberId)) {
    return {
      ok: false,
      classification: 'unknown_number',
      statusCode: null,
    };
  }

  const accessToken = getAccessTokenByPhoneNumberId(phoneNumberId);
  if (!accessToken) {
    return {
      ok: false,
      classification: 'missing_token',
      statusCode: null,
      errorCode: 'WHATSAPP_OUTBOUND_MISSING_TOKEN',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${META_GRAPH_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        context: {
          message_id: replyToMessageId,
        },
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorCode =
        payload && typeof payload === 'object' && 'error' in payload && payload.error && typeof payload.error === 'object' && 'code' in payload.error
          ? String((payload.error as { code?: unknown }).code || '') || undefined
          : undefined;

      return {
        ok: false,
        classification: classifyMetaFailure(response.status),
        statusCode: response.status,
        errorCode,
      };
    }

    const metaMessageId =
      payload &&
      typeof payload === 'object' &&
      'messages' in payload &&
      Array.isArray(payload.messages) &&
      payload.messages[0] &&
      typeof payload.messages[0] === 'object' &&
      'id' in payload.messages[0]
        ? String((payload.messages[0] as { id?: unknown }).id || '').trim()
        : '';

    if (!metaMessageId) {
      return {
        ok: false,
        classification: 'invalid_response',
        statusCode: response.status,
        errorCode: 'WHATSAPP_OUTBOUND_INVALID_RESPONSE',
      };
    }

    return {
      ok: true,
      classification: 'sent',
      statusCode: response.status,
      metaMessageId,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        classification: 'timeout',
        statusCode: null,
        errorCode: 'WHATSAPP_OUTBOUND_TIMEOUT',
      };
    }

    return {
      ok: false,
      classification: 'network_error',
      statusCode: null,
      errorCode: 'WHATSAPP_OUTBOUND_NETWORK_ERROR',
    };
  } finally {
    clearTimeout(timeout);
  }
}