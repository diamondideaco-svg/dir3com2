import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/integrations/whatsapp/webhook/route';
import { verifyWhatsAppSignature } from '../lib/whatsapp/security';
import { parseInboundMessages, processInboundMessages } from '../lib/whatsapp/processor';

function signBody(rawBody: string, secret: string) {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

function makeValidPayload(messageId: string, phoneNumberId = 'pnid-eg') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: '+201011676418',
              },
              messages: [
                {
                  id: messageId,
                  from: '201111111111',
                  timestamp: '1720000000',
                  text: { body: 'اريد المساعدة' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test('GET verification passes with correct token and challenge', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-123';

  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=verify-123');
  const response = await GET(request);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, 'abc123');
});

test('GET verification rejects invalid token', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-123';

  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=wrong');
  const response = await GET(request);
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'WHATSAPP_VERIFY_DENIED');
});

test('signature verification is based on raw body and timing-safe comparator', () => {
  const secret = 'app-secret';
  const rawBody = '{"a":1,"b":2}';
  const prettyBody = '{\n  "a": 1,\n  "b": 2\n}';

  const validHeader = signBody(rawBody, secret);
  assert.equal(verifyWhatsAppSignature(rawBody, validHeader, secret), true);
  assert.equal(verifyWhatsAppSignature(prettyBody, validHeader, secret), false);
  assert.equal(verifyWhatsAppSignature(rawBody, 'sha256=deadbeef', secret), false);
});

test('POST invalid JSON does not return 500', async () => {
  process.env.NODE_ENV = 'development';

  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook', {
    method: 'POST',
    body: 'not-json',
  });

  const response = await POST(request);
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'WHATSAPP_PAYLOAD_INVALID');
});

test('POST unsupported payload shape is safely acknowledged without 500', async () => {
  process.env.NODE_ENV = 'development';

  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook', {
    method: 'POST',
    body: JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [] } }] }] }),
  });

  const response = await POST(request);
  const body = (await response.json()) as {
    data: { accepted: boolean; receivedCount: number; processedCount: number };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.accepted, true);
  assert.equal(body.data.receivedCount, 0);
  assert.equal(body.data.processedCount, 0);
});

test('POST in production rejects invalid signature', async () => {
  process.env.NODE_ENV = 'production';
  process.env.WHATSAPP_APP_SECRET = 'prod-secret';

  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook', {
    method: 'POST',
    body: JSON.stringify(makeValidPayload('msg-invalid-signature')),
    headers: {
      'x-hub-signature-256': 'sha256=bad',
    },
  });

  const response = await POST(request);
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'WHATSAPP_SIGNATURE_INVALID');
});

test('POST in production fails safe when durable idempotency is unavailable', async () => {
  process.env.NODE_ENV = 'production';
  process.env.WHATSAPP_APP_SECRET = 'prod-secret';
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';

  const rawBody = JSON.stringify(makeValidPayload('msg-prod-degraded', 'pnid-eg'));
  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook', {
    method: 'POST',
    body: rawBody,
    headers: {
      'x-hub-signature-256': signBody(rawBody, 'prod-secret'),
    },
  });

  const response = await POST(request);
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'WHATSAPP_IDEMPOTENCY_DEGRADED');
});

test('duplicate event is deduplicated', async () => {
  process.env.NODE_ENV = 'development';
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const payload = makeValidPayload('msg-dup-1');
  const messages = parseInboundMessages(payload);

  const first = await processInboundMessages(messages);
  const second = await processInboundMessages(messages);

  assert.equal(first[0]?.deduplicated, false);
  assert.equal(second[0]?.deduplicated, true);
  assert.equal(second[0]?.action, 'ignored');
});

test('unregistered phone_number_id is rejected', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const messages = parseInboundMessages(makeValidPayload('msg-unknown-number', 'pnid-other'));
  const processed = await processInboundMessages(messages);

  assert.equal(processed[0]?.action, 'ignored');
  assert.equal(processed[0]?.blockerCode, 'WHATSAPP_NUMBER_NOT_REGISTERED');
});

test('human handoff is handled as a standalone path', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  const messages = parseInboundMessages({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: 'pnid-eg',
              },
              messages: [
                {
                  id: 'msg-handoff',
                  from: '201222222222',
                  text: { body: 'أحتاج مندوب خدمة عملاء' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const processed = await processInboundMessages(messages);
  assert.equal(processed[0]?.action, 'handoff');
  assert.equal(processed[0]?.deduplicated, false);
});

test('DABRA fallback is returned when responder throws', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  const messages = parseInboundMessages(makeValidPayload('msg-dabra-fallback', 'pnid-eg'));
  const processed = await processInboundMessages(messages, {
    respondToMessage() {
      throw new Error('simulated-down');
    },
  });

  assert.equal(processed[0]?.action, 'dabra');
  assert.equal(processed[0]?.blockerCode, 'DABRA_RUNTIME_UNAVAILABLE');
  assert.equal(typeof processed[0]?.responseText, 'string');
});

test('webhook POST returns quick acknowledgment payload', async () => {
  process.env.NODE_ENV = 'development';
  process.env.WHATSAPP_APP_SECRET = 'dev-secret';
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const rawBody = JSON.stringify(makeValidPayload('msg-ack-1', 'pnid-eg'));
  const request = new NextRequest('https://example.com/api/integrations/whatsapp/webhook', {
    method: 'POST',
    body: rawBody,
    headers: {
      'x-hub-signature-256': signBody(rawBody, 'dev-secret'),
    },
  });

  const response = await POST(request);
  const body = (await response.json()) as {
    data: {
      accepted: boolean;
      acknowledged: boolean;
      processingMs: number;
      blockers: string[];
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.accepted, true);
  assert.equal(body.data.acknowledged, true);
  assert.equal(typeof body.data.processingMs, 'number');
  assert.ok(body.data.processingMs >= 0);
  assert.ok(body.data.blockers.includes('WHATSAPP_IDEMPOTENCY_MEMORY_FALLBACK_ACTIVE'));
});