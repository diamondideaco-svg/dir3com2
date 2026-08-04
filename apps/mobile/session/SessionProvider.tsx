import { createContext, type Dispatch, ReactNode, type SetStateAction, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { parseAuthCallbackUrl } from '@/lib/auth/deep-link';
import type { RouteDestination, RouteKey } from '@/navigation/types';
import { getMobileSupabaseClient, mapSessionSnapshot } from '../lib/supabase/client';
import type { SessionSnapshot, SessionStatus } from '@/session/types';

type SignInInput = {
  email: string;
  password: string;
};

type SessionContextValue = {
  status: SessionStatus;
  session: SessionSnapshot;
  errorMessage: string | null;
  authBusy: boolean;
  authActionError: string | null;
  pendingRoute: RouteDestination | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  invalidateSession: (route?: RouteDestination | RouteKey | null) => Promise<void>;
  setPendingRoute: Dispatch<SetStateAction<RouteDestination | null>>;
  retry: () => void;
  getAccessToken: () => string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function toPendingRoute(route?: RouteDestination | RouteKey | null): RouteDestination | null {
  if (!route) {
    return null;
  }

  if (typeof route === 'string') {
    if (route === 'bookingDetail' || route === 'marketplaceCategory' || route === 'marketplaceItem' || route === 'bookingIntent') {
      return null;
    }

    return { key: route };
  }

  return route;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const supabase = getMobileSupabaseClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionSnapshot>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authActionError, setAuthActionError] = useState<string | null>(null);
  const [pendingRoute, setPendingRoute] = useState<RouteDestination | null>(null);
  const invalidatingSessionRef = useRef(false);

  const applySession = (nextSession: SessionSnapshot) => {
    setSession(nextSession);
    setStatus(nextSession ? 'authenticated' : 'unauthenticated');
  };

  const hydrate = async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setSession(null);
        setStatus('error');
        setErrorMessage('Unable to restore mobile session.');
        return;
      }

      applySession(mapSessionSnapshot(data.session));
    } catch {
      setSession(null);
      setStatus('error');
      setErrorMessage('Unable to initialize mobile session.');
    }
  };

  useEffect(() => {
    const handleDeepLink = (url: string) => {
      const callback = parseAuthCallbackUrl(url);
      if (!callback.isSupported) {
        return;
      }

      if (callback.route) {
        setPendingRoute(callback.route);
      }

      if (callback.isAuthCallback) {
        setAuthActionError(null);
      }
    };

    void hydrate();
    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) {
          handleDeepLink(initialUrl);
        }
      })
      .catch(() => undefined);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      applySession(mapSessionSnapshot(nextSession));
      setErrorMessage(null);
    });

    const deepLinkSubscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.unsubscribe();
      deepLinkSubscription.remove();
    };
  }, []);

  const signIn = async (input: SignInInput) => {
    setAuthBusy(true);
    setAuthActionError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        setAuthActionError('Invalid credentials or unavailable sign-in service.');
        return;
      }

      setAuthActionError(null);
    } catch {
      setAuthActionError('Unable to sign in right now.');
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    setAuthActionError(null);
    setPendingRoute(null);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthActionError('Unable to sign out right now.');
      }
    } catch {
      setAuthActionError('Unable to sign out right now.');
    } finally {
      setAuthBusy(false);
    }
  };

  const invalidateSession = async (route?: RouteDestination | RouteKey | null) => {
    if (invalidatingSessionRef.current) {
      return;
    }

    invalidatingSessionRef.current = true;
    setPendingRoute(toPendingRoute(route));
    setAuthActionError('Your session has expired. Please sign in again.');
    applySession(null);

    try {
      await supabase.auth.signOut();
    } catch {
      // The local session is already cleared for safe route transition.
    } finally {
      invalidatingSessionRef.current = false;
    }
  };

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      errorMessage,
      authBusy,
      authActionError,
      pendingRoute,
      signIn,
      signOut,
      invalidateSession,
      setPendingRoute,
      retry: () => {
        void hydrate();
      },
      getAccessToken: () => session?.accessToken ?? null,
    }),
    [status, session, errorMessage, authBusy, authActionError, pendingRoute]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider.');
  }

  return context;
}
