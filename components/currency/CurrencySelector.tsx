"use client";
import { DISPLAY_CURRENCIES, parseDisplayCurrency } from '@/lib/currency/display';
import { useDisplayCurrency } from './useDisplayCurrency';
import { useOptionalDabraConversationSession } from '@/components/dabra/DabraConversationProvider';
export default function CurrencySelector({ language, className }: { language: 'ar' | 'en'; className?: string }) {
  const { currency, setCurrency } = useDisplayCurrency();
  const session = useOptionalDabraConversationSession();
  return <select className={className} aria-label={language === 'ar' ? 'عملة العرض' : 'Display currency'} value={currency} onChange={event => { const selected = parseDisplayCurrency(event.target.value); if (selected) { session?.selectRequestCurrency(selected); setCurrency(selected); } }}>
    {DISPLAY_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
  </select>;
}
