import { NextRequest, NextResponse } from 'next/server';
import { DRIVE_OFFERS, vehicleFor, journeyPrice } from '@/lib/drive/catalog';
import { readDriveSearch, validateDriveSearch } from '@/lib/drive/search';
import { convertCurrency } from '@/lib/currency/service';

export async function GET(request: NextRequest) {
  const search = readDriveSearch(request.nextUrl.searchParams);
  const error = validateDriveSearch(search);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const offers = await Promise.all(DRIVE_OFFERS.map(async offer => {
    const price = journeyPrice(offer, search.mode);
    const converted = price.baseAmount === null ? null : await convertCurrency({ amount: price.baseAmount, sourceCurrency: price.currency, targetCurrency: search.currency });
    const validFx = converted?.ok && (converted.quote.source === converted.quote.target || converted.quote.live);
    return { ...offer, vehicle: vehicleFor(offer), price,
      display: validFx ? { amount: converted.quote.convertedAmount, currency: converted.quote.target, asOf: converted.quote.asOf, converted: converted.quote.source !== converted.quote.target }
        : { amount: price.baseAmount, currency: price.currency, asOf: null, converted: false },
      conversionUnavailable: price.baseAmount !== null && search.currency !== price.currency && !validFx };
  }));
  return NextResponse.json({ offers, country: 'EG', timezone: 'Africa/Cairo', total: offers.length }, { headers: { 'Cache-Control': 'no-store' } });
}
