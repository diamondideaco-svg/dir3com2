import type { AppLanguage } from '@/lib/i18n/config';

const DEFAULT_USD_TO_SAR_RATE = 3.75;
const MIN_RATE = 0.1;
const MAX_RATE = 100;
const SUPPORTED_CURRENCIES = new Set(['SAR', 'USD']);

export const CURRENCY_STORAGE_KEY = 'dir3com-currency';
export const CURRENCY_COOKIE_NAME = 'dir3com-currency';

export type CurrencyRateSource = 'env' | 'fallback';
export type SupportedCurrency = 'SAR' | 'USD';

export type UsdSarPolicy = {
  baseCurrency: 'SAR';
  quoteCurrency: 'USD';
  rate: number;
  source: CurrencyRateSource;
};

export function normalizeCurrencyPreference(value: unknown): SupportedCurrency {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(normalized) ? (normalized as SupportedCurrency) : 'SAR';
}

function sanitizeRate(raw: string | undefined) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value < MIN_RATE || value > MAX_RATE) return null;
  return Math.round(value * 10000) / 10000;
}

export function resolveUsdSarPolicy(): UsdSarPolicy {
  const envRate = sanitizeRate(process.env.NEXT_PUBLIC_USD_TO_SAR_RATE);

  if (envRate !== null) {
    return {
      baseCurrency: 'SAR',
      quoteCurrency: 'USD',
      rate: envRate,
      source: 'env',
    };
  }

  return {
    baseCurrency: 'SAR',
    quoteCurrency: 'USD',
    rate: DEFAULT_USD_TO_SAR_RATE,
    source: 'fallback',
  };
}

function formatRate(rate: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
}

export function convertAmountByPolicy(amount: number, from: SupportedCurrency, to: SupportedCurrency, policy: UsdSarPolicy) {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;

  if (from === 'SAR' && to === 'USD') {
    return amount / policy.rate;
  }

  if (from === 'USD' && to === 'SAR') {
    return amount * policy.rate;
  }

  return amount;
}

export function formatLocalizedCurrency(amount: number, currency: SupportedCurrency, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function buildUsdSarFxLine(language: AppLanguage, policy: UsdSarPolicy) {
  return `1 USD = ${formatRate(policy.rate, language)} SAR`;
}

export function buildUsdSarSourceLabel(language: AppLanguage, policy: UsdSarPolicy) {
  if (language === 'ar') {
    return policy.source === 'env' ? 'المصدر: إعدادات التشغيل' : 'المصدر: مرجع افتراضي ثابت';
  }

  return policy.source === 'env' ? 'Source: runtime config' : 'Source: fixed fallback reference';
}
