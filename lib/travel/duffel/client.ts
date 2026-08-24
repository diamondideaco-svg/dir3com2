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

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function duffelRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.DUFFEL_TEST_TOKEN || process.env.DUFFEL_API_KEY;

  if (!token) {
    throw new DuffelAccessBlockedError();
  }

  const baseUrl = process.env.DUFFEL_API_BASE_URL || "https://api.duffel.com";
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
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

  const text = await response.text();

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
