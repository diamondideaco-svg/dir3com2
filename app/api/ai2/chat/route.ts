import { NextRequest, NextResponse } from 'next/server';
import { buildAI2ChatResponse, type AI2ChatAccountContext, type AI2ChatTurn } from '@/lib/ai2/runtime/chat';
import { estimatePublicAIUsageUnits, publicAIAbuseGuard } from '@/lib/security/public-ai-abuse';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
};

const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 2_000;

function sanitizeHistory(raw: AI2ChatRequest['history']): AI2ChatTurn[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is { role: string; content: string } =>
      Boolean(entry) && (entry?.role === 'user' || entry?.role === 'assistant') && typeof entry?.content === 'string' && entry.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({ role: entry.role as AI2ChatTurn['role'], content: entry.content.trim().slice(0, MAX_TURN_LENGTH) }));
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes('auth-token') || cookie.name.startsWith('sb-'));
}

function getRequestIdentity(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'anonymous';
}

// V7: zero added latency for the anonymous path; only resolves a session (and only a safe display name) when a plausible auth cookie is present.
async function resolveSafeAccountContext(request: NextRequest): Promise<AI2ChatAccountContext | undefined> {
  if (!hasSupabaseSessionCookie(request)) return undefined;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return undefined;

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [metadata.full_name_ar, metadata.full_name, metadata.name].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return { displayName: name ? name.trim().slice(0, 60) : null };
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  // Public floating DABRA chat: no auth/pilot lookup on this hot path, general
  // conversational inference must never require pilot authorization.
  let body: AI2ChatRequest | null = null;

  try {
    body = (await request.json()) as AI2ChatRequest;
  } catch {
    body = null;
  }

  const message = body?.message?.trim();

  if (!message) {
    return NextResponse.json(
      {
        error: 'Message is required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: 'Message is too long.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const history = sanitizeHistory(body?.history);
  const identity = getRequestIdentity(request);
  const usageUnits = estimatePublicAIUsageUnits(message.length, history.length);
  const admission = publicAIAbuseGuard.acquire(identity, usageUnits);

  if (!admission.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      },
    );
  }

  try {
    const account = await resolveSafeAccountContext(request);
    const response = await buildAI2ChatResponse(message, history, account);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    publicAIAbuseGuard.release(identity);
  }
}