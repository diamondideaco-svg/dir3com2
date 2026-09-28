"use client";
import { useDisplayCurrency, useCurrencyRates } from './useDisplayCurrency';
import { displayPrice } from '@/lib/currency/display';
export default function CurrencyPrice({ amount, sourceCurrency, language }: { amount: number; sourceCurrency: string; language: 'ar' | 'en' }) {
  const { currency } = useDisplayCurrency(); const { snapshot, loading } = useCurrencyRates(currency);
  const price = displayPrice(amount, sourceCurrency, currency, snapshot), ar = language === 'ar';
  return <span data-display-currency={price.currency}><bdi>{price.amount.toLocaleString(ar ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {price.currency}</bdi>
    {price.converted && <small style={{ display: 'block', fontWeight: 400 }}>{ar ? 'تحويل للعرض بتاريخ' : 'Display conversion as of'} {price.asOf}</small>}
    {price.unavailable && <small style={{ display: 'block', fontWeight: 400 }}>{loading ? (ar ? 'جارٍ تحويل العملة…' : 'Converting currency…') : (ar ? 'تعذر التحويل؛ السعر بعملة المصدر.' : 'Conversion unavailable; source currency shown.')}</small>}
  </span>;
}
