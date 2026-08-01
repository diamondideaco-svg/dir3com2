import { getMobileEnv } from '@/lib/env';
import type { MobileApiError, MobileApiResult } from '@/types/result';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ApiClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  getAuthToken?: () => Promise<string | null> | string | null;
};

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeError(error: unknown): MobileApiError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      code: 'timeout',
      message: 'The request timed out. Please try again.',
    };
  }

  if (error instanceof Error) {
    return {
      code: 'network_error',
      message: error.message || 'Network request failed.',
    };
  }

  return {
    code: 'unknown_error',
    message: 'Unknown error occurred.',
  };
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const env = getMobileEnv();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = (options.baseUrl ?? env.apiBaseUrl).replace(/\/$/, '');

  async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<MobileApiResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = options.getAuthToken ? await options.getAuthToken() : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...requestOptions.headers,
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: requestOptions.method ?? 'GET',
        headers,
        body: requestOptions.body !== undefined ? JSON.stringify(requestOptions.body) : undefined,
        signal: requestOptions.signal ?? controller.signal,
      });

      const payload = await parseJsonSafe(response);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `Request failed with status ${response.status}.`;

        return {
          ok: false,
          error: {
            code: 'http_error',
            message,
            status: response.status,
          },
        };
      }

      if (payload === null) {
        return {
          ok: false,
          error: {
            code: 'invalid_response',
            message: 'Invalid JSON response received.',
            status: response.status,
          },
        };
      }

      return {
        ok: true,
        data: payload as T,
      };
    } catch (error) {
      return {
        ok: false,
        error: normalizeError(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    request,
    get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'GET' });
    },
    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'POST', body });
    },
    put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'PUT', body });
    },
    patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'PATCH', body });
    },
    delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
      return request<T>(path, { ...options, method: 'DELETE' });
    },
  };
}

export const mobileApiClient = createApiClient();
