import { duffelRequest } from "./client";
import { assertTestModeMutation } from "../mutation-guards";
import { TravelProviderError } from "../errors";
import type { FlightOfferDetails, FlightOrder } from "../contracts";

function mapOffer(raw: any, fallbackId?: string): FlightOfferDetails {
  const slices = Array.isArray(raw?.slices) ? raw.slices : [];
  if (!raw || typeof raw.id !== "string" || !slices.length) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid flight offer.");
  }
  return {
    id: raw.id || fallbackId || "",
    provider: "duffel",
    origin: slices[0]?.origin?.iata_code || "",
    destination: slices[0]?.destination?.iata_code || "",
    departureDate: slices[0]?.departure_date,
    expiresAt: raw.expires_at,
    currency: raw.total_currency || "USD",
    totalAmount: raw.total_amount || "0",
    slices: slices.map((slice: any) => ({
      origin: slice.origin?.iata_code || "",
      destination: slice.destination?.iata_code || "",
      departureAt: slice.segments?.[0]?.departing_at,
      arrivalAt: slice.segments?.at(-1)?.arriving_at,
      segments: Array.isArray(slice.segments) ? slice.segments.length : 0,
    })),
    conditions: { changeable: true, refundable: false },
  };
}

function mapOrder(raw: any): FlightOrder {
  if (!raw || typeof raw.id !== "string") throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Duffel returned an invalid order.");
  const status = raw.booking_reference ? "confirmed" : "pending";
  return { id: raw.id, provider: "duffel", status, bookingReference: raw.booking_reference, totalAmount: raw.total_amount, currency: raw.total_currency };
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

export async function createDuffelFlightBooking(input: { offerId: string; passengers: unknown[]; idempotencyKey?: string }): Promise<FlightOrder> {
  assertTestModeMutation();
  if (!input.offerId || !Array.isArray(input.passengers) || input.passengers.length === 0) {
    throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A flight offer and passenger list are required.");
  }
  const latestOffer = await getDuffelFlightOffer(input.offerId);
  const response = await duffelRequest<{ data: unknown }>("/air/orders", {
    method: "POST",
    headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
    body: JSON.stringify({ data: { selected_offers: [input.offerId], passengers: input.passengers, payments: [{ type: "balance", amount: latestOffer.totalAmount, currency: latestOffer.currency }] } }),
  });
  return mapOrder(response.data);
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
