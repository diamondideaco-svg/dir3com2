import 'server-only';

import twilio from 'twilio';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const WHATSAPP_ADDRESS_PATTERN = /^whatsapp:(\+[1-9]\d{7,14})$/;
const SID_PATTERN = /^SM[0-9A-Za-z]{32}$/;
const CONTENT_SID_PATTERN = /^HX[0-9A-Za-z]{32}$/;

export type PartnerWhatsappState = 'disabled' | 'idle' | 'prepared' | 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export function normalizeE164(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let normalized = value.trim().replace(/[\s().-]/g, '');
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  return E164_PATTERN.test(normalized) ? normalized : null;
}

export function redactSensitiveText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/whatsapp:\+\d{8,15}/gi, '[REDACTED_WHATSAPP]')
    .replace(/\+\d{8,15}/g, '[REDACTED_PHONE]')
    .replace(/\bAC[0-9A-Za-z]{32}\b/g, '[REDACTED_ACCOUNT_SID]')
    .replace(/\b(?:SK|HX|SM)[0-9A-Za-z]{32}\b/g, '[REDACTED_SID]');
}

type ServerEnvironment = Record<string, string | undefined>;

export function getTwilioWhatsappConfig(env: ServerEnvironment = process.env) {
  const enabled = env.TWILIO_WHATSAPP_ENABLED === 'true';
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? '';
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  const from = env.TWILIO_WHATSAPP_FROM?.trim() ?? '';
  const contentSid = env.TWILIO_WHATSAPP_CONTENT_SID?.trim() ?? '';

  const configured = /^AC[0-9A-Za-z]{32}$/.test(accountSid)
    && authToken.length >= 16
    && WHATSAPP_ADDRESS_PATTERN.test(from)
    && CONTENT_SID_PATTERN.test(contentSid);

  return { enabled, configured, accountSid, authToken, from, contentSid };
}

export function getTwilioStatusCallbackUrl(env: ServerEnvironment = process.env) {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() ?? '';
  try {
    const url = new URL('/api/twilio/whatsapp/status', raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

type CreateMessageInput = {
  to: string;
  from: string;
  contentSid: string;
  contentVariables: string;
  statusCallback: string;
};

type MessageCreator = (input: CreateMessageInput) => Promise<{ sid: string; status: string }>;

export async function sendPartnerWhatsappMessage(input: {
  recipientE164: string;
  contentVariables: Record<string, string>;
  createMessage?: MessageCreator;
  env?: ServerEnvironment;
}) {
  const env = input.env ?? process.env;
  const config = getTwilioWhatsappConfig(env);
  const recipient = normalizeE164(input.recipientE164);
  const statusCallback = getTwilioStatusCallbackUrl(env);
  if (!config.enabled) throw new Error('TWILIO_WHATSAPP_DISABLED');
  if (!config.configured || !recipient || !statusCallback) throw new Error('TWILIO_WHATSAPP_NOT_CONFIGURED');

  const createMessage = input.createMessage ?? (async (messageInput) => {
    const client = twilio(config.accountSid, config.authToken, { timeout: 10_000 });
    return client.messages.create(messageInput);
  });
  const message = await createMessage({
    to: `whatsapp:${recipient}`,
    from: config.from,
    contentSid: config.contentSid,
    contentVariables: JSON.stringify(input.contentVariables),
    statusCallback,
  });
  if (!SID_PATTERN.test(message.sid) || !['accepted', 'queued'].includes(message.status)) {
    throw new Error('TWILIO_WHATSAPP_RESPONSE_INVALID');
  }
  return { messageSid: message.sid, status: 'queued' as const };
}

export function validateTwilioStatusSignature(input: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
  authToken?: string;
}) {
  const authToken = input.authToken ?? process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
  if (!authToken || !input.signature) return false;
  return twilio.validateRequest(authToken, input.signature, input.url, input.params);
}
