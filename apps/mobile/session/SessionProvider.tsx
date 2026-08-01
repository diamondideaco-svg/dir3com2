import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { parseAuthCallbackUrl } from '@/lib/auth/deep-link';
import { getMobileSupabaseClient, mapSessionSnapshot } from '@/lib/supabase/client';
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
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  getAccessToken: () => string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const supabase = getMobileSupabaseClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionSnapshot>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authActionError, setAuthActionError] = useState<string | null>(null);

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
    void hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      applySession(mapSessionSnapshot(nextSession));
      setErrorMessage(null);
    });

    const deepLinkSubscription = Linking.addEventListener('url', (event) => {
      const callback = parseAuthCallbackUrl(event.url);
      if (callback.isAuthCallback) {
        setAuthActionError(null);
      }
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

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      errorMessage,
      authBusy,
      authActionError,
      signIn,
      signOut,
      retry: () => {
        void hydrate();
      },
      getAccessToken: () => session?.accessToken ?? null,
    }),
    [status, session, errorMessage, authBusy, authActionError]
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
