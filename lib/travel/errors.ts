export type TravelErrorCode =
  | "NO_RESULTS"
  | "PROVIDER_TIMEOUT"
  | "OFFER_EXPIRED"
  | "PRICE_CHANGED"
  | "RATE_UNAVAILABLE"
  | "PAYMENT_DECLINED"
  | "INSUFFICIENT_BALANCE"
  | "BOOKING_PENDING"
  | "BOOKING_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_RESPONSE"
  | "UNAUTHORIZED_VENDOR_ACCESS"
  | "LIVE_MUTATION_FORBIDDEN";

export class TravelProviderError extends Error {
  constructor(
    public readonly code: TravelErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TravelProviderError";
  }
}

export function toTravelProviderError(error: unknown): TravelProviderError {
  if (error instanceof TravelProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new TravelProviderError("PROVIDER_TIMEOUT", "Travel provider request timed out.", true);
  }
  return new TravelProviderError("PROVIDER_UNAVAILABLE", "Travel provider is temporarily unavailable.", true);
}
