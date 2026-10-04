"use client";
import { DISPLAY_CURRENCIES } from '@/lib/currency/display';
import { useDisplayCurrency } from './useDisplayCurrency';
export default function CurrencySelector({ language, className }: { language: 'ar' | 'en'; className?: string }) {
  const { currency, setCurrency } = useDisplayCurrency();
  return <select className={className} aria-label={language === 'ar' ? 'عملة العرض' : 'Display currency'} value={currency} onChange={event => setCurrency(event.target.value)}>
    {DISPLAY_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
  </select>;
}
