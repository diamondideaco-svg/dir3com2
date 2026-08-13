import { getSafeErrorDetails } from "@/lib/security/safe-logger";
import { TravelportAuthError, getTravelportAccessToken } from "./auth";
import { TravelportApiError } from "./client";
import { searchTravelportFlights } from "./search";
import { testTravelportHotels } from "./hotel";

type EndpointStatus = "ok" | "entitlement_blocked" | "unavailable";

type ProbeResult = {
  status: EndpointStatus;
  code?: string;
  detail?: string;
};

export type TravelportHealthStatus = {
  provider: "travelport";
  authReachable: boolean;
  flights: ProbeResult;
  stays: ProbeResult;
};

function inspectTravelportEvidence(error: unknown): ProbeResult {
  if (!(error instanceof TravelportApiError)) {
    return { status: "unavailable" };
  }

  const evidence = error.evidence as { code?: unknown; message?: unknown; errors?: unknown } | null;
  const code =
    typeof evidence?.code === "string"
      ? evidence.code
      : Array.isArray(evidence?.errors) && evidence?.errors[0] && typeof (evidence.errors[0] as Record<string, unknown>).code === "string"
        ? String((evidence.errors[0] as Record<string, unknown>).code)
        : undefined;

  if (error.status === 401 || code === "1012100") {
    return { status: "entitlement_blocked", code: "1012100", detail: "Flights entitlement blocked" };
  }

  if (error.status === 403 || code === "2500") {
    return { status: "entitlement_blocked", code: "2500", detail: "Stays entitlement blocked" };
  }

  return { status: "unavailable", code };
}

export async function getTravelportHealthStatus(): Promise<TravelportHealthStatus> {
  let authReachable = false;

  try {
    await getTravelportAccessToken();
    authReachable = true;
  } catch (error) {
    if (error instanceof TravelportAuthError) {
      return {
        provider: "travelport",
        authReachable: false,
        flights: { status: "unavailable" },
        stays: { status: "unavailable" },
      };
    }

    const safe = getSafeErrorDetails(error);
    return {
      provider: "travelport",
      authReachable: false,
      flights: { status: "unavailable", code: safe.code },
      stays: { status: "unavailable", code: safe.code },
    };
  }

  let flights: ProbeResult = { status: "ok" };
  let stays: ProbeResult = { status: "ok" };

  try {
    await searchTravelportFlights();
  } catch (error) {
    flights = inspectTravelportEvidence(error);
  }

  try {
    await testTravelportHotels();
  } catch (error) {
    stays = inspectTravelportEvidence(error);
  }

  return {
    provider: "travelport",
    authReachable,
    flights,
    stays,
  };
}