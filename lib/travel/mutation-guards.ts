import { TravelProviderError } from "./errors";

export function assertTestModeMutation(): void {
  if (process.env.DUFFEL_LIVE_TOKEN || process.env.DUFFEL_ENV === "live") {
    throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "Live booking and payment are forbidden in this POC.");
  }
  if (!process.env.DUFFEL_TEST_TOKEN) {
    throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "DUFFEL_TEST_TOKEN is required for test booking.");
  }
}
