import { NextRequest, NextResponse } from 'next/server';
import { convertCurrency, getCurrencySnapshot } from '@/lib/currency/service';
import { parseDisplayCurrency } from '@/lib/currency/display';
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const headers = { 'Cache-Control': 'no-store' };
  if (q.get('rates') === '1') {
    const snapshot = await getCurrencySnapshot();
    return NextResponse.json({ ok: Boolean(snapshot), snapshot }, { headers });
  }
  const source = parseDisplayCurrency(q.get('from')), target = parseDisplayCurrency(q.get('to'));
  const amount = q.get('amount');
  if (!source || !target || !amount?.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > 1e9)
    return NextResponse.json({ ok: false, error: 'INVALID_CONVERSION' }, { status: 400, headers });
  return NextResponse.json(await convertCurrency({ amount, sourceCurrency: source, targetCurrency: target }), { headers });
}
