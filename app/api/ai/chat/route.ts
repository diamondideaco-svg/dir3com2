import { NextRequest, NextResponse } from 'next/server';
import { buildControlledChatResponse } from '@/lib/ai/chat';

export const dynamic = 'force-dynamic';

type ChatRequestBody = {
  message?: string;
};

export async function POST(request: NextRequest) {
  let body: ChatRequestBody | null = null;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    body = null;
  }

  const message = body?.message?.trim();

  if (!message) {
    return NextResponse.json(
      {
        error: 'Message is required.',
      },
      { status: 400 },
    );
  }

  const response = buildControlledChatResponse(message);

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}