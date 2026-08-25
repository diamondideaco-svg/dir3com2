import { NextRequest, NextResponse } from 'next/server';
import { buildAI2ChatResponse, type AI2ChatAccountContext, type AI2ChatTurn } from '@/lib/ai2/runtime/chat';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DabraTravelOrchestrator } from '@/lib/ai2/orchestration';
import { TravelProviderError } from '@/lib/travel/errors';

export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
  mode?: 'chat' | 'travel-plan';
};

type AI2RequestIdentity = {
  account?: AI2ChatAccountContext;
  scope?: { ownerId: string; tenantId: string };
};

const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 500;

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

// V7: zero added latency for the anonymous path; only resolves a session (and only a safe display name) when a plausible auth cookie is present.
async function resolveSafeRequestIdentity(request: NextRequest): Promise<AI2RequestIdentity> {
  if (!hasSupabaseSessionCookie(request)) return {};

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [metadata.full_name_ar, metadata.full_name, metadata.name].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    const tenantId = [metadata.tenant_id, metadata.organization_id].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? user.id;
    return {
      account: { displayName: name ? name.trim().slice(0, 60) : null },
      scope: { ownerId: user.id, tenantId: tenantId.slice(0, 128) },
    };
  } catch {
    return {};
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

  const history = sanitizeHistory(body?.history);
  const identity = await resolveSafeRequestIdentity(request);
  if (body?.mode === 'travel-plan' && !identity.scope) {
    return NextResponse.json(
      { error: 'Authentication is required for user-scoped travel planning.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (body?.mode === 'travel-plan' && identity.scope) {
    let travel;
    try {
      travel = await new DabraTravelOrchestrator().orchestrate(message, identity.scope);
    } catch (error) {
      if (error instanceof TravelProviderError && error.code === 'INVALID_TRAVELER_COUNT') {
        return NextResponse.json(
          { error: 'Traveler counts are invalid.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      throw error;
    }
    const response = await buildAI2ChatResponse(message, history, identity.account);
    return NextResponse.json({ ...response, travel }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const response = await buildAI2ChatResponse(message, history, identity.account);
  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
