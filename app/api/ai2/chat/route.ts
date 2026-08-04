import { NextRequest, NextResponse } from 'next/server';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
};

export async function POST(request: NextRequest) {
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

  const response = buildAI2ChatResponse(message);

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}