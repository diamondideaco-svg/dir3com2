import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'error';

type SessionSnapshot = {
  userId: string;
  email?: string;
} | null;

type SessionContextValue = {
  status: SessionStatus;
  session: SessionSnapshot;
  errorMessage: string | null;
  signInMock: () => void;
  signOut: () => void;
  retry: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function bootstrapSession(): Promise<SessionSnapshot> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), 200);
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionSnapshot>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hydrate = async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const snapshot = await bootstrapSession();
      setSession(snapshot);
      setStatus(snapshot ? 'authenticated' : 'unauthenticated');
    } catch {
      setSession(null);
      setStatus('error');
      setErrorMessage('Unable to initialize session.');
    }
  };

  useEffect(() => {
    void hydrate();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      errorMessage,
      signInMock: () => {
        setSession({ userId: 'mobile-demo-user', email: 'demo@dir3com.com' });
        setStatus('authenticated');
        setErrorMessage(null);
      },
      signOut: () => {
        setSession(null);
        setStatus('unauthenticated');
        setErrorMessage(null);
      },
      retry: () => {
        void hydrate();
      },
    }),
    [status, session, errorMessage]
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
