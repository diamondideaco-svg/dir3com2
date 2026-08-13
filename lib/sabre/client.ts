import { clearSabreTokenCache, getSabreAccessToken } from "./auth";

type FetchLike = typeof fetch;
type TokenProvider = () => Promise<string>;

export class SabreProviderError extends Error {
  constructor(public readonly status?: number) {
    super(status ? `Sabre provider request failed with HTTP ${status}.` : "Sabre provider request failed.");
    this.name = "SabreProviderError";
  }
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createSabreRequest(
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchImpl: FetchLike = fetch,
  tokenProvider: TokenProvider = getSabreAccessToken,
  clearToken: () => void = clearSabreTokenCache
) {
  return async function sabreRequest(endpoint: string, options: RequestInit = {}) {
    const url = new URL(endpoint, env.SABRE_API_BASE_URL || "https://api.cert.platform.sabre.com").toString();

    const execute = async (token: string) =>
      fetchWithTimeout(
        fetchImpl,
        url,
        {
          ...options,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...options.headers,
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
        7000
      );

    let response = await execute(await tokenProvider());

    if (response.status === 401) {
      clearToken();
      response = await execute(await tokenProvider());
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new SabreProviderError(response.status);
    }
    if (payload === null) {
      throw new SabreProviderError(response.status);
    }

    return payload;
  };
}

export const sabreRequest = createSabreRequest();
