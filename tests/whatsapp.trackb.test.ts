import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET, POST, __setWebhookBackgroundSchedulerForTests } from '../app/api/integrations/whatsapp/webhook/route';
import {
  __setWhatsAppIdempotencyClientForTests,
  __setWhatsAppIdempotencyNowForTests,
  acquireWebhookEventLease,
} from '../lib/whatsapp/idempotency';
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

type DurableRecord = {
  state: 'processing' | 'completed' | 'retryable_failed' | 'unknown_outcome' | 'permanent_failed';
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  retryAfter: number | null;
  attemptCount: number;
  outboundMessageId: string | null;
  lastErrorCode: string | null;
  expiresAt: number;
};

async function withFakeDurableStore(run: (helpers: { advanceMs: (ms: number) => void }) => Promise<void>) {
  let now = 1_000_000;
  const store = new Map<string, DurableRecord>();
  const ttlMs = 15 * 60 * 1000;
  const leaseMs = 60 * 1000;
  const retryDelayMs = 30 * 1000;
  const unknownDelayMs = 120 * 1000;
  const maxAttempts = 3;

  __setWhatsAppIdempotencyNowForTests(() => now);
  __setWhatsAppIdempotencyClientForTests({
    async rpc(fn, args) {
      const key = String(args.p_event_key || '').trim();
      const owner = String(args.p_lease_owner || '').trim();
      const row = key ? store.get(key) : undefined;

      if (fn === 'acquire_whatsapp_event_lease') {
        if (!row) {
          store.set(key, {
            state: 'processing',
            leaseOwner: owner,
            leaseExpiresAt: now + leaseMs,
            retryAfter: null,
            attemptCount: 1,
            outboundMessageId: null,
            lastErrorCode: null,
            expiresAt: now + ttlMs,
          });
          return { data: { decision: 'acquired', state: 'processing', lease_owner: owner, attempt_count: 1 }, error: null };
        }

        if (row.state === 'completed') {
          return { data: { decision: 'duplicate_completed', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        if (row.state === 'permanent_failed') {
          return { data: { decision: 'permanent_failed', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        if (row.state === 'processing' && row.leaseExpiresAt && row.leaseExpiresAt > now) {
          return { data: { decision: 'duplicate_processing', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        if (row.state === 'retryable_failed' && row.retryAfter && row.retryAfter > now) {
          return { data: { decision: 'retry_wait', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        if (row.state === 'unknown_outcome' && row.retryAfter && row.retryAfter > now) {
          return { data: { decision: 'unknown_wait', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        if (row.attemptCount >= maxAttempts) {
          return { data: { decision: 'retry_exhausted', state: row.state, lease_owner: row.leaseOwner || '', attempt_count: row.attemptCount }, error: null };
        }

        row.state = 'processing';
        row.leaseOwner = owner;
        row.leaseExpiresAt = now + leaseMs;
        row.retryAfter = null;
        row.attemptCount += 1;
        row.lastErrorCode = null;
        row.expiresAt = now + ttlMs;
        return { data: { decision: 'acquired', state: row.state, lease_owner: owner, attempt_count: row.attemptCount }, error: null };
      }

      if (fn === 'complete_whatsapp_event_lease') {
        const outboundMessageId = String(args.p_outbound_message_id || '').trim();
        if (!row || row.leaseOwner !== owner || row.state !== 'processing') {
          return { data: false, error: null };
        }
        row.state = 'completed';
        row.leaseOwner = null;
        row.leaseExpiresAt = null;
        row.retryAfter = null;
        row.outboundMessageId = outboundMessageId;
        row.lastErrorCode = null;
        row.expiresAt = now + ttlMs;
        return { data: true, error: null };
      }

      if (fn === 'fail_whatsapp_event_lease') {
        const failureState = String(args.p_failure_state || '').trim() as DurableRecord['state'];
        const errorCode = String(args.p_error_code || '').trim() || null;
        if (!row || row.leaseOwner !== owner || row.state !== 'processing') {
          return { data: false, error: null };
        }
        row.state = failureState;
        row.leaseOwner = null;
        row.leaseExpiresAt = null;
        row.lastErrorCode = errorCode;
        row.retryAfter =
          failureState === 'retryable_failed'
            ? now + retryDelayMs
            : failureState === 'unknown_outcome'
              ? now + unknownDelayMs
              : null;
        row.expiresAt = now + ttlMs;
        return { data: true, error: null };
      }

      return { data: null, error: { message: 'unknown rpc' } };
    },
  });

  delete process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY;

  try {
    await run({
      advanceMs(ms: number) {
        now += ms;
      },
    });
  } finally {
    __setWhatsAppIdempotencyClientForTests(null);
    __setWhatsAppIdempotencyNowForTests(null);
    process.env.WHATSAPP_IDEMPOTENCY_FORCE_MEMORY = 'true';
  }
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

test('durable lifecycle retries after 5xx and reaches a single successful outbound', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';
  process.env.WHATSAPP_PHONE_NUMBER_ID_SA = 'pnid-sa';

  await withFakeDurableStore(async ({ advanceMs }) => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-5xx', 'pnid-eg'));
    let call = 0;

    const first = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: false, classification: 'meta_5xx', statusCode: 500, errorCode: '2' };
      },
    });

    const immediate = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-should-not-send' };
      },
    });

    advanceMs(31_000);

    const recovered = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-recovered' };
      },
    });

    assert.equal(first[0]?.outboundStatus, 'failed');
    assert.equal(immediate[0]?.outboundStatus, 'skipped');
    assert.equal(recovered[0]?.outboundStatus, 'sent');
    assert.equal(recovered[0]?.outboundMessageId, 'wamid-recovered');
    assert.equal(call, 2);
  });
});

test('durable lifecycle retries after network failure and succeeds later', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  await withFakeDurableStore(async ({ advanceMs }) => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-network', 'pnid-eg'));
    let call = 0;

    await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: false, classification: 'network_error', statusCode: null, errorCode: 'WHATSAPP_OUTBOUND_NETWORK_ERROR' };
      },
    });

    advanceMs(31_000);

    const recovered = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-network-recovered' };
      },
    });

    assert.equal(recovered[0]?.outboundStatus, 'sent');
    assert.equal(call, 2);
  });
});

test('durable lifecycle timeout is ambiguous and does not retry immediately', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  await withFakeDurableStore(async ({ advanceMs }) => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-timeout', 'pnid-eg'));
    let call = 0;

    await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: false, classification: 'timeout', statusCode: null, errorCode: 'WHATSAPP_OUTBOUND_TIMEOUT' };
      },
    });

    const immediate = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-timeout-early' };
      },
    });

    advanceMs(121_000);

    const delayed = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        call += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-timeout-late' };
      },
    });

    assert.equal(immediate[0]?.outboundStatus, 'skipped');
    assert.equal(delayed[0]?.outboundStatus, 'sent');
    assert.equal(call, 2);
  });
});

test('durable lifecycle concurrent duplicate allows only one sender during processing', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  await withFakeDurableStore(async () => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-concurrent', 'pnid-eg'));
    let sendCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const firstPromise = processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        await gate;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-concurrent' };
      },
    });

    const secondPromise = processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-duplicate' };
      },
    });
  release();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    assert.equal(sendCount, 1);
    assert.equal(first[0]?.outboundStatus, 'sent');
    assert.equal(second[0]?.deduplicated, true);
    assert.equal(second[0]?.outboundStatus, 'skipped');
  });
});

test('durable lifecycle completed duplicate is skipped', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  await withFakeDurableStore(async () => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-completed', 'pnid-eg'));
    let sendCount = 0;

    await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-completed' };
      },
    });

    const duplicate = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-duplicate' };
      },
    });

    assert.equal(sendCount, 1);
    assert.equal(duplicate[0]?.deduplicated, true);
    assert.equal(duplicate[0]?.outboundStatus, 'skipped');
  });
});

test('durable lifecycle permanent 4xx does not create retry loop', async () => {
  setNodeEnv('development');
  process.env.WHATSAPP_PHONE_NUMBER_ID_EG = 'pnid-eg';

  await withFakeDurableStore(async ({ advanceMs }) => {
    const messages = parseInboundMessages(makeValidPayload('msg-durable-4xx', 'pnid-eg'));
    let sendCount = 0;

    await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        return { ok: false, classification: 'meta_4xx', statusCode: 400, errorCode: '131026' };
      },
    });

    advanceMs(600_000);

    const duplicate = await processInboundMessages(messages, {
      respondToMessage: () => 'reply',
      sendReply: async () => {
        sendCount += 1;
        return { ok: true, classification: 'sent', statusCode: 200, metaMessageId: 'wamid-should-not-send' };
      },
    });

    assert.equal(sendCount, 1);
    assert.equal(duplicate[0]?.deduplicated, true);
    assert.equal(duplicate[0]?.outboundStatus, 'skipped');
  });
});

test('durable lease expiry allows controlled recovery', async () => {
  setNodeEnv('development');

  await withFakeDurableStore(async ({ advanceMs }) => {
    const first = await acquireWebhookEventLease('wa:lease-expiry');
    advanceMs(61_000);
    const second = await acquireWebhookEventLease('wa:lease-expiry');

    assert.equal(first.isNew, true);
    assert.equal(second.isNew, true);
    assert.notEqual(first.leaseOwner, second.leaseOwner);
    assert.equal(second.attemptCount, 2);
  });
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