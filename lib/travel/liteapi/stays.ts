import type { HotelResult, PrebookInput, PrebookResult, StayBooking, StayBookingInput, StayCancellationResult, StayProvider, StayRate, StaySearchInput, StaySearchResult } from "../contracts";
import { TravelProviderError } from "../errors";
import { validateTravelerCounts } from "../traveler-counts";
import { assertLiteApiSandboxMutation } from "../mutation-guards";
import { liteApiRequest } from "./client";
import type { LiteApiHotel, LiteApiRatesResponse } from "./types";

const bookingReplay = new Map<string, Promise<StayBooking>>();

function amount(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

function normalizeSearch(response: LiteApiRatesResponse): StaySearchResult {
  if (!response || !Array.isArray(response.data)) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI returned invalid hotel rates.");
  const metadata = new Map<string, LiteApiHotel>((response.hotels || []).map((hotel) => [hotel.id || hotel.hotelId || "", hotel]));
  const hotels: HotelResult[] = [];
  for (const rawHotel of response.data) {
    if (!rawHotel?.hotelId || !Array.isArray(rawHotel.roomTypes)) continue;
    const hotelData = metadata.get(rawHotel.hotelId);
    const rooms = rawHotel.roomTypes.flatMap((roomType, roomIndex) => {
      if (!roomType?.offerId || !Array.isArray(roomType.rates)) return [];
      const grouped = new Map<string, StayRate[]>();
      for (const rawRate of roomType.rates) {
        const total = rawRate.retailRate?.total?.[0];
        const totalAmount = amount(total?.amount);
        if (!totalAmount || !total?.currency || !rawRate.name) continue;
        const roomId = rawRate.mappedRoomId == null ? `${rawHotel.hotelId}-${roomIndex}` : String(rawRate.mappedRoomId);
        const rates = grouped.get(roomId) || [];
        rates.push({ id: roomType.offerId, provider: "liteapi", roomId, roomName: rawRate.name, boardName: rawRate.boardName, currency: total.currency, totalAmount, refundable: rawRate.cancellationPolicies?.refundableTag === "RFN", cancellationDeadline: rawRate.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime });
        grouped.set(roomId, rates);
      }
      return [...grouped.entries()].map(([id, rates]) => ({ id, name: rates[0]?.roomName || "Room", rates }));
    });
    if (rooms.length) hotels.push({ id: rawHotel.hotelId, provider: "liteapi", name: hotelData?.name, address: hotelData?.address, rating: hotelData?.rating, imageUrl: hotelData?.main_photo || hotelData?.mainPhoto, rooms });
  }
  if (!hotels.length) return { provider: "liteapi", status: "no_results", hotels: [], error: { code: "NO_RESULTS", message: "No LiteAPI hotel rates were available.", retryable: false } };
  return { provider: "liteapi", status: "ok", hotels };
}

function searchBody(input: StaySearchInput): Record<string, unknown> {
  if (!input.checkIn || !input.checkOut || !input.currency || !input.guestNationality || !input.occupancies.length) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Complete stay search criteria are required.");
  if (!input.hotelIds?.length && !(input.cityName && input.countryCode) && !input.iataCode) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A hotel or destination selector is required.");
  let totalAdults = 0;
  let totalChildren = 0;
  for (const occupancy of input.occupancies) {
    const travelers = validateTravelerCounts(occupancy.adults, occupancy.childAges?.length ?? 0);
    totalAdults += travelers.adults;
    totalChildren += travelers.children;
  }
  validateTravelerCounts(totalAdults, totalChildren);
  return { hotelIds: input.hotelIds, cityName: input.cityName, countryCode: input.countryCode, iataCode: input.iataCode, occupancies: input.occupancies.map((entry) => ({ adults: entry.adults, children: entry.childAges })), currency: input.currency, guestNationality: input.guestNationality, checkin: input.checkIn, checkout: input.checkOut, maxRatesPerHotel: input.maxRatesPerHotel ?? 5, refundableRatesOnly: input.refundableOnly, roomMapping: true, includeHotelData: true, sessionId: input.sessionId, timeout: 10 };
}

export async function searchLiteApiHotels(input: StaySearchInput): Promise<StaySearchResult> {
  try {
    const response = await liteApiRequest<LiteApiRatesResponse>("/v3.0/hotels/rates", { method: "POST", operation: "search", idempotentRead: true, body: JSON.stringify(searchBody(input)) });
    return normalizeSearch(response);
  } catch (error) {
    if (error instanceof TravelProviderError && error.code === "NO_RESULTS") return { provider: "liteapi", status: "no_results", hotels: [], error: { code: error.code, message: error.message, retryable: error.retryable } };
    throw error;
  }
}

export async function prebookLiteApiStay(input: PrebookInput): Promise<PrebookResult> {
  assertLiteApiSandboxMutation();
  if (!input.rateId) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A LiteAPI rate id is required.");
  const response = await liteApiRequest<{ data?: Record<string, unknown> }>("/v3.0/rates/prebook", { surface: "booking", method: "POST", operation: "prebook", timeoutMs: 35_000, body: JSON.stringify({ offerId: input.rateId, usePaymentSdk: false }) });
  const data = response?.data;
  if (!data || typeof data.prebookId !== "string") throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI returned an invalid prebook.");
  return { provider: "liteapi", id: data.prebookId, hotelId: typeof data.hotelId === "string" ? data.hotelId : undefined, currency: typeof data.currency === "string" ? data.currency : undefined, totalAmount: amount(data.price), priceChanged: Number(data.priceDifferencePercent || 0) !== 0, cancellationChanged: data.cancellationChanged === true, boardChanged: data.boardChanged === true };
}

function normalizeBooking(response: { data?: Record<string, unknown> }): StayBooking {
  const data = response?.data;
  if (!data || typeof data.bookingId !== "string" || typeof data.status !== "string") throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "LiteAPI returned an invalid booking.");
  const rawStatus = data.status.toLowerCase();
  const status: StayBooking["status"] = rawStatus.includes("cancel") ? "cancelled" : rawStatus === "confirmed" ? "confirmed" : rawStatus.includes("fail") ? "failed" : "pending";
  return { id: data.bookingId, provider: "liteapi", status, clientReference: typeof data.clientReference === "string" ? data.clientReference : undefined, hotelConfirmationCode: typeof data.hotelConfirmationCode === "string" ? data.hotelConfirmationCode : undefined, currency: typeof data.currency === "string" ? data.currency : undefined, totalAmount: amount(data.price) };
}

async function performBooking(input: StayBookingInput): Promise<StayBooking> {
  const guests = input.guests.map((guest, index) => ({ occupancyNumber: guest.occupancyNumber ?? index + 1, firstName: guest.firstName, lastName: guest.lastName, email: guest.email, remarks: guest.remarks }));
  const response = await liteApiRequest<{ data?: Record<string, unknown> }>("/v3.0/rates/book", { surface: "booking", method: "POST", operation: "book", timeoutMs: 35_000, body: JSON.stringify({ prebookId: input.prebookId, clientReference: input.clientReference, holder: { firstName: input.holder.firstName, lastName: input.holder.lastName, email: input.holder.email }, guests, payment: { method: "ACC_CREDIT_CARD" } }) });
  return normalizeBooking(response);
}

export async function createLiteApiTestBooking(input: StayBookingInput): Promise<StayBooking> {
  assertLiteApiSandboxMutation();
  if (!input.prebookId || !input.clientReference || !input.guests.length) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "Prebook, client reference, and guests are required.");
  const existing = bookingReplay.get(input.clientReference);
  if (existing) return existing;
  const request = performBooking(input);
  bookingReplay.set(input.clientReference, request);
  try { return await request; } catch (error) { bookingReplay.delete(input.clientReference); throw error; }
}

export async function getLiteApiBooking(id: string): Promise<StayBooking> {
  if (!id) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A booking id is required.");
  return normalizeBooking(await liteApiRequest<{ data?: Record<string, unknown> }>(`/v3.0/bookings/${encodeURIComponent(id)}`, { surface: "booking", method: "GET", operation: "booking", idempotentRead: true }));
}

export async function cancelLiteApiBooking(id: string): Promise<StayCancellationResult> {
  assertLiteApiSandboxMutation();
  if (!id) throw new TravelProviderError("INVALID_PROVIDER_RESPONSE", "A booking id is required.");
  const response = await liteApiRequest<{ data?: Record<string, unknown> }>(`/v3.0/bookings/${encodeURIComponent(id)}`, { surface: "booking", method: "PUT", operation: "booking", timeoutMs: 20_000 });
  const data = response?.data || {};
  const rawStatus = typeof data.status === "string" ? data.status.toUpperCase() : "CANCELLED";
  return { bookingId: id, provider: "liteapi", status: rawStatus === "CANCELLED_WITH_CHARGES" ? "cancelled_with_charges" : rawStatus === "CANCELLED" ? "cancelled" : "unchanged", refundAmount: amount(data.refundAmount), currency: typeof data.currency === "string" ? data.currency : undefined };
}

export const liteApiStayProvider: StayProvider = { searchHotels: searchLiteApiHotels, getHotelRates: searchLiteApiHotels, prebook: prebookLiteApiStay, createTestBooking: createLiteApiTestBooking, getBooking: getLiteApiBooking, cancelBooking: cancelLiteApiBooking };

export function clearLiteApiBookingReplayForTests(): void { bookingReplay.clear(); }
