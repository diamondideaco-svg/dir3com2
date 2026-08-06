'use client';

import { useCallback, useEffect, useState } from 'react';
import { createAnonymousSessionIdentity, type SessionIdentity } from '@/lib/auth/identity-contract';
import { normalizeSessionIdentityPayload } from '@/lib/auth/session-identity';

interface SessionIdentityState {
  identity: SessionIdentity;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

async function requestSessionIdentity(): Promise<SessionIdentity> {
  const response = await fetch('/api/auth/session-identity', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Session identity request failed (${response.status})`);
  }

  const payload = await response.json();
  return normalizeSessionIdentityPayload(payload);
}

export function useSessionIdentity(): SessionIdentityState {
  const [identity, setIdentity] = useState<SessionIdentity>(createAnonymousSessionIdentity());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const normalizedIdentity = await requestSessionIdentity();
      setIdentity(normalizedIdentity);
    } catch (requestError) {
      setIdentity(createAnonymousSessionIdentity());
      setError(requestError instanceof Error ? requestError.message : 'Unable to read session identity.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialIdentity() {
      try {
        const normalizedIdentity = await requestSessionIdentity();
        if (cancelled) {
          return;
        }
        setIdentity(normalizedIdentity);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        setIdentity(createAnonymousSessionIdentity());
        setError(requestError instanceof Error ? requestError.message : 'Unable to read session identity.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialIdentity();

    return () => {
      cancelled = true;
    };
  }, []);

  return { identity, isLoading, error, refresh };
}
