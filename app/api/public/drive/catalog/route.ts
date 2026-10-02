import { NextResponse } from 'next/server';
import { publicDriveCatalog } from '@/lib/drive/public-catalog';

export const dynamic = 'force-dynamic';

/** Date-free catalogue browsing. No auth, booking, customer data or provider calls. */
export function GET() {
  return NextResponse.json(publicDriveCatalog(), {headers: {'Cache-Control': 'no-store'}});
}
