'use client';

import { useOptionalDabraConversationSession } from '@/components/dabra/DabraConversationProvider';
import { parseDisplayCurrency } from '@/lib/currency/display';
import { useDisplayCurrency } from './useDisplayCurrency';

/** User-operated selectors only; saved or programmatic currency changes use the base hook. */
export function useExplicitDisplayCurrency() {
  const { currency, setCurrency } = useDisplayCurrency();
  const session = useOptionalDabraConversationSession();
  return { currency, setCurrency: (value: string) => {
    const selected = parseDisplayCurrency(value);
    if (!selected) return;
    session?.selectRequestCurrency(selected);
    setCurrency(selected);
  } };
}
