import { NextRequest, NextResponse } from 'next/server';
import { convertCurrency } from '@/lib/currency/service';

const MAX_AMOUNT = 1_000_000_000;

function parseIsoCode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseAmount(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_AMOUNT) return null;
  return numeric;
}

function errorStatus(code: string) {
  if (code === 'invalid_amount' || code === 'unsupported_currency') return 400;
  return 200;
}

export async function GET(request: NextRequest) {
  const from = parseIsoCode(request.nextUrl.searchParams.get('from'));
  const to = parseIsoCode(request.nextUrl.searchParams.get('to'));
  const amount = parseAmount(request.nextUrl.searchParams.get('amount'));

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: 'unsupported_currency', message: 'Currency codes must be ISO 3-letter values.' },
      { status: 400 },
    );
  }

  if (amount === null) {
    return NextResponse.json(
      { ok: false, error: 'invalid_amount', message: 'Amount must be a finite positive value.' },
      { status: 400 },
    );
  }

  const result = await convertCurrency({ amount, sourceCurrency: from, targetCurrency: to });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, quote: result.quote },
      {
        status: errorStatus(result.error),
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  return NextResponse.json(
    { ok: true, quote: result.quote },
    { status: 200, headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' } },
  );
}
