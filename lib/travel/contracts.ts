import type { TravelErrorCode } from "./errors";

export type NormalizedError = { code: TravelErrorCode; message: string; retryable: boolean };

export type FlightSearchInput = { from: string; to: string; departureDate: string; returnDate?: string; cabin?: string; adults?: number };
export type FlightOffer = {
  id: string;
  provider: string;
  origin: string;
  destination: string;
  departureDate?: string;
  expiresAt?: string;
  currency: string;
  totalAmount: string;
  slices: Array<{ origin: string; destination: string; departureAt?: string; arrivalAt?: string; segments: number }>;
};
export type FlightSearchResult = { provider: string; status: "ok" | "no_results" | "blocked" | "unavailable"; offers: FlightOffer[]; error?: NormalizedError };
export type FlightOfferDetails = FlightOffer & { conditions?: { changeable: boolean; refundable: boolean } };
export type FlightOrder = { id: string; provider: string; status: "confirmed" | "pending" | "failed"; bookingReference?: string; totalAmount?: string; currency?: string; error?: NormalizedError };
export type FlightProvider = {
  searchFlights(input: FlightSearchInput): Promise<FlightSearchResult>;
  getFlightOffer(id: string): Promise<FlightOfferDetails>;
  refreshFlightOffer(id: string): Promise<FlightOfferDetails>;
  createFlightBooking(input: { offerId: string; passengers: unknown[]; idempotencyKey?: string }): Promise<FlightOrder>;
  getFlightOrder(id: string): Promise<FlightOrder>;
};

export type StaySearchInput = { location: string; checkIn: string; checkOut: string; rooms?: number; guests?: number };
export type StayOption = { id: string; provider: string; name: string; location: string; currency: string; amount: string };
export type StaySearchResult = { provider: string; status: "blocked" | "ok" | "no_results"; options: StayOption[]; error?: NormalizedError };
export type StayProvider = {
  searchStays(input: StaySearchInput): Promise<StaySearchResult>;
  getStayRates(id: string): Promise<StayOption[]>;
  getStayQuote(id: string): Promise<StayOption>;
  createStayBooking(input: { rateId: string; guests: unknown[] }): Promise<{ id: string; status: "pending" | "confirmed" | "failed"; error?: NormalizedError }>;
};

export type CarSearchInput = { location: string; pickupDate: string; dropoffDate: string };
export type CarOption = { id: string; provider: string; name: string; currency: string; amount: string };
export type CarProvider = {
  searchCars(input: CarSearchInput): Promise<CarOption[]>;
  quoteCar(id: string): Promise<CarOption>;
  createCarBooking(input: { offerId: string; driver: unknown }): Promise<{ id: string; status: "pending" | "confirmed" | "failed"; error?: NormalizedError }>;
  getCancellationCapability(id: string): Promise<{ supported: boolean }>;
};
