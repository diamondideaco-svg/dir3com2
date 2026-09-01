import { getSafeErrorDetails } from "@/lib/security/safe-logger";
import { DuffelAccessBlockedError, DuffelApiError } from "./client";
import { searchDuffelFlights } from "./search";
import type { ProviderProbe } from "../provider-types";

export type DuffelHealthStatus = {
  provider: "duffel";
  auth: ProviderProbe;
  flights: ProviderProbe;
  stays: ProviderProbe;
};

export async function getDuffelHealthStatus(): Promise<DuffelHealthStatus> {
  const environment = process.env.DUFFEL_ENV?.trim().toLowerCase();
  const token = (environment === "production" || environment === "live")
    ? process.env.DUFFEL_API_KEY?.trim()
    : process.env.DUFFEL_TEST_TOKEN?.trim() || ((environment === "test" || environment === "sandbox") ? process.env.DUFFEL_API_KEY?.trim() : undefined);

  if (!token) {
    return {
      provider: "duffel",
      auth: { status: "access_blocked", detail: "No Duffel test token configured." },
      flights: { status: "access_blocked", detail: "Flight search requires an active Duffel token." },
      stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
    };
  }

  try {
    const result = await searchDuffelFlights({
      from: "CAI",
      to: "RUH",
      departureDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });

    if (result.status === "blocked") {
      return {
        provider: "duffel",
        auth: { status: "access_blocked", detail: result.error?.message },
        flights: { status: "access_blocked", detail: result.error?.message },
        stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
      };
    }

    if (result.status === "unavailable") {
      return {
        provider: "duffel",
        auth: { status: "unavailable", detail: result.error?.message },
        flights: { status: "unavailable", detail: result.error?.message },
        stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
      };
    }

    return {
      provider: "duffel",
      auth: { status: "ok" },
      flights: { status: "ok" },
      stays: { status: "access_blocked", detail: "Stays adapter remains vendor-access gated." },
    };
  } catch (error) {
    if (error instanceof DuffelAccessBlockedError) {
      return {
        provider: "duffel",
        auth: { status: "access_blocked", detail: error.message },
        flights: { status: "access_blocked", detail: error.message },
        stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
      };
    }

    if (error instanceof DuffelApiError) {
      const mapped = error.status === 401 || error.status === 403 ? "access_blocked" : "unavailable";
      return {
        provider: "duffel",
        auth: { status: mapped, code: String(error.status), detail: "Duffel auth probe failed." },
        flights: { status: mapped, code: String(error.status), detail: "Duffel flight search probe failed." },
        stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
      };
    }

    const safe = getSafeErrorDetails(error);
    return {
      provider: "duffel",
      auth: { status: "unavailable", code: safe.code, detail: safe.message },
      flights: { status: "unavailable", code: safe.code, detail: safe.message },
      stays: { status: "access_blocked", detail: "Stays are not enabled without vendor access." },
    };
  }
}
