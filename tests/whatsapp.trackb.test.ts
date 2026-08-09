import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET, POST, __setWebhookBackgroundSchedulerForTests } from '../app/api/integrations/whatsapp/webhook/route';
import { verifyWhatsAppSignature } from '../lib/whatsapp/security';
import { parseInboundMessages, processInboundMessages } from '../lib/whatsapp/processor';
import { sendWhatsAppReply } from '../lib/whatsapp/outbound';

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

function setNodeEnv(value: 'development' | 'production') {
  Object.assign(process.env, { NODE_ENV: value });
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
  setNodeEnv('development');

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
  setNodeEnv('development');

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
  setNodeEnv('production');
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
  setNodeEnv('production');
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
  setNodeEnv('development');
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
  assert.equal(second[0]?.outboundStatus, 'skipped');
});

test('EG inbound sends reply via EG sender configuration', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const sent: Array<{ to: string; phoneNumberId: string; replyToMessageId: string; text: string }> = [];
  const messages = parseInboundMessages(makeValidPayload('msg-eg-send', 'pnid-eg'));

  const processed = await processInboundMessages(messages, {
    respondToMessage() {
      return 'اهلا من مصر';
    },
    async sendReply(input) {
      sent.push(input);
      return {
        ok: true,
        classification: 'sent',
        statusCode: 200,
        metaMessageId: 'wamid-eg-1',
      };
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.phoneNumberId, 'pnid-eg');
  assert.equal(sent[0]?.to, '201111111111');
  assert.equal(processed[0]?.outboundStatus, 'sent');
  assert.equal(processed[0]?.outboundMessageId, 'wamid-eg-1');
});

test('SA inbound sends reply via SA sender configuration', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const sent: Array<{ to: string; phoneNumberId: string; replyToMessageId: string; text: string }> = [];
  const messages = parseInboundMessages(makeValidPayload('msg-sa-send', 'pnid-sa'));

  const processed = await processInboundMessages(messages, {
    respondToMessage() {
      return 'hello from saudi';
    },
    async sendReply(input) {
      sent.push(input);
      return {
        ok: true,
        classification: 'sent',
        statusCode: 200,
        metaMessageId: 'wamid-sa-1',
      };
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.phoneNumberId, 'pnid-sa');
  assert.equal(processed[0]?.outboundStatus, 'sent');
  assert.equal(processed[0]?.outboundMessageId, 'wamid-sa-1');
});

test('duplicate message_id does not send outbound twice', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  let sendCount = 0;
  const messages = parseInboundMessages(makeValidPayload('msg-dup-send', 'pnid-eg'));

  await processInboundMessages(messages, {
    respondToMessage() {
      return 'first';
    },
    async sendReply() {
      sendCount += 1;
      return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-dup-1' };
    },
  });

  const second = await processInboundMessages(messages, {
    respondToMessage() {
      return 'second';
    },
    async sendReply() {
      sendCount += 1;
      return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-dup-2' };
    },
  });

  assert.equal(sendCount, 1);
  assert.equal(second[0]?.deduplicated, true);
  assert.equal(second[0]?.outboundStatus, 'skipped');
});

test('process result records safe outbound failure for responder output', async () => {
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  const messages = parseInboundMessages(makeValidPayload('msg-outbound-failure', 'pnid-eg'));
  const processed = await processInboundMessages(messages, {
    respondToMessage() {
      return 'reply body';
    },
    async sendReply() {
      return {
        ok: false,
        classification: 'meta_5xx',
        statusCode: 500,
        errorCode: '131000',
      };
    },
  });

  assert.equal(processed[0]?.outboundStatus, 'failed');
  assert.equal(processed[0]?.outboundErrorCode, '131000');
});

test('sendWhatsAppReply uses EG token and phone_number_id with reply context', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';
  process.env.WHATSAPP_ACCESS_TOKEN_EG = 'token-eg';
  process.env.WHATSAPP_ACCESS_TOKEN_SA = 'token-sa';

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendWhatsAppReply({
    to: '201111111111',
    phoneNumberId: 'pnid-eg',
    replyToMessageId: 'msg-eg-graph',
    text: 'reply-eg',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid-graph-eg' }] }), { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.metaMessageId, 'wamid-graph-eg');
  assert.match(calls[0]?.url || '', /pnid-eg\/messages$/);
  assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer token-eg');
  const body = JSON.parse(String(calls[0]?.init?.body || '{}')) as { context?: { message_id?: string }; to?: string };
  assert.equal(body.context?.message_id, 'msg-eg-graph');
  assert.equal(body.to, '201111111111');
});

test('sendWhatsAppReply uses SA token and phone_number_id', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';
  process.env.WHATSAPP_ACCESS_TOKEN_EG = 'token-eg';
  process.env.WHATSAPP_ACCESS_TOKEN_SA = 'token-sa';

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await sendWhatsAppReply({
    to: '966500000000',
    phoneNumberId: 'pnid-sa',
    replyToMessageId: 'msg-sa-graph',
    text: 'reply-sa',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid-graph-sa' }] }), { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.match(calls[0]?.url || '', /pnid-sa\/messages$/);
  assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer token-sa');
});

test('sendWhatsAppReply fails safe when token is missing', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  delete process.env.WHATSAPP_ACCESS_TOKEN_EG;

  const result = await sendWhatsAppReply({
    to: '201111111111',
    phoneNumberId: 'pnid-eg',
    replyToMessageId: 'msg-no-token',
    text: 'reply',
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification, 'missing_token');
});

test('sendWhatsAppReply classifies meta 4xx/5xx and timeout safely', async () => {
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_ACCESS_TOKEN_EG = 'token-eg';

  const badRequest = await sendWhatsAppReply({
    to: '201111111111',
    phoneNumberId: 'pnid-eg',
    replyToMessageId: 'msg-4xx',
    text: 'reply',
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 131051 } }), { status: 400 }),
  });

  const serverError = await sendWhatsAppReply({
    to: '201111111111',
    phoneNumberId: 'pnid-eg',
    replyToMessageId: 'msg-5xx',
    text: 'reply',
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 2 } }), { status: 500 }),
  });

  const timeoutResult = await sendWhatsAppReply({
    to: '201111111111',
    phoneNumberId: 'pnid-eg',
    replyToMessageId: 'msg-timeout',
    text: 'reply',
    fetchImpl: async () => {
      throw new DOMException('aborted', 'AbortError');
    },
  });

  assert.equal(badRequest.classification, 'meta_4xx');
  assert.equal(serverError.classification, 'meta_5xx');
  assert.equal(timeoutResult.classification, 'timeout');
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
  setNodeEnv('development');
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

test('webhook schedules detached lifecycle processing and acknowledges first', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_APP_SECRET = 'dev-secret';
  process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  const queuedTasks: Array<() => Promise<void>> = [];
  __setWebhookBackgroundSchedulerForTests((task) => {
    queuedTasks.push(task);
  });

  try {
    const rawBody = JSON.stringify(makeValidPayload('msg-lifecycle-1', 'pnid-eg'));
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
        acknowledged: boolean;
        detachedProcessing: boolean;
        processedCount: number;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.acknowledged, true);
    assert.equal(body.data.detachedProcessing, true);
    assert.equal(body.data.processedCount, 0);
    assert.equal(queuedTasks.length, 1);

    await queuedTasks[0]();
  } finally {
    __setWebhookBackgroundSchedulerForTests(null);
  }
});