import { TravelProviderError, type TravelErrorCode } from "../errors";
import type { LiteApiErrorBody } from "./types";

function providerMessage(body: LiteApiErrorBody): string {
  return `${body.error?.message || ""} ${body.error?.description || ""}`.trim().toLowerCase();
}

export function mapLiteApiError(status: number, body: LiteApiErrorBody, operation: "search" | "prebook" | "book" | "booking"): TravelProviderError {
  const code = Number(body.error?.code);
  const message = providerMessage(body);
  let normalized: TravelErrorCode = "PROVIDER_UNAVAILABLE";
  let retryable = false;

  if (status === 401 || status === 403 || code === 401 || code === 40302) normalized = "UNAUTHORIZED_VENDOR_ACCESS";
  else if (status === 429 || code === 4290 || code === 4291) { normalized = "PROVIDER_UNAVAILABLE"; retryable = true; }
  else if (code === 4011 || code === 4016 || status === 408) { normalized = "PROVIDER_TIMEOUT"; retryable = true; }
  else if (code === 2001 && operation === "search") normalized = "NO_RESULTS";
  else if (code === 2001 && message.includes("price")) normalized = "PRICE_CHANGED";
  else if (code === 2001 && operation === "prebook") normalized = "OFFER_EXPIRED";
  else if (code === 2001) normalized = "RATE_UNAVAILABLE";
  else if (operation === "book" || code === 2013 || code === 50071) normalized = "BOOKING_FAILED";
  else if (status >= 400 && status < 500) normalized = "INVALID_PROVIDER_RESPONSE";

  return new TravelProviderError(normalized, `LiteAPI ${operation} request failed.`, retryable, status);
}
