import { duffelRequest, DuffelApiError, normalizeDuffelError } from "./client";
import { assertTestModeMutation } from "../mutation-guards";
import { TravelProviderError } from "../errors";
import type { FlightOfferDetails, FlightOrder } from "../contracts";

function mapOffer(raw: any, fallbackId?: string): FlightOfferDetails {
  const slices = Array.isArray(raw?.slices) ? raw.slices : [];
  const amount = typeof raw?.total_amount === "string" ? raw.total_amount.trim() : "";
  const currency = typeof raw?.total_currency === "string" ? raw.total_currency.trim().toUpperCase() : "";
  if (!raw || typeof raw.id !== "string" || !slices.length || !/^\d+(?:\.\d+)?$/.test(amount) || Number(amount) <= 0 || !/^[A-Z]{3}$/.test(currency) ||
      slices.some((slice: any) => !slice?.origin?.iata_code || !slice?.destination?.iata_code || !Array.isArray(slice?.segments))) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid flight offer.");
  }
  return {
    id: raw.id || fallbackId || "",
    provider: "duffel",
    origin: slices[0]?.origin?.iata_code || "",
    destination: slices[0]?.destination?.iata_code || "",
    departureDate: slices[0]?.departure_date,
    expiresAt: raw.expires_at,
    currency,
    totalAmount: amount,
    slices: slices.map((slice: any) => ({
      origin: slice.origin?.iata_code || "",
      destination: slice.destination?.iata_code || "",
      departureAt: slice.segments?.[0]?.departing_at,
      arrivalAt: slice.segments?.at(-1)?.arriving_at,
      segments: Array.isArray(slice.segments) ? slice.segments.length : 0,
    })),
    ...(typeof raw?.conditions?.changeable === "boolean" || typeof raw?.conditions?.refundable === "boolean"
      ? { conditions: { changeable: raw.conditions.changeable, refundable: raw.conditions.refundable } }
      : {}),
  };
}

function mapOrder(raw: any): FlightOrder {
  if (!raw || typeof raw.id !== "string") throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid order.");
  const amount = typeof raw.total_amount === "string" ? raw.total_amount.trim() : undefined;
  const currency = typeof raw.total_currency === "string" ? raw.total_currency.trim().toUpperCase() : undefined;
  if ((amount && (!/^\d+(?:\.\d+)?$/.test(amount) || Number(amount) <= 0)) || (currency && !/^[A-Z]{3}$/.test(currency)) || Boolean(amount) !== Boolean(currency)) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid order price.");
  }
  const status: FlightOrder["status"] = raw.cancelled_at || raw.failed_at ? "failed" : raw.booking_reference ? "confirmed" : "pending";
  return { id: raw.id, provider: "duffel", status, bookingReference: typeof raw.booking_reference === "string" ? raw.booking_reference : undefined, totalAmount: amount, currency };
}

export async function getDuffelFlightOffer(id: string): Promise<FlightOfferDetails> {
  if (!id) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Flight offer id is required.");
  const response = await duffelRequest<{ data: unknown }>(`/air/offers/${encodeURIComponent(id)}`);
  return mapOffer(response.data, id);
}

export async function refreshDuffelFlightOffer(id: string): Promise<FlightOfferDetails> {
  // Duffel exposes latest-offer retrieval rather than a separate reprice endpoint.
  return getDuffelFlightOffer(id);
}

export async function createDuffelFlightBooking(input: { offerId: string; passengers: unknown[]; idempotencyKey: string }): Promise<FlightOrder> {
  assertTestModeMutation();
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!input.offerId || !Array.isArray(input.passengers) || input.passengers.length === 0 || !idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A flight offer and passenger list are required.");
  }
  try {
    const latestOffer = await getDuffelFlightOffer(input.offerId);
    const response = await duffelRequest<{ data: unknown }>("/air/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ data: { selected_offers: [input.offerId], passengers: input.passengers, payments: [{ type: "balance", amount: latestOffer.totalAmount, currency: latestOffer.currency }] } }),
    });
    return mapOrder(response.data);
  } catch (error) {
    if (error instanceof DuffelApiError) throw normalizeDuffelError(error);
    throw error;
  }
}

export async function getDuffelFlightOrder(id: string): Promise<FlightOrder> {
  if (!id) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Flight order id is required.");
  const response = await duffelRequest<{ data: unknown }>(`/air/orders/${encodeURIComponent(id)}`);
  return mapOrder(response.data);
}

export async function getDuffelFlightChangeCapability(id: string): Promise<{ supported: boolean }> {
  await getDuffelFlightOffer(id);
  return { supported: false };
}

export const getFlightOffer = getDuffelFlightOffer;
export const refreshFlightOffer = refreshDuffelFlightOffer;
export const createFlightBooking = createDuffelFlightBooking;
export const getFlightOrder = getDuffelFlightOrder;
