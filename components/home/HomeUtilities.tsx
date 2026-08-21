'use client';

import { useEffect, useState } from 'react';
import { FiArrowUpLeft, FiCloud, FiCompass, FiDollarSign, FiMapPin, FiMessageCircle } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const currencies = ['SAR', 'USD', 'EGP', 'EUR', 'AED'] as const;
type Currency = (typeof currencies)[number];

type RuntimeWeather = {
  cityLabel?: string;
  temperature?: number | null;
  condition?: string;
  unit?: 'c' | 'f';
};

type RuntimeResponse = {
  weather?: RuntimeWeather;
};

type CurrencyResponse = {
  ok?: boolean;
  quote?: { convertedAmount?: number; rate?: number; live?: boolean; stale?: boolean };
  error?: string;
};

const copy = {
  ar: {
    eyebrow: 'أدوات الرحلة',
    title: 'معلومات عملية قبل أن تبدأ.',
    description: 'أدوات صغيرة مرتبطة بخدمات dir3com الفعلية، لتخطط بخطوة أوضح.',
    weather: 'الطقس الآن',
    weatherUnavailable: 'الطقس غير متاح حاليًا',
    weatherLoading: 'جارٍ تحميل الطقس...',
    currency: 'محوّل العملات',
    amount: 'المبلغ',
    from: 'من',
    to: 'إلى',
    convert: 'تحويل',
    conversionUnavailable: 'التسعير غير متاح حاليًا',
    live: 'مباشر',
    stale: 'آخر قيمة متاحة',
    map: 'موقع الوجهة',
    mapDescription: 'افتح خريطة الرياض واستكشف نقطة البداية لرحلتك.',
    openMap: 'افتح الخريطة',
    support: 'الدبرة',
    supportDescription: 'مساعد السفر الذكي من dir3com.',
    openSupport: 'اسأل الدبرة',
  },
  en: {
    eyebrow: 'TRAVEL TOOLS',
    title: 'Useful information before you begin.',
    description: 'Small, connected tools to help you plan the next step with dir3com.',
    weather: 'Current weather',
    weatherUnavailable: 'Weather is currently unavailable',
    weatherLoading: 'Loading weather...',
    currency: 'Currency converter',
    amount: 'Amount',
    from: 'From',
    to: 'To',
    convert: 'Convert',
    conversionUnavailable: 'Conversion is currently unavailable',
    live: 'Live',
    stale: 'Latest available value',
    map: 'Destination map',
    mapDescription: 'Open Riyadh in Maps and explore a starting point for your trip.',
    openMap: 'Open map',
    support: 'DABRA Travel Assistant',
    supportDescription: 'dir3com smart travel assistant.',
    openSupport: 'Ask DABRA',
  },
} as const;

function formatTemperature(weather: RuntimeWeather | null, unavailable: string) {
  if (!weather || weather.temperature == null || !weather.cityLabel) return unavailable;
  return `${weather.cityLabel} ${weather.temperature}${weather.unit === 'f' ? '°F' : '°C'}${weather.condition ? ` · ${weather.condition}` : ''}`;
}

