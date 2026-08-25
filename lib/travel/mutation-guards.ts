import { TravelProviderError } from "./errors";

export function assertTestModeMutation(): void {
  const environment = process.env.DUFFEL_ENV?.trim().toLowerCase();
  const explicitlyTest = environment === "test" || environment === "sandbox";
  if (!explicitlyTest || process.env.DUFFEL_LIVE_TOKEN) {
    throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "Live booking and payment are forbidden in this POC.");
  }
  if (!process.env.DUFFEL_TEST_TOKEN?.trim() && !process.env.DUFFEL_API_KEY?.trim()) {
    throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "DUFFEL_TEST_TOKEN is required for test booking.");
  }
}

export function assertLiteApiSandboxMutation(): void {
  const environment = process.env.LITEAPI_ENV?.trim().toLowerCase();
  const sandboxKey = process.env.LITEAPI_TEST_API_KEY?.trim();
  const productionConfigured = Boolean(
    process.env.LITEAPI_PRODUCTION_API_KEY ||
    process.env.LITEAPI_LIVE_API_KEY ||
    Object.keys(process.env).some((key) => key.startsWith("NEXT_PUBLIC_") && key.includes("LITEAPI")),
  );

  if (environment !== "sandbox" || productionConfigured) {
    throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "LiteAPI mutations are restricted to an isolated sandbox configuration.");
  }
  if (!sandboxKey || !sandboxKey.startsWith("sand_")) {
    throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "A valid LITEAPI_TEST_API_KEY is required for sandbox mutations.");
  }
}
