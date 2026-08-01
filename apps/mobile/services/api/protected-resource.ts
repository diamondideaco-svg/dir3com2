import { useEffect, useRef, useState } from 'react';
import type { RouteKey } from '@/navigation/types';
import type { MobileApiResult } from '@/types/result';

export type ProtectedResourceStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'unauthorized' | 'refreshing';

export type ProtectedResourceState<T> = {
  status: ProtectedResourceStatus;
  data: T | null;
  errorMessage: string | null;
};

type UseProtectedResourceOptions<T> = {
  routeKey: RouteKey;
  load: (signal: AbortSignal) => Promise<MobileApiResult<T>>;
  isEmpty: (data: T) => boolean;
  onUnauthorized: (routeKey: RouteKey) => void;
};

function isUnauthorizedResult<T>(result: MobileApiResult<T>) {
  return !result.ok && result.error.status === 401;
}

export function useProtectedResource<T>({ routeKey, load, isEmpty, onUnauthorized }: UseProtectedResourceOptions<T>) {
  const [state, setState] = useState<ProtectedResourceState<T>>({
    status: 'idle',
    data: null,
    errorMessage: null,
  });
  const activeRequestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  const isEmptyRef = useRef(isEmpty);
  const onUnauthorizedRef = useRef(onUnauthorized);

  loadRef.current = load;
  isEmptyRef.current = isEmpty;
  onUnauthorizedRef.current = onUnauthorized;

  const runRequest = async (mode: 'load' | 'refresh') => {
    activeRequestRef.current += 1;
    const requestId = activeRequestRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({
      status: mode === 'refresh' && current.data ? 'refreshing' : 'loading',
      data: current.data,
      errorMessage: null,
    }));

    const result = await loadRef.current(controller.signal);

    if (controller.signal.aborted || requestId !== activeRequestRef.current) {
      return;
    }

    if (!result.ok) {
      if (isUnauthorizedResult(result)) {
        setState((current) => ({
          status: 'unauthorized',
          data: current.data,
          errorMessage: result.error.message,
        }));
        onUnauthorizedRef.current(routeKey);
        return;
      }

      setState((current) => ({
        status: 'error',
        data: current.data,
        errorMessage: result.error.message,
      }));
      return;
    }

    setState({
      status: isEmptyRef.current(result.data) ? 'empty' : 'success',
      data: result.data,
      errorMessage: null,
    });
  };

  useEffect(() => {
    void runRequest('load');

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    state,
    retry: () => {
      void runRequest('load');
    },
    refresh: () => {
      if (state.status === 'loading' || state.status === 'refreshing') {
        return;
      }

      void runRequest('refresh');
    },
  };
}