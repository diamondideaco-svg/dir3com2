import { DISPLAY_CURRENCIES, parseDisplayCurrency, type DisplayCurrency, type FxSnapshot } from './display';
export type CurrencyQuote = {
  source: DisplayCurrency; target: DisplayCurrency; amount: number; convertedAmount: number;
  rate: number; roundedTo: number; provider: 'frankfurter' | 'fallback'; asOf: string; live: boolean;
};
export type CurrencyServiceResult = { ok: true; quote: CurrencyQuote } | { ok: false; quote: CurrencyQuote; error: 'FX_UNAVAILABLE' };
const TTL_MS = 10 * 60_000;
let cached: FxSnapshot | null = null;
let inFlight: Promise<FxSnapshot | null> | null = null;
let retryAfter = 0;
// v1 ECB coverage did not include all regional currencies. v2 supplies the full basket.
async function fetchRates(): Promise<FxSnapshot> {
  const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=SAR,EGP,EUR,AED', {
    cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000),
  });
  const rows: unknown = await response.json();
  if (!response.ok || !Array.isArray(rows) || rows.length !== 4) throw new Error('FX_UNAVAILABLE');
  const rates = { USD: 1 } as Record<DisplayCurrency, number>;
  const dates: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('FX_UNAVAILABLE');
    const quote = parseDisplayCurrency(row.quote);
    const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
    const age = Date.now() - Date.parse(date + 'T00:00:00Z');
    if (String(row.base).toUpperCase() !== 'USD' || !quote || quote === 'USD' || rates[quote] !== undefined
      || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || row.rate <= 0
      || !Number.isFinite(age) || age < -86400000 || age > 7 * 86400000) throw new Error('FX_UNAVAILABLE');
    rates[quote] = row.rate; dates.push(date);
  }
  if (DISPLAY_CURRENCIES.some(code => !rates[code])) throw new Error('FX_UNAVAILABLE');
  return { base: 'USD', rates, asOf: dates.sort()[0], expiresAt: Date.now() + TTL_MS, provider: 'frankfurter' };
}
export async function getCurrencySnapshot(): Promise<FxSnapshot | null> {
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (inFlight) return inFlight;
  if (retryAfter > Date.now()) return null;
  inFlight = fetchRates().then(value => { cached = value; retryAfter = 0; return value; })
    .catch(() => { retryAfter = Date.now() + 30_000; return null; }).finally(() => { inFlight = null; });
  return inFlight;
}
export async function convertCurrency(input: { amount: unknown; sourceCurrency: unknown; targetCurrency: unknown; baseCurrency?: unknown }): Promise<CurrencyServiceResult> {
  const amount = typeof input.amount === 'number' ? input.amount : typeof input.amount === 'string' && input.amount.trim() ? Number(input.amount) : NaN;
  const source = parseDisplayCurrency(input.sourceCurrency), target = parseDisplayCurrency(input.targetCurrency);
  const valid = Number.isFinite(amount) && amount >= 0 && source && target;
  const unchanged: CurrencyQuote = { source: source ?? 'USD', target: source ?? 'USD', amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    convertedAmount: Number.isFinite(amount) && amount >= 0 ? amount : 0, rate: 1, roundedTo: 2, provider: 'fallback', asOf: '', live: false };
  if (!valid) return { ok: false, error: 'FX_UNAVAILABLE', quote: unchanged };
  if (source === target) return { ok: true, quote: { ...unchanged, convertedAmount: Math.round((amount + Number.EPSILON) * 100) / 100 } };
  const snapshot = await getCurrencySnapshot();
  if (!snapshot) return { ok: false, error: 'FX_UNAVAILABLE', quote: unchanged };
  const rate = snapshot.rates[target] / snapshot.rates[source];
  if (!Number.isFinite(amount * rate)) return { ok: false, error: 'FX_UNAVAILABLE', quote: unchanged };
  return { ok: true, quote: { source, target, amount, rate, convertedAmount: Math.round((amount * rate + Number.EPSILON) * 100) / 100,
    roundedTo: 2, provider: 'frankfurter', asOf: snapshot.asOf, live: true } };
}
export function getSupportedCurrencies() { return [...DISPLAY_CURRENCIES]; }
export function clearCurrencyCacheForTests() { cached = null; inFlight = null; retryAfter = 0; }
