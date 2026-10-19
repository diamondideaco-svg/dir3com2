'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ConversationSession } from '@/lib/dabra/conversation-session';
import { DABRA_ANONYMOUS_SESSION_KEY, anonymousOwnerId, persistenceContextForIdentity, storageKey } from '@/lib/dabra/travel-commerce-state';
import type { DabraIdentityPayload } from '@/lib/dabra/travel-commerce-state';
import { useDisplayCurrency } from '@/components/currency/useDisplayCurrency';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const ConversationContext = createContext<{ session: ConversationSession; boundary: string } | null>(null);

export function DabraConversationProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new ConversationSession());
  const path = usePathname();
  // A route realm can discard context, never confer an admin/partner permission.
  const boundary = (path === '/admin' || path.startsWith('/admin/')) ? 'admin' : (path === '/partner-portal' || path.startsWith('/partner-portal/')) ? 'partner' : (path === '/provider-portal' || path.startsWith('/provider-portal/')) ? 'provider' : 'customer-public';
  const { language } = useLanguage();
  const { currency, setCurrency } = useDisplayCurrency();
  const currencyRef = useRef(currency);
  useEffect(() => { currencyRef.current = currency; }, [currency]);
  useEffect(() => {
    let alive = true;
    let identityRequest: AbortController | null = null;
    const clearPreviousContext = () => {
      const applied = session.continuityCurrency;
      if (applied && currencyRef.current === applied.applied) { currencyRef.current = applied.before; setCurrency(applied.before); }
      const previous = session.getSnapshot().persistence;
      if (previous) {
        try { const storage = previous.storage === 'local' ? window.localStorage : window.sessionStorage; storage.removeItem(storageKey(previous.ownerId, 'context')); storage.removeItem(storageKey(previous.ownerId, 'cart')); } catch { /* Memory is still cleared if storage is unavailable. */ }
      }
    };
    const resolveIdentity = () => {
      clearPreviousContext();
      identityRequest?.abort();
      const controller = new AbortController(); identityRequest = controller;
      const generation = session.invalidate(boundary);
      void (async () => {
        try {
          const response = await fetch('/api/dabra/session-identity', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) });
          if (!response.ok) throw new Error('identity');
          const identity: DabraIdentityPayload = await response.json();
          let anonymousId = '';
          if (identity.identityState === 'anonymous_confirmed' && identity.authenticated === false) {
            anonymousId = window.sessionStorage.getItem(DABRA_ANONYMOUS_SESSION_KEY) ?? '';
            if (!anonymousOwnerId(anonymousId)) { anonymousId = crypto.randomUUID(); window.sessionStorage.setItem(DABRA_ANONYMOUS_SESSION_KEY, anonymousId); }
          }
          if (alive && !controller.signal.aborted) session.resolve(generation, persistenceContextForIdentity(identity, anonymousId));
        } catch { if (alive && !controller.signal.aborted) session.resolve(generation, null); }
      })();
    };
    resolveIdentity();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== 'INITIAL_SESSION') resolveIdentity();
    });
    return () => { alive = false; identityRequest?.abort(); subscription.unsubscribe(); clearPreviousContext(); session.invalidate(boundary); };
  }, [session, boundary, setCurrency]);
  useEffect(() => {
    // Locale changes retain completed text and staged context; only an old-locale in-flight answer is cancelled.
    session.cancel();
  }, [session, language]);
  return <ConversationContext.Provider value={{ session, boundary }}>{children}</ConversationContext.Provider>;
}

export function useDabraConversation() {
  const value = useContext(ConversationContext);
  if (!value) throw new Error('DABRA conversation provider required');
  const snapshot = useSyncExternalStore(value.session.subscribe, value.session.getSnapshot, value.session.getServerSnapshot);
  // Do not render the previous realm's state while the identity effect catches up.
  return { session: value.session, state: snapshot.boundary === value.boundary ? snapshot : value.session.emptySnapshot };
}
