import { TravelProviderError } from "../errors";
export class DuffelAccessBlockedError extends Error {
  constructor(message = "Duffel access is blocked because no valid API token is configured.") {
    super(message);
    this.name = "DuffelAccessBlockedError";
  }
}

export class DuffelApiError extends Error {
  constructor(public readonly status: number, public readonly evidence: unknown) {
    super(`Duffel API failed with HTTP ${status}`);
    this.name = "DuffelApiError";
  }
}

export function normalizeDuffelError(error: DuffelApiError): TravelProviderError {
  const evidence = error.evidence as { errors?: Array<{ code?: string; message?: string }>; error?: { code?: string; message?: string } } | null;
  const providerError = evidence?.errors?.[0] || evidence?.error;
  const providerCode = providerError?.code?.toLowerCase() || "";
  const message = providerError?.message || "Duffel request failed.";
  if (error.status === 401 || error.status === 403) return new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", message, false, error.status);
  if (error.status === 429) return new TravelProviderError("PROVIDER_UNAVAILABLE", message, true, error.status);
  if (providerCode.includes("expired")) return new TravelProviderError("OFFER_EXPIRED", message, false, error.status);
  if (providerCode.includes("price") || providerCode.includes("amount")) return new TravelProviderError("PRICE_CHANGED", message, false, error.status);
  if (providerCode.includes("insufficient") || providerCode.includes("balance")) return new TravelProviderError("INSUFFICIENT_BALANCE", message, false, error.status);
  if (providerCode.includes("payment")) return new TravelProviderError("PAYMENT_DECLINED", message, false, error.status);
  if (providerCode.includes("booking") || providerCode.includes("order")) return new TravelProviderError("BOOKING_FAILED", message, false, error.status);
  return new TravelProviderError("PROVIDER_UNAVAILABLE", message, error.status >= 500, error.status);
}

async function fetchBodyWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function duffelRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const environment = process.env.DUFFEL_ENV?.trim().toLowerCase();
  const explicitTestMode = environment === "test" || environment === "sandbox";
  const testToken = process.env.DUFFEL_TEST_TOKEN?.trim();
  const genericTestToken = explicitTestMode ? process.env.DUFFEL_API_KEY?.trim() : undefined;
  const token = testToken || genericTestToken;

  if (!token) {
    throw new DuffelAccessBlockedError();
  }

  const baseUrl = process.env.DUFFEL_API_BASE_URL || "https://api.duffel.com";
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();

  let result: { response: Response; text: string };
  try {
    result = await fetchBodyWithTimeout(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
      cache: "no-store",
    }, 8000);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TravelProviderError("PROVIDER_TIMEOUT", "Duffel request timed out.", true);
    }
    throw new TravelProviderError("PROVIDER_UNAVAILABLE", "Duffel is unavailable.", true);
  }

  const { response, text } = result;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new DuffelApiError(response.status, data);
  }

  return data as T;
}
