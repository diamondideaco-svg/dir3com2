import type { FlightSearchInput, FlightSearchResult, StaySearchInput, StaySearchResult, CarSearchInput, CarOption } from "./contracts";
import { searchDuffelFlights } from "./duffel/search";

export type TravelCapabilities = {
  searchFlights(input: FlightSearchInput): Promise<FlightSearchResult>;
  searchStays(input: StaySearchInput): Promise<StaySearchResult>;
  searchCars(input: CarSearchInput): Promise<CarOption[]>;
  refreshTravelPrice(offerId: string): Promise<unknown>;
};

export const dabraTravelCapabilities: TravelCapabilities = {
  searchFlights: searchDuffelFlights,
  async searchStays() { return { provider: "duffel", status: "blocked", options: [], error: { code: "UNAUTHORIZED_VENDOR_ACCESS", message: "Stays vendor access is required.", retryable: false } }; },
  async searchCars() { return []; },
  async refreshTravelPrice(offerId) { const { refreshDuffelFlightOffer } = await import("./duffel/flights"); return refreshDuffelFlightOffer(offerId); },
};
