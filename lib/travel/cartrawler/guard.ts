import { TravelProviderError } from "../errors";

export function assertCarTrawlerTestMutation() {
  if (process.env.CARTRAWLER_ENV === "live" || process.env.CARTRAWLER_LIVE_TOKEN) throw new TravelProviderError("LIVE_MUTATION_FORBIDDEN", "Live CarTrawler mutations are forbidden.");
  if (!process.env.CARTRAWLER_PARTNER_TOKEN || !process.env.CARTRAWLER_PARTNER_ID || !process.env.CARTRAWLER_API_BASE_URL) throw new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "CarTrawler test credentials are required.");
}