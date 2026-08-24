import { duffelRequest, DuffelAccessBlockedError, DuffelApiError } from "./client";
import { TravelProviderError } from "../errors";
import type { FlightOffer, FlightSearchInput, FlightSearchResult } from "../contracts";

export type SearchDuffelFlightsInput = FlightSearchInput;

function normalizeOffer(raw: any): FlightOffer {
  const amount = typeof raw?.total_amount === "string" ? raw.total_amount : "0";
  const currency = typeof raw?.total_currency === "string" ? raw.total_currency : "USD";
  const slices = Array.isArray(raw?.slices) ? raw.slices : [];
  const firstSlice = slices[0] ?? {};
  const origin = typeof firstSlice?.origin?.iata_code === "string" ? firstSlice.origin.iata_code : "";
  const destination = typeof firstSlice?.destination?.iata_code === "string" ? firstSlice.destination.iata_code : "";

  if (typeof raw?.id !== "string" || !origin || !destination) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid flight offer.");
  return {
    id: raw.id,
    provider: "duffel",
    origin,
    destination,
    departureDate: typeof firstSlice?.departure_date === "string" ? firstSlice.departure_date : undefined,
    currency,
    totalAmount: amount,
    expiresAt: typeof raw?.expires_at === "string" ? raw.expires_at : undefined,
    slices: slices.map((slice: any) => ({
      origin: slice?.origin?.iata_code || "",
      destination: slice?.destination?.iata_code || "",
      departureAt: slice?.segments?.[0]?.departing_at,
      arrivalAt: slice?.segments?.at(-1)?.arriving_at,
      segments: Array.isArray(slice?.segments) ? slice.segments.length : 0,
    })),
  };
}

export async function searchDuffelFlights(input: SearchDuffelFlightsInput): Promise<FlightSearchResult> {
  const payload = {
    data: {
      slices: [
        {
          origin: input.from,
          destination: input.to,
          departure_date: input.departureDate,
        },
        ...(input.returnDate ? [{ origin: input.to, destination: input.from, departure_date: input.returnDate }] : []),
      ],
      passengers: Array.from({ length: Math.max(1, input.adults ?? 1) }, () => ({ type: "adult" })),
      cabin_class: input.cabin ?? "economy",
      max_offers: 10,
    },
  };

  try {
    const response = await duffelRequest<{ data?: any[] }>("/air/offer_requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const items = Array.isArray(response.data) ? response.data : [];
    const offers = items.map((item) => normalizeOffer(item));

    return {
      provider: "duffel",
      status: offers.length ? "ok" : "no_results",
      offers,
      ...(offers.length ? {} : { error: { code: "NO_RESULTS" as const, message: "No flights matched the request.", retryable: false } }),
    };
  } catch (error) {
    if (error instanceof DuffelAccessBlockedError) {
      return {
        provider: "duffel",
        status: "blocked",
        offers: [],
      };
    }

    if (error instanceof DuffelApiError) {
      const evidence = error.evidence as { error?: { code?: string; message?: string } } | null;
      const code = typeof evidence?.error?.code === "string" ? evidence.error.code : undefined;
      const detail = typeof evidence?.error?.message === "string" ? evidence.error.message : undefined;

      return {
        provider: "duffel",
        status: error.status === 401 || error.status === 403 ? "blocked" : "unavailable",
        offers: [],
        error: {
          code: error.status === 401 || error.status === 403 ? "UNAUTHORIZED_VENDOR_ACCESS" : "PROVIDER_UNAVAILABLE",
          message: detail || "Duffel flight search failed.",
          retryable: error.status >= 500,
        },
      };
    }

    throw error instanceof TravelProviderError ? error : new TravelProviderError("PROVIDER_UNAVAILABLE", "Duffel flight search failed.", true);
  }
}

export const searchFlights = searchDuffelFlights;
