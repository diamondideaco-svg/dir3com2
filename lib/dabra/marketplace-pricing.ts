import { displayPrice, parseDisplayCurrency, type DisplayCurrency, type FxSnapshot } from '../currency/display';
import type { MarketplaceService } from '../marketplace/data';
import { sortDabraResults, type DabraResultSort } from './travel-commerce-state';

export type DabraPricePolicy = { currency: DisplayCurrency | null; excludedCurrencies: readonly DisplayCurrency[]; snapshot: FxSnapshot | null };
export type DabraDisplayPrice =
  | { kind: 'available'; amount: number; currency: DisplayCurrency; converted: boolean; asOf: string | null; sourceFallback: boolean }
  | { kind: 'on_request' }
  | { kind: 'unavailable' };
type PriceInput = Pick<MarketplaceService, 'basePrice' | 'currency'> & Partial<Pick<MarketplaceService, 'displayPriceAmount' | 'displayCurrency' | 'pricingStatus'>>;

/** Supplier values stay untouched; an unavailable or excluded value is never relabelled. */
export function presentDabraPrice(item: PriceInput, policy: DabraPricePolicy): DabraDisplayPrice {
  if (!Number.isFinite(item.basePrice) || item.basePrice <= 0) return { kind: 'on_request' };
  const source = parseDisplayCurrency(item.currency);
  if (!source) return { kind: 'unavailable' };
  const target = policy.currency && !policy.excludedCurrencies.includes(policy.currency) ? policy.currency : source;
  const converted = displayPrice(item.basePrice, source, target, policy.snapshot);
  if (!converted.unavailable && !policy.excludedCurrencies.includes(parseDisplayCurrency(converted.currency)!)) {
    return { kind: 'available', amount: converted.amount, currency: parseDisplayCurrency(converted.currency)!, converted: converted.converted, asOf: converted.asOf, sourceFallback: false };
  }
  // The marketplace endpoint attests this conversion for this source and target
  // at retrieval. It stays with the fetched result, never the persisted cart.
  const apiTarget = parseDisplayCurrency(item.displayCurrency);
  if (target !== source && apiTarget === target && item.pricingStatus === 'converted' && typeof item.displayPriceAmount === 'number'
    && Number.isFinite(item.displayPriceAmount) && item.displayPriceAmount >= 0 && !policy.excludedCurrencies.includes(target)) {
    return { kind: 'available', amount: item.displayPriceAmount, currency: target, converted: true, asOf: null, sourceFallback: false };
  }
  if (policy.excludedCurrencies.includes(source)) return { kind: 'unavailable' };
  return { kind: 'available', amount: item.basePrice, currency: source, converted: false, asOf: null, sourceFallback: target !== source };
}

export function sortDabraMarketPrices(services: MarketplaceService[], sort: DabraResultSort, policy: DabraPricePolicy) {
  if (sort !== 'price-low' && sort !== 'price-high') return sortDabraResults(services, sort);
  const direction = sort === 'price-low' ? 1 : -1;
  return services.map((service, index) => ({ service, index, price: presentDabraPrice(service, policy) })).sort((a,b) => {
    if (a.price.kind !== 'available') return b.price.kind === 'available' ? 1 : a.index-b.index;
    if (b.price.kind !== 'available') return -1;
    return a.price.currency.localeCompare(b.price.currency) || direction * (a.price.amount-b.price.amount) || a.index-b.index;
  }).map(entry => entry.service);
}

export function summarizeDabraPrices(prices: readonly DabraDisplayPrice[]) {
  if (!prices.length || prices.some(price => price.kind !== 'available')) return { kind: 'unavailable' as const };
  const groups = new Map<DisplayCurrency, number>();
  for (const price of prices) if (price.kind === 'available') groups.set(price.currency, (groups.get(price.currency) ?? 0) + Math.round(price.amount * 100));
  const totals = [...groups.entries()].map(([currency, cents]) => ({ currency, amount: cents / 100 }));
  return totals.length === 1 ? { kind: 'total' as const, ...totals[0] } : { kind: 'mixed' as const, groups: totals };
}
