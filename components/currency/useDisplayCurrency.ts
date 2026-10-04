"use client";
import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { parseDisplayCurrency, type DisplayCurrency, type FxSnapshot } from '@/lib/currency/display';
const KEY = 'dir3com-display-currency';
const EVENT = 'dir3com-currency-change';
function readCurrency(): DisplayCurrency {
  const params = new URLSearchParams(window.location.search);
  const query = parseDisplayCurrency(params.get('displayCurrency')) ?? parseDisplayCurrency(params.get('currency'));
  if (query) return query;
  try { return parseDisplayCurrency(localStorage.getItem(KEY)) ?? 'SAR'; } catch { return 'SAR'; }
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener); window.addEventListener('storage', listener); window.addEventListener('popstate', listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener); window.removeEventListener('popstate', listener); };
}
export function setDisplayCurrency(value: string) {
  const currency = parseDisplayCurrency(value); if (!currency) return;
  try { localStorage.setItem(KEY, currency); } catch { /* Session preference still works in the URL. */ }
  const url = new URL(window.location.href); url.searchParams.set('displayCurrency', currency);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event(EVENT));
}
export function useDisplayCurrency() {
  const pathname = usePathname();
  const currency = useSyncExternalStore(subscribe, readCurrency, () => 'SAR' as DisplayCurrency);
  useEffect(() => { try { localStorage.setItem(KEY, readCurrency()); } catch {} }, [pathname, currency]);
  return { currency, setCurrency: setDisplayCurrency };
}
type RatesState = { snapshot: FxSnapshot | null; loading: boolean };
const initial: RatesState = { snapshot: null, loading: true };
let state: RatesState = initial;
let request: Promise<void> | null = null;
let lastAttempt = 0;
const listeners = new Set<() => void>();
function ratesSubscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function loadRates() {
  if (request || (state.snapshot && state.snapshot.expiresAt > Date.now()) || Date.now() - lastAttempt < 30000) return;
  lastAttempt = Date.now();
  request = fetch('/api/currency?rates=1', { signal: AbortSignal.timeout(7000) }).then(r => r.json()).then(payload => {
    state = { snapshot: payload.ok ? payload.snapshot : null, loading: false };
  }).catch(() => { state = { snapshot: null, loading: false }; }).finally(() => { request = null; listeners.forEach(fn => fn()); });
}
export function useCurrencyRates(currency: string) {
  const result = useSyncExternalStore(ratesSubscribe, () => state, () => initial);
  useEffect(() => { loadRates(); }, [currency]);
  return result;
}
