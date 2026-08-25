import { TravelProviderError } from "../errors";
import { mapLiteApiError } from "./errors";
import type { LiteApiErrorBody } from "./types";

type LiteApiSurface = "search" | "booking";
type LiteApiOperation = "search" | "prebook" | "book" | "booking";
type LiteApiRequestOptions = RequestInit & { surface?: LiteApiSurface; operation: LiteApiOperation; timeoutMs?: number; idempotentRead?: boolean };

const SEARCH_ORIGIN = "https://api.liteapi.travel";
const BOOKING_ORIGIN = "https://book.liteapi.travel";

function configuredSearchOrigin(): string {
  const configured = process.env.LITEAPI_API_BASE_URL?.trim() || SEARCH_ORIGIN;
  let url: URL;
  try { url = new URL(configured); } catch { throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "LiteAPI sandbox base URL is invalid."); }
  if (url.protocol !== "https:" || url.origin !== SEARCH_ORIGIN || url.username || url.password) {
    throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "Only the official LiteAPI sandbox-capable API origin is allowed.");
  }
  return url.origin;
}

function getApiKey(): string {
  const key = process.env.LITEAPI_TEST_API_KEY?.trim();
  if (!key || !key.startsWith("sand_")) throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "LiteAPI sandbox credentials are not configured.");
  return key;
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

function isTransient(error: unknown): boolean {
  return error instanceof TravelProviderError && error.retryable;
}

export async function liteApiRequest<T>(path: string, options: LiteApiRequestOptions): Promise<T> {
  const { surface = "search", operation, timeoutMs = 15_000, idempotentRead = false, ...init } = options;
  const origin = surface === "booking" ? BOOKING_ORIGIN : configuredSearchOrigin();
  const url = new URL(path, `${origin}/`).toString();
  const attempts = idempotentRead ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchOnce(url, {
        ...init,
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": getApiKey(), ...(init.headers || {}) },
      }, timeoutMs);
      const text = await response.text();
      let body: unknown = undefined;
      if (text) {
        try { body = JSON.parse(text); }
        catch { throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI returned malformed JSON."); }
      }
      if (!response.ok) throw mapLiteApiError(response.status, (body || {}) as LiteApiErrorBody, operation);
      if (body && typeof body === "object" && "error" in body) {
        const providerError = mapLiteApiError(response.status, body as LiteApiErrorBody, operation);
        if (providerError.code !== "PROVIDER_UNAVAILABLE") throw providerError;
      }
      if (response.status !== 204 && (body === undefined || body === null || typeof body !== "object")) {
        throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI returned an invalid response.");
      }
      return body as T;
    } catch (error) {
      let normalized: unknown = error;
      if (error instanceof DOMException && error.name === "AbortError") normalized = new TravelProviderError("PROVIDER_TIMEOUT", "LiteAPI request timed out.", true);
      else if (!(error instanceof TravelProviderError)) normalized = new TravelProviderError("PROVIDER_UNAVAILABLE", "LiteAPI is temporarily unavailable.", true);
      if (attempt + 1 < attempts && isTransient(normalized)) continue;
      throw normalized;
    }
  }
  throw new TravelProviderError("PROVIDER_UNAVAILABLE", "LiteAPI request failed.", true);
}