export default function HomeUtilities() {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const [weather, setWeather] = useState<RuntimeWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState<Currency>('USD');
  const [to, setTo] = useState<Currency>('SAR');
  const [converted, setConverted] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [conversionState, setConversionState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/runtime?lang=${language}&currency=SAR`, { cache: 'no-store' })
      .then((response) => response.json() as Promise<RuntimeResponse>)
      .then((payload) => {
        if (mounted) setWeather(payload.weather ?? null);
      })
      .catch(() => {
        if (mounted) setWeather(null);
      })
      .finally(() => {
        if (mounted) setWeatherLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [language]);

  async function convert() {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setConversionState('error');
      setConverted(null);
      return;
    }

    setConversionState('loading');
    try {
      const response = await fetch(`/api/currency?from=${from}&to=${to}&amount=${encodeURIComponent(String(numericAmount))}`, { cache: 'no-store' });
      const payload = (await response.json()) as CurrencyResponse;
      if (!response.ok || !payload.quote || typeof payload.quote.convertedAmount !== 'number') throw new Error(payload.error ?? 'conversion_failed');
      setConverted(payload.quote.convertedAmount);
      setRate(typeof payload.quote.rate === 'number' ? payload.quote.rate : null);
      setIsStale(Boolean(payload.quote.stale));
      setConversionState('ready');
    } catch {
      setConverted(null);
      setRate(null);
      setConversionState('error');
    }
  }

  function openDabra() {
    document.querySelector<HTMLButtonElement>('#dibrah > button:last-of-type')?.click();
  }

  return (
    <section className="home-utilities px-4 py-10 sm:px-6 lg:px-10" dir={direction}>
      <div className="mx-auto max-w-[1240px]">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">{t.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--color-navy)] sm:text-4xl">{t.title}</h2>
          <p className="mt-3 text-base leading-8 text-[#5d6672]">{t.description}</p>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-4">
          <article id="home-weather" className="home-utility-card home-utility-card--weather">
            <div className="home-utility-card__icon"><FiCloud /></div>
            <h3>{t.weather}</h3>
            <p className="home-utility-card__value">{weatherLoading ? t.weatherLoading : formatTemperature(weather, t.weatherUnavailable)}</p>
            <span className="home-utility-card__meta">{weather ? (weather.condition ?? '') : ''}</span>
          </article>

          <article id="home-currency" className="home-utility-card home-utility-card--currency lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="home-utility-card__icon"><FiDollarSign /></div>
                <h3>{t.currency}</h3>
              </div>
              {conversionState === 'ready' ? <span className="home-utility-card__status">{isStale ? t.stale : t.live}</span> : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <label className="home-utility-field"><span>{t.amount}</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label={t.amount} /></label>
              <label className="home-utility-field"><span>{t.from}</span><select value={from} onChange={(event) => setFrom(event.target.value as Currency)} aria-label={t.from}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="home-utility-field"><span>{t.to}</span><select value={to} onChange={(event) => setTo(event.target.value as Currency)} aria-label={t.to}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <button type="button" className="home-utility-action" onClick={convert} disabled={conversionState === 'loading'}>{conversionState === 'loading' ? '...' : t.convert}</button>
            </div>
            <p className={`home-utility-card__result ${conversionState === 'error' ? 'home-utility-card__result--error' : ''}`} aria-live="polite">
              {conversionState === 'ready' && converted !== null ? `${converted.toFixed(2)} ${to}${rate ? ` · 1 ${from} = ${rate.toFixed(4)} ${to}` : ''}` : conversionState === 'error' ? t.conversionUnavailable : `${amount || '0'} ${from} → ${to}`}
            </p>
          </article>

          <article id="home-map" className="home-utility-card home-utility-card--maps">
            <div className="home-utility-card__icon"><FiMapPin /></div>
            <h3>{t.map}</h3>
            <p className="home-utility-card__description">{t.mapDescription}</p>
            <a className="home-utility-link" href="https://www.google.com/maps/search/?api=1&query=Riyadh%2C%20Saudi%20Arabia" target="_blank" rel="noreferrer noopener"><FiCompass />{t.openMap}<FiArrowUpLeft /></a>
          </article>
        </div>

        <div className="home-support-card mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--home-gold)]/20 bg-white/75 px-5 py-4 shadow-[0_12px_28px_rgba(88,65,31,0.05)]">
          <div className="flex items-center gap-3"><span className="home-utility-card__icon home-utility-card__icon--small"><FiMessageCircle /></span><div><h3 className="text-sm font-semibold text-[var(--color-navy)]">{t.support}</h3><p className="text-sm text-[#5d6672]">{t.supportDescription}</p></div></div>
          <button type="button" className="home-utility-link" onClick={openDabra}>{t.openSupport}<FiArrowUpLeft /></button>
        </div>
      </div>
    </section>
  );
}
