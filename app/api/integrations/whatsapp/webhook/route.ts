import { after, NextRequest, NextResponse } from 'next/server';
import { detectExternalBlockers } from '@/lib/whatsapp/config';
import { parseInboundMessages, processInboundMessages } from '@/lib/whatsapp/processor';
import { isUsingMemoryIdempotencyStore } from '@/lib/whatsapp/idempotency';
import { verifyWhatsAppSignature } from '@/lib/whatsapp/security';

export const dynamic = 'force-dynamic';

type BackgroundTask = () => Promise<void>;
type BackgroundScheduler = (task: BackgroundTask) => void;

const defaultScheduler: BackgroundScheduler = (task) => {
  try {
    after(task);
  } catch {
    // Keep behavior deterministic in tests/non-request contexts.
    void Promise.resolve().then(task);
  }
};

let backgroundScheduler: BackgroundScheduler = defaultScheduler;

export function __setWebhookBackgroundSchedulerForTests(scheduler: BackgroundScheduler | null) {
  backgroundScheduler = scheduler ?? defaultScheduler;
}

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function canRunUnsignedInCurrentMode() {
  return process.env.NODE_ENV !== 'production';
}

function requiresDurableIdempotency() {
  if (process.env.WHATSAPP_IDEMPOTENCY_REQUIRE_DURABLE === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'production';
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode') || '';
  const challenge = url.searchParams.get('hub.challenge') || '';
  const token = url.searchParams.get('hub.verify_token') || '';

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';

  if (mode === 'subscribe' && challenge && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: privateHeaders(),
    });
  }

  return NextResponse.json(
    {
      error: {
        code: 'WHATSAPP_VERIFY_DENIED',
      },
    },
    {
      status: 403,
      headers: privateHeaders(),
    },
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const blockers = detectExternalBlockers();
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-hub-signature-256');
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || '';

  const hasValidSignature = verifyWhatsAppSignature(rawBody, signatureHeader, appSecret);

  if (!hasValidSignature && !canRunUnsignedInCurrentMode()) {
    return NextResponse.json(
      {
        error: {
          code: 'WHATSAPP_SIGNATURE_INVALID',
        },
      },
      {
        status: 401,
        headers: privateHeaders(),
      },
    );
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      {
        error: {
          code: 'WHATSAPP_PAYLOAD_INVALID',
        },
      },
      {
        status: 400,
        headers: privateHeaders(),
      },
    );
  }

  const messages = parseInboundMessages(payload as Parameters<typeof parseInboundMessages>[0]);

  if (requiresDurableIdempotency() && isUsingMemoryIdempotencyStore()) {
    return NextResponse.json(
      {
        error: {
          code: 'WHATSAPP_IDEMPOTENCY_DEGRADED',
        },
      },
      {
        status: 503,
        headers: privateHeaders(),
      },
    );
  }

  const processed: Awaited<ReturnType<typeof processInboundMessages>> = [];
  let degradedProcessing = false;

  // Process quickly for empty batches; otherwise detach to keep webhook acknowledgment fast.
  if (messages.length === 0) {
    const immediate = await processInboundMessages(messages);
    processed.push(...immediate);
  } else {
    backgroundScheduler(async () => {
      const results = await processInboundMessages(messages);

      const hasDegraded = results.some((item) => item.blockerCode?.startsWith('WHATSAPP_IDEMPOTENCY_DEGRADED'));
      if (hasDegraded) {
        // Keep logs non-sensitive: no phone numbers, message text, or secrets.
        console.error('[whatsapp-webhook] DEGRADED durable idempotency detected during detached processing');
      }
    });
  }

  if (processed.some((item) => item.blockerCode?.startsWith('WHATSAPP_IDEMPOTENCY_DEGRADED'))) {
    degradedProcessing = true;
  }

  if (isUsingMemoryIdempotencyStore()) {
    blockers.push('WHATSAPP_IDEMPOTENCY_MEMORY_FALLBACK_ACTIVE');
  }

  if (degradedProcessing) {
    blockers.push('WHATSAPP_IDEMPOTENCY_DEGRADED');
  }

  return NextResponse.json(
    {
      data: {
        accepted: true,
        acknowledged: true,
        detachedProcessing: messages.length > 0,
        processingMs: Date.now() - startedAt,
        unsignedMode: !hasValidSignature,
        blockers,
        receivedCount: messages.length,
        processedCount: processed.length,
        processed,
      },
    },
    {
      status: 200,
      headers: privateHeaders(),
    },
  );
}
