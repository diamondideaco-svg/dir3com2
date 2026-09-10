import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import twilio from 'twilio';
import {
  getTwilioWhatsappConfig,
  normalizeE164,
  redactSensitiveText,
  sendPartnerWhatsappMessage,
  validateTwilioStatusSignature,
} from '../lib/integrations/twilio-whatsapp';

const configuredEnv = {
  TWILIO_WHATSAPP_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'test-auth-token-with-safe-length',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
  TWILIO_WHATSAPP_CONTENT_SID: `HX${'b'.repeat(32)}`,
  NEXT_PUBLIC_SITE_URL: 'https://example.test',
};

test('E.164 normalization is strict and never guesses a country prefix', () => {
  assert.equal(normalizeE164('+201556006410'), '+201556006410');
  assert.equal(normalizeE164('00201556006410'), '+201556006410');
  assert.equal(normalizeE164('+20 155-600-6410'), '+201556006410');
  for (const invalid of ['01117507795', '+0123', '201556006410', '+20155abc6410', '', null]) {
    assert.equal(normalizeE164(invalid), null);
  }
});

test('Twilio feature flag is disabled by default and configuration is server-only', () => {
  assert.deepEqual(getTwilioWhatsappConfig({}), {
    enabled: false, configured: false, accountSid: '', authToken: '', from: '', contentSid: '',
  });
  assert.equal(getTwilioWhatsappConfig(configuredEnv).enabled, true);
  assert.equal(getTwilioWhatsappConfig(configuredEnv).configured, true);
});

test('provider queues an approved template with callback and no body fabrication', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await sendPartnerWhatsappMessage({
    notificationId: '11111111-1111-4111-8111-111111111111',
    recipientE164: '+201556006410',
    contentVariables: { '1': 'REQ-TEST', '2': 'Drive' },
    env: configuredEnv,
    createMessage: async (input) => {
      calls.push(input);
      return { sid: `SM${'c'.repeat(32)}`, status: 'queued' };
    },
  });
  assert.equal(result.status, 'queued');
  assert.equal(calls[0]?.to, 'whatsapp:+201556006410');
  assert.equal(calls[0]?.from, 'whatsapp:+14155238886');
  assert.equal(calls[0]?.statusCallback, 'https://example.test/api/twilio/whatsapp/status?notification=11111111-1111-4111-8111-111111111111');
  assert.equal('body' in (calls[0] ?? {}), false);
});

test('provider errors surface without inventing sent or delivered state', async () => {
  await assert.rejects(sendPartnerWhatsappMessage({
    notificationId: '11111111-1111-4111-8111-111111111111',
    recipientE164: '+201556006410', contentVariables: {}, env: configuredEnv,
    createMessage: async () => { throw new Error('provider failed'); },
  }), /provider failed/);
  await assert.rejects(sendPartnerWhatsappMessage({
    notificationId: '11111111-1111-4111-8111-111111111111',
    recipientE164: '+201556006410', contentVariables: {}, env: configuredEnv,
    createMessage: async () => { throw new Error('ETIMEDOUT'); },
  }), /ETIMEDOUT/);
});

test('Twilio signature validation accepts exact signed form and rejects tampering', () => {
  const url = 'https://example.test/api/twilio/whatsapp/status';
  const params = { MessageSid: `SM${'d'.repeat(32)}`, MessageStatus: 'delivered' };
  const signature = twilio.getExpectedTwilioSignature(configuredEnv.TWILIO_AUTH_TOKEN!, url, params);
  assert.equal(validateTwilioStatusSignature({ signature, url, params, authToken: configuredEnv.TWILIO_AUTH_TOKEN }), true);
  assert.equal(validateTwilioStatusSignature({ signature, url, params: { ...params, MessageStatus: 'read' }, authToken: configuredEnv.TWILIO_AUTH_TOKEN }), false);
  assert.equal(validateTwilioStatusSignature({ signature: null, url, params, authToken: configuredEnv.TWILIO_AUTH_TOKEN }), false);
});

test('phone numbers and provider identifiers are redacted from logs', () => {
  const value = redactSensitiveText(`to whatsapp:+201556006410 account AC${'a'.repeat(32)} message SM${'b'.repeat(32)}`);
  assert.doesNotMatch(value, /201556006410|ACa{32}|SMb{32}/);
  assert.match(value, /REDACTED_WHATSAPP/);
});

test('migration enforces authorization, country scope, idempotency, append-only audit, and truthful transitions', () => {
  const migration = readFileSync('supabase/migrations/20260910114856_partner_whatsapp_notifications.sql', 'utf8');
  assert.match(migration, /operations:write/);
  assert.match(migration, /normalize_admin_country_key/);
  assert.match(migration, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(migration, /PARTNER_WHATSAPP_EVENT_APPEND_ONLY/);
  assert.match(migration, /PARTNER_WHATSAPP_CALLBACK_REPLAY/);
  assert.match(migration, /PARTNER_WHATSAPP_CALLBACK_TRANSITION_INVALID/);
  assert.match(migration, /record_partner_whatsapp_provider_uncertain/);
  assert.match(migration, /twilio_message_sid IS NULL AND status='prepared'/);
  assert.match(migration, /RETURN v_row\.status/);
  assert.doesNotMatch(migration, /\[\^0-9\+\]/);
  assert.match(migration, /recipient_e164 ~ '\^\\\+\[1-9\]/);
  assert.doesNotMatch(migration, /UPDATE public\.marketplace_requests/i);
  assert.doesNotMatch(migration, /INSERT INTO public\.bookings/i);
});

test('disabled UI does not require the notification migration and uncertain sends stay reconcilable', () => {
  const table = readFileSync('components/admin/MarketplaceRequestOperationsTable.tsx', 'utf8');
  const route = readFileSync('app/api/admin/operations/partner-whatsapp/route.ts', 'utf8');
  const callback = readFileSync('app/api/twilio/whatsapp/status/route.ts', 'utf8');
  assert.match(table, /twilioEnabled && requestIds\.length && supabaseAdmin/);
  assert.match(route, /record_partner_whatsapp_provider_uncertain/);
  assert.match(route, /TIMEOUT\|TIMEDOUT\|ECONNRESET/);
  assert.match(route, /state: 'reconciling'/);
  assert.match(route, /COUNTRY_SCOPE_FORBIDDEN/);
  assert.match(callback, /p_notification_id: notificationId/);
});

test('operations UI exposes disabled, idle, sending, queued, delivered, and failed states without changing request truth', () => {
  const component = readFileSync('components/admin/PartnerWhatsappNotificationAction.tsx', 'utf8');
  for (const state of ['disabled', 'idle', 'sending', 'reconciling', 'queued', 'delivered', 'failed']) assert.match(component, new RegExp(state));
  assert.match(component, /Send partner WhatsApp notification/);
  assert.doesNotMatch(component, /booking confirmed|payment completed/i);
});
