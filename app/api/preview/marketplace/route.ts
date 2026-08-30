import { NextResponse } from 'next/server';
import { getRealMarketplacePreview } from '@/lib/marketplace/real-preview';
import type { PreviewCitySelection } from '@/lib/marketplace/real-preview-contract';

export const dynamic = 'force-dynamic';

function defaultStayDates() {
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const defaults = defaultStayDates();
  const requestedCity = url.searchParams.get('city');
  const city: PreviewCitySelection = requestedCity === 'Riyadh' || requestedCity === 'Cairo' ? requestedCity : 'all';
  const checkIn = url.searchParams.get('checkIn') || defaults.checkIn;
  const checkOut = url.searchParams.get('checkOut') || defaults.checkOut;
  const result = await getRealMarketplacePreview({ city, checkIn, checkOut });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}
