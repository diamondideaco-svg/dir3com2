import { NextResponse } from 'next/server';
import { buildAiFoundationSnapshot } from '@/lib/ai/foundation';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    foundation: buildAiFoundationSnapshot(),
  });
}
