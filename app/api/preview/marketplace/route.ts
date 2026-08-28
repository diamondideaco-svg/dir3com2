import { NextResponse } from 'next/server';
import { getRealFlightPreview } from '@/lib/marketplace/real-preview';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = (url.searchParams.get('from') || 'RUH').toUpperCase();
  const to = (url.searchParams.get('to') || 'JED').toUpperCase();
  const fallbackDate = new Date();
  fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 30);
  const departureDate = url.searchParams.get('date') || fallbackDate.toISOString().slice(0, 10);
  const language = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const countryCode = url.searchParams.get('country') === 'EG' ? 'EG' : 'SA';
  const result = await getRealFlightPreview({ from, to, departureDate, language, countryCode });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}
