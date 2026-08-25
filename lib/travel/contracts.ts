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

export type StayOccupancy = { adults: number; childAges?: number[] };
export type StaySearchInput = {
  checkIn: string;
  checkOut: string;
  occupancies: StayOccupancy[];
  currency: string;
  guestNationality: string;
  hotelIds?: string[];
  cityName?: string;
  countryCode?: string;
  iataCode?: string;
  maxRatesPerHotel?: number;
  refundableOnly?: boolean;
  sessionId?: string;
};
export type StayRate = {
  id: string;
  provider: string;
  roomId?: string;
  roomName: string;
  boardName?: string;
  currency: string;
  totalAmount: string;
  refundable: boolean;
  cancellationDeadline?: string;
};
export type StayRoom = { id: string; name: string; rates: StayRate[] };
export type HotelResult = {
  id: string;
  provider: string;
  name?: string;
  address?: string;
  rating?: number;
  imageUrl?: string;
  rooms: StayRoom[];
};
export type StaySearchResult = {
  provider: string;
  status: "ok" | "no_results" | "blocked" | "unavailable";
  hotels: HotelResult[];
  error?: NormalizedError;
};
export type PrebookInput = { rateId: string };
export type PrebookResult = {
  provider: string;
  id: string;
  hotelId?: string;
  currency?: string;
  totalAmount?: string;
  priceChanged: boolean;
  cancellationChanged: boolean;
  boardChanged: boolean;
};
export type StayGuest = { firstName: string; lastName: string; email: string; occupancyNumber?: number; remarks?: string };
export type StayBookingInput = { prebookId: string; holder: StayGuest; guests: StayGuest[]; clientReference: string };
export type StayBooking = {
  id: string;
  provider: string;
  status: "confirmed" | "pending" | "cancelled" | "failed";
  clientReference?: string;
  hotelConfirmationCode?: string;
  currency?: string;
  totalAmount?: string;
};
export type StayCancellationResult = {
  bookingId: string;
  provider: string;
  status: "cancelled" | "cancelled_with_charges" | "unchanged";
  refundAmount?: string;
  currency?: string;
};
export type StayProvider = {
  searchHotels(input: StaySearchInput): Promise<StaySearchResult>;
  getHotelRates(input: StaySearchInput & { hotelIds: string[] }): Promise<StaySearchResult>;
  prebook(input: PrebookInput): Promise<PrebookResult>;
  createTestBooking(input: StayBookingInput): Promise<StayBooking>;
  getBooking(id: string): Promise<StayBooking>;
  cancelBooking(id: string): Promise<StayCancellationResult>;
};
