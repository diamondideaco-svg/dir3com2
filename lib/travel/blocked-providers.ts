import { TravelProviderError } from "./errors";
import type { CarOption, CarProvider, CarSearchInput, StayOption, StayProvider, StaySearchInput } from "./contracts";

const blocked = () => new TravelProviderError("UNAUTHORIZED_VENDOR_ACCESS", "Vendor access is required for this provider capability.");

export const blockedStayProvider: StayProvider = {
  async searchStays(_input: StaySearchInput) { return { provider: "duffel", status: "blocked", options: [], error: { code: "UNAUTHORIZED_VENDOR_ACCESS", message: "Stays vendor access is required.", retryable: false } }; },
  async getStayRates(_id: string): Promise<StayOption[]> { throw blocked(); },
  async getStayQuote(_id: string): Promise<StayOption> { throw blocked(); },
  async createStayBooking(_input) { throw blocked(); },
};

export const blockedCarProvider: CarProvider = {
  async searchCars(_input: CarSearchInput): Promise<CarOption[]> { return []; },
  async quoteCar(_id: string): Promise<CarOption> { throw blocked(); },
  async createCarBooking(_input) { throw blocked(); },
  async getCancellationCapability(_id: string) { throw blocked(); },
};
