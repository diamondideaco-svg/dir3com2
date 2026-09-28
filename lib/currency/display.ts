export const DISPLAY_CURRENCIES = ['SAR', 'USD', 'EGP', 'EUR', 'AED'] as const;
export type DisplayCurrency = typeof DISPLAY_CURRENCIES[number];
export type FxSnapshot = { base: 'USD'; rates: Record<DisplayCurrency, number>; asOf: string; expiresAt: number; provider: 'frankfurter' };
export function parseDisplayCurrency(value: unknown): DisplayCurrency | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return DISPLAY_CURRENCIES.includes(code as DisplayCurrency) ? code as DisplayCurrency : null;
}
export function displayPrice(amount: number, sourceCurrency: string, targetCurrency: string, snapshot?: FxSnapshot | null) {
  const source = parseDisplayCurrency(sourceCurrency), target = parseDisplayCurrency(targetCurrency);
  if (source && target && source === target) return { amount, currency: source, converted: false, unavailable: false, asOf: null };
  if (source && target && snapshot && snapshot.expiresAt > Date.now() && Number.isFinite(snapshot.rates[source]) && snapshot.rates[source] > 0 && Number.isFinite(snapshot.rates[target]) && snapshot.rates[target] > 0) {
    const value = amount * snapshot.rates[target] / snapshot.rates[source];
    if (Number.isFinite(value)) return { amount: Math.round((value + Number.EPSILON) * 100) / 100, currency: target, converted: true, unavailable: false, asOf: snapshot.asOf };
  }
  return { amount, currency: sourceCurrency, converted: false, unavailable: sourceCurrency !== targetCurrency, asOf: null };
}
