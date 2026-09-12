import { NextResponse } from 'next/server';
import { authorizeProviderProofRequest } from '@/lib/marketplace/provider-proof-mode';
import { runProviderProofSearch } from '@/lib/marketplace/provider-proof';
import type { ProviderProofEnvironment, ProviderProofProvider } from '@/lib/marketplace/provider-proof-mode';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CITY_PATTERN = /^[A-Za-z][A-Za-z .'-]{1,60}$/;

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  if (!authorizeProviderProofRequest(request)) {
    return NextResponse.json({ ok: false, error: 'PROVIDER_PROOF_NOT_AUTHORIZED' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const url = new URL(request.url);
  const environment = (url.searchParams.get('environment') ?? 'sandbox') as ProviderProofEnvironment;
  const destination = (url.searchParams.get('destination') ?? 'Riyadh').trim();
  const departureFrom = (url.searchParams.get('departureFrom') ?? 'Cairo').trim();
  const departureDate = url.searchParams.get('departureDate') ?? undefined;
  const returnDate = url.searchParams.get('returnDate') ?? undefined;
  const checkIn = url.searchParams.get('checkIn') ?? undefined;
  const checkOut = url.searchParams.get('checkOut') ?? undefined;
  const language = url.searchParams.get('language') === 'ar' ? 'ar' : 'en';
  const providers = url.searchParams.getAll('provider').filter((value): value is ProviderProofProvider => value === 'duffel' || value === 'liteapi' || value === 'sabre');

  if (!CITY_PATTERN.test(destination) || !CITY_PATTERN.test(departureFrom)
    || [departureDate, returnDate, checkIn, checkOut].some((value) => value !== undefined && !DATE_PATTERN.test(value))) {
    return NextResponse.json({ ok: false, error: 'INVALID_PROVIDER_PROOF_QUERY' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const results = await runProviderProofSearch({
    environment,
    destination,
    departureFrom,
    departureDate,
    returnDate,
    checkIn,
    checkOut,
    adults: numberParam(url.searchParams.get('adults'), 1, 1, 9),
    children: numberParam(url.searchParams.get('children'), 0, 0, 9),
    language,
    providers: providers.length ? providers : undefined,
  });

  return NextResponse.json({ ok: true, environment, results, retrievedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
