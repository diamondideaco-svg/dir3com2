import type { MarketplaceService } from '@/lib/marketplace/data';

export const DABRA_STORAGE_VERSION = 1;
export const DABRA_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DABRA_ANONYMOUS_SESSION_KEY = 'dir3com-dabra-v1:anonymous-session';

export type DabraPersistedMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type DabraCartItem = Pick<MarketplaceService, 'id' | 'name_ar' | 'basePrice' | 'currency' | 'categoryLabel' | 'href'>;
export type DabraStorageEnvelope<T> = { version: number; expiresAt: number; ownerId: string; value: T };
export type DabraCurrencyTotal = { currency: string; amount: number; itemCount: number };
export type DabraCartTotals = { unified: boolean; currency: string | null; amount: number | null; groups: DabraCurrencyTotal[]; message: string };
export type DabraPersistenceContext = { ownerId: string; storage: 'local' | 'session' };
export type DabraIdentityPayload = { identityState?: string; authenticated?: boolean; userId?: string | null };
export type DabraResultSort = 'recommended' | 'price-low' | 'price-high' | 'comfort' | 'closest';
export type DabraRecommendation = { service: MarketplaceService; badge: 'BEST MATCH' | 'BEST VALUE' | 'PREMIUM'; why: string };

export function recommendationEligible(service: MarketplaceService): boolean {
  return (service.provenance === 'PROVIDER_LIVE' || service.provenance === 'PARTNER_VERIFIED') &&
    service.availability !== 'sold-out' && service.productCount > 0 && service.inventoryCount > 0;
}

export function selectDabraRecommendations(services: MarketplaceService[]): MarketplaceService[] {
  return buildDabraRecommendations(services).map(({ service }) => service);
}

export function buildDabraRecommendations(services: MarketplaceService[]): DabraRecommendation[] {
  const eligible = services.filter(recommendationEligible);
  const selected = new Set<MarketplaceService['id']>();
  const result: DabraRecommendation[] = [];
  const bestMatch = eligible.find((service) => service.recommended);
  if (bestMatch) {
    selected.add(bestMatch.id);
    result.push({ service: bestMatch, badge: 'BEST MATCH', why: 'مطابق لإشارات الترشيح الموثقة في السوق' });
  }
  const priced = eligible.filter((service) => !selected.has(service.id) && service.basePrice > 0 && /^[A-Z]{3}$/.test(service.currency));
  const comparableCurrency = priced.length > 1 && new Set(priced.map((service) => service.currency)).size === 1;
  const bestValue = comparableCurrency ? [...priced].sort((left, right) => left.basePrice - right.basePrice)[0] : undefined;
  if (bestValue) {
    selected.add(bestValue.id);
    result.push({ service: bestValue, badge: 'BEST VALUE', why: 'أقل سعر معروف بين الخيارات المؤهلة المتبقية' });
  }
  const premium = eligible.find((service) => !selected.has(service.id) && service.tags.some((tag) => /^(?:premium|luxury|فاخر|فخامة)$/iu.test(tag.trim())));
  if (premium) result.push({ service: premium, badge: 'PREMIUM', why: 'مصنف كتجربة مميزة أو فاخرة في بيانات السوق' });
  return result;
}

export function sortDabraResults(services: MarketplaceService[], sort: DabraResultSort): MarketplaceService[] {
  const ranked = [...services];
  if (sort === 'price-low') return ranked.sort((left, right) => left.basePrice - right.basePrice);
  if (sort === 'price-high') return ranked.sort((left, right) => right.basePrice - left.basePrice);
  if (sort === 'comfort') return ranked.sort((left, right) => Number(right.popular) - Number(left.popular) || Number(right.featured) - Number(left.featured));
  if (sort === 'closest') return ranked.sort((left, right) => Number(right.tags.some((tag) => /(?:near|close|قريب|وسط|المطار)/iu.test(tag))) - Number(left.tags.some((tag) => /(?:near|close|قريب|وسط|المطار)/iu.test(tag))));
  return ranked.sort((left, right) => Number(right.recommended) - Number(left.recommended) || Number(right.featured) - Number(left.featured));
}

export function applyScopedHotelChange(items: DabraCartItem[], message: string): DabraCartItem[] {
  if (/(?:لا|ما)\s+(?:تغير|غيّر|غير)\s+(?:الفندق|السكن)\s+بس/u.test(message.trim())) return items;
  if (!/(?:غير|غيّر)\s+(?:الفندق|السكن)\s+بس/u.test(message.trim())) return items;
  return items.filter((item) => !/(?:hotel|stay|apartment|فندق|فنادق|شقق|إقامة)/iu.test(`${item.categoryLabel} ${item.href}`));
}

