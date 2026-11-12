import { NextRequest } from 'next/server';
import { successfulTaskProductionReplay } from '@/lib/dabra/successful-task-production-replay';
import { readSuccessfulTaskProductionPolicy } from '@/lib/dabra/successful-task-production-policy';
import { successfulTaskReplayResponse } from '@/lib/dabra/successful-task-replay';
/** Preserve the unconfigured synthetic POST boundary. Selection never falls back. */
export async function POST(request: Request) {
  if (readSuccessfulTaskProductionPolicy() == null) return successfulTaskReplayResponse(request);
  return successfulTaskProductionReplay(new NextRequest(request));
}

/** Read proof changes accounting: navigation/prefetch must never perform it. */
export async function GET() {
  return Response.json({ saved: false, error: 'Explicit POST required.' }, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' },
  });
}
