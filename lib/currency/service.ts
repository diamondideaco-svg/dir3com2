type SupportedCurrency = "SAR" | "EGP" | "USD" | "EUR" | "AED";

export type CurrencyQuote = {
  source: SupportedCurrency;
  target: SupportedCurrency;
  amount: number;
  convertedAmount: number;
  rate: number;
  roundedTo: number;
  provider: "frankfurter" | "fallback";
  asOf: string;
  live: boolean;
};

export type CurrencyServiceResult =
  | { ok: true; quote: CurrencyQuote }
  | { ok: false; quote: CurrencyQuote; error: "FX_UNAVAILABLE" };

const SUPPORTED: SupportedCurrency[] = ["SAR", "EGP", "USD", "EUR", "AED"];
const SUPPORTED_SET = new Set<SupportedCurrency>(SUPPORTED);
const DEFAULT_BASE: SupportedCurrency = "USD";
const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 4_000;

type CacheRecord = {
  expiresAt: number;
  asOf: string;
  base: SupportedCurrency;
  rates: Record<SupportedCurrency, number>;
  provider: "frankfurter" | "fallback";
  live: boolean;
};

let cache: CacheRecord | null = null;

const FALLBACK_USD_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  SAR: 3.75,
  AED: 3.67,
  EGP: 48,
  EUR: 0.92,
};

function sanitizeCurrency(value: unknown): SupportedCurrency | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase() as SupportedCurrency;
  return SUPPORTED_SET.has(normalized) ? normalized : null;
}

function normalizeAmount(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildFallback(base: SupportedCurrency): CacheRecord {
  const baseRate = FALLBACK_USD_RATES[base] || 1;
  const rates = SUPPORTED.reduce<Record<SupportedCurrency, number>>((acc, currency) => {
    acc[currency] = FALLBACK_USD_RATES[currency] / baseRate;
    return acc;
  }, {} as Record<SupportedCurrency, number>);

  return {
    base,
    rates,
    provider: "fallback",
    live: false,
    asOf: new Date().toISOString(),
    expiresAt: Date.now() + TTL_MS,
  };
}

async function fetchRates(base: SupportedCurrency): Promise<CacheRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const symbols = SUPPORTED.join(",");
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${symbols}`;
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    const payload = (await response.json().catch(() => null)) as { rates?: Record<string, unknown>; date?: unknown } | null;
    if (!response.ok || !payload || typeof payload.rates !== "object" || payload.rates === null) {
      throw new Error("provider_error");
    }

    const rates = SUPPORTED.reduce<Record<SupportedCurrency, number>>((acc, currency) => {
      if (currency === base) {
        acc[currency] = 1;
        return acc;
      }
      const raw = payload.rates?.[currency];
      const rate = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("malformed_rates");
      }
      acc[currency] = rate;
      return acc;
    }, {} as Record<SupportedCurrency, number>);

    return {
      base,
      rates,
      provider: "frankfurter",
      live: true,
      asOf: typeof payload.date === "string" ? payload.date : new Date().toISOString(),
      expiresAt: Date.now() + TTL_MS,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getRates(base: SupportedCurrency): Promise<CacheRecord> {
  if (cache && cache.base === base && cache.expiresAt > Date.now()) {
    return cache;
  }

  try {
    cache = await fetchRates(base);
    return cache;
  } catch {
    cache = buildFallback(base);
    return cache;
  }
}

export async function convertCurrency(input: {
  amount: unknown;
  sourceCurrency: unknown;
  targetCurrency: unknown;
  baseCurrency?: unknown;
}): Promise<CurrencyServiceResult> {
  const amount = normalizeAmount(input.amount);
  const source = sanitizeCurrency(input.sourceCurrency);
  const target = sanitizeCurrency(input.targetCurrency);
  const base = sanitizeCurrency(input.baseCurrency) ?? DEFAULT_BASE;

  if (amount === null || !source || !target) {
    return {
      ok: false,
      error: "FX_UNAVAILABLE",
      quote: {
        source: DEFAULT_BASE,
        target: DEFAULT_BASE,
        amount: 0,
        convertedAmount: 0,
        rate: 1,
        roundedTo: 2,
        provider: "fallback",
        asOf: new Date().toISOString(),
        live: false,
      },
    };
  }

  if (source === target) {
    return {
      ok: true,
      quote: {
        source,
        target,
        amount,
        convertedAmount: roundMoney(amount),
        rate: 1,
        roundedTo: 2,
        provider: "fallback",
        asOf: new Date().toISOString(),
        live: false,
      },
    };
  }

  const rates = await getRates(base);
  const sourceToBase = source === base ? 1 : 1 / rates.rates[source];
  const targetFromBase = target === base ? 1 : rates.rates[target];
  const rate = sourceToBase * targetFromBase;
  const convertedAmount = roundMoney(amount * rate);

  const quote: CurrencyQuote = {
    source,
    target,
    amount,
    convertedAmount,
    rate,
    roundedTo: 2,
    provider: rates.provider,
    asOf: rates.asOf,
    live: rates.live,
  };

  if (!rates.live) {
    return { ok: false, error: "FX_UNAVAILABLE", quote };
  }

  return { ok: true, quote };
}

export function getSupportedCurrencies(): SupportedCurrency[] {
  return [...SUPPORTED];
}

export function clearCurrencyCacheForTests() {
  cache = null;
}