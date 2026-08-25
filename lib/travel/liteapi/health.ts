import type { ProviderProbe } from "../provider-types";
import { TravelProviderError } from "../errors";
import { searchLiteApiHotels } from "./stays";

export type LiteApiHealthStatus = { provider: "liteapi"; auth: ProviderProbe; stays: ProviderProbe };

export async function getLiteApiHealthStatus(): Promise<LiteApiHealthStatus> {
  if (!process.env.LITEAPI_TEST_API_KEY?.startsWith("sand_")) return { provider: "liteapi", auth: { status: "access_blocked", detail: "No LiteAPI sandbox key configured." }, stays: { status: "access_blocked", detail: "Stay search requires sandbox access." } };
  const date = new Date(Date.now() + 120 * 86_400_000);
  const checkIn = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1);
  try {
    await searchLiteApiHotels({ cityName: "Cairo", countryCode: "EG", checkIn, checkOut: date.toISOString().slice(0, 10), occupancies: [{ adults: 2 }], currency: "USD", guestNationality: "EG", maxRatesPerHotel: 1 });
    return { provider: "liteapi", auth: { status: "ok" }, stays: { status: "ok" } };
  } catch (error) {
    const blocked = error instanceof TravelProviderError && error.code === "UNAUTHORIZED_VENDOR_ACCESS";
    return { provider: "liteapi", auth: { status: blocked ? "access_blocked" : "unavailable", detail: "LiteAPI sandbox probe failed." }, stays: { status: blocked ? "access_blocked" : "unavailable", detail: "LiteAPI stay search probe failed." } };
  }
}
