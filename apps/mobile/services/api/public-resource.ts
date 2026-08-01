import { useEffect, useRef, useState } from 'react';
import type { MobileApiResult } from '@/types/result';

export type PublicResourceStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'refreshing';

export type PublicResourceState<T> = {
  status: PublicResourceStatus;
  data: T | null;
  errorMessage: string | null;
  errorStatus: number | null;
};

type UsePublicResourceOptions<T> = {
  load: (signal: AbortSignal) => Promise<MobileApiResult<T>>;
  isEmpty: (data: T) => boolean;
};

export function usePublicResource<T>({ load, isEmpty }: UsePublicResourceOptions<T>) {
  const [state, setState] = useState<PublicResourceState<T>>({
    status: 'idle',
    data: null,
    errorMessage: null,
    errorStatus: null,
  });

  const activeRequestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  const isEmptyRef = useRef(isEmpty);

  loadRef.current = load;
  isEmptyRef.current = isEmpty;

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
      errorStatus: null,
    }));

    const result = await loadRef.current(controller.signal);

    if (controller.signal.aborted || requestId !== activeRequestRef.current) {
      return;
    }

    if (!result.ok) {
      if (result.error.status === 404) {
        setState({
          status: 'empty',
          data: null,
          errorMessage: result.error.message,
          errorStatus: 404,
        });
        return;
      }

      setState((current) => ({
        status: 'error',
        data: current.data,
        errorMessage: result.error.message,
        errorStatus: result.error.status ?? null,
      }));
      return;
    }

    setState({
      status: isEmptyRef.current(result.data) ? 'empty' : 'success',
      data: result.data,
      errorMessage: null,
      errorStatus: null,
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