export function missingTripComponents(items: DabraCartItem[]): string[] {
  const joined = items.map((item) => `${item.categoryLabel} ${item.href}`).join(' ');
  const required = [
    { label: 'الرحلة', pattern: /(?:flight|fly|airport-transfer|طيران|رحلة)/iu },
    { label: 'السكن', pattern: /(?:hotel|stay|apartment|فندق|فنادق|شقق|إقامة)/iu },
    { label: 'السيارة', pattern: /(?:car|drive|سيارة|سيارات)/iu },
  ];
  return required.filter(({ pattern }) => !pattern.test(joined)).map(({ label }) => label);
}

export function storageKey(ownerId: string, kind: 'context' | 'cart' | 'favorites'): string {
  return `dir3com-dabra-v${DABRA_STORAGE_VERSION}:${kind}:${encodeURIComponent(ownerId)}`;
}

export function readPersisted<T>(raw: string | null, ownerId: string, validate: (value: unknown) => T | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as DabraStorageEnvelope<unknown>;
    if (envelope.version !== DABRA_STORAGE_VERSION || envelope.ownerId !== ownerId || envelope.expiresAt <= now) return null;
    return validate(envelope.value);
  } catch {
    return null;
  }
}

export function createPersisted<T>(value: T, ownerId: string, now = Date.now()): DabraStorageEnvelope<T> {
  return { version: DABRA_STORAGE_VERSION, expiresAt: now + DABRA_STORAGE_TTL_MS, ownerId, value };
}

export function anonymousOwnerId(sessionId: string): string | null {
  return /^[a-f0-9-]{16,64}$/i.test(sessionId) ? `anonymous:${sessionId}` : null;
}

export function persistenceContextForIdentity(identity: DabraIdentityPayload, anonymousSessionId: string): DabraPersistenceContext | null {
  if (identity.identityState === 'authenticated' && identity.authenticated === true && typeof identity.userId === 'string' && identity.userId) {
    return { ownerId: `user:${identity.userId}`, storage: 'local' };
  }
  const anonymousId = anonymousOwnerId(anonymousSessionId);
  if (identity.identityState === 'anonymous_confirmed' && identity.authenticated === false && anonymousId) {
    return { ownerId: anonymousId, storage: 'session' };
  }
  return null;
}

export function validatePersistedMessages(value: unknown): DabraPersistedMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.slice(-20);
  if (!messages.every((entry) => entry && typeof entry === 'object' &&
    typeof entry.id === 'string' && entry.id.length <= 100 &&
    (entry.role === 'user' || entry.role === 'assistant') &&
    typeof entry.text === 'string' && entry.text.length <= 4000)) return null;
  return messages as DabraPersistedMessage[];
}

export function validatePersistedCart(value: unknown): DabraCartItem[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  if (!value.every((entry) => entry && typeof entry === 'object' &&
    (typeof entry.id === 'string' || typeof entry.id === 'number') &&
    typeof entry.name_ar === 'string' && entry.name_ar.length <= 300 &&
    typeof entry.categoryLabel === 'string' && entry.categoryLabel.length <= 200 &&
    typeof entry.href === 'string' && entry.href.startsWith('/') && entry.href.length <= 500 &&
    typeof entry.basePrice === 'number' && Number.isFinite(entry.basePrice) && entry.basePrice >= 0 &&
    typeof entry.currency === 'string' && entry.currency.length <= 12)) return null;
  return value as DabraCartItem[];
}

export function validatePersistedFavorites(value: unknown): Array<string | number> | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  if (!value.every((entry) => (typeof entry === 'string' && entry.length <= 200) || (typeof entry === 'number' && Number.isFinite(entry)))) return null;
  return value as Array<string | number>;
}

export function calculateCartTotals(items: DabraCartItem[]): DabraCartTotals {
  const groups = new Map<string, DabraCurrencyTotal>();
  let hasUnknownPrice = false;
  for (const item of items) {
    const currency = typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : 'UNKNOWN';
    const current = groups.get(currency) ?? { currency, amount: 0, itemCount: 0 };
    if (!Number.isFinite(item.basePrice) || item.basePrice <= 0) hasUnknownPrice = true;
    else current.amount += item.basePrice;
    current.itemCount += 1;
    groups.set(currency, current);
  }
  const totals = [...groups.values()];
  if (totals.length === 1 && totals[0].currency !== 'UNKNOWN' && !hasUnknownPrice) {
    return { unified: true, currency: totals[0].currency, amount: totals[0].amount, groups: totals, message: `المجموع المعروف ${totals[0].currency}` };
  }
  return { unified: false, currency: null, amount: null, groups: totals, message: hasUnknownPrice || totals.some((group) => group.currency === 'UNKNOWN') ? 'الإجمالي الموحد غير متاح حتى تكتمل بيانات السعر والعملة.' : 'الإجمالي الموحد غير متاح حتى توحّد العملة.' };
}
