import type { NextRequest } from 'next/server';
import { successfulTaskConsent } from '@/lib/dabra/successful-task-consent';
export const dynamic = 'force-dynamic';
export const GET = (request: NextRequest) => successfulTaskConsent(request);
export const POST = (request: NextRequest) => successfulTaskConsent(request);
