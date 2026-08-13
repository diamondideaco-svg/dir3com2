import { NextRequest, NextResponse } from 'next/server';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { authorizePilotUser } from '@/lib/auth/pilot';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
};

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: 'Unauthorized',
    },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      error: 'Forbidden',
    },
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return unauthorizedResponse();
  }

  const decision = await authorizePilotUser(supabase, user.id);
  if (!decision.allowed) {
    return forbiddenResponse();
  }

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

  const response = await buildAI2ChatResponse(message);

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}