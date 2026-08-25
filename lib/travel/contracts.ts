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
export type FlightOfferDetails = FlightOffer & { conditions?: { changeable?: boolean; refundable?: boolean } };
export type FlightOrder = { id: string; provider: string; status: "confirmed" | "pending" | "failed"; bookingReference?: string; totalAmount?: string; currency?: string; error?: NormalizedError };
export type FlightProvider = {
  searchFlights(input: FlightSearchInput): Promise<FlightSearchResult>;
  getFlightOffer(id: string): Promise<FlightOfferDetails>;
  refreshFlightOffer(id: string): Promise<FlightOfferDetails>;
  createFlightBooking(input: { offerId: string; passengers: unknown[]; idempotencyKey: string }): Promise<FlightOrder>;
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

export type VipDataSource = "synthetic_test_placeholder" | "partner_verified";
export type VipVerificationStatus = "UNVERIFIED" | "VERIFIED";
export type VipServiceType = "DIR3 VIP";
export type VipAvailabilityStatus = "available" | "unavailable" | "pending_partner_response";
export type VipPartnerConfig = {
  partnerId: string; legalName: string; displayName: string; country: "EG"; coverage: string[];
  serviceCategories: VipServiceType[]; operatingHours: string; responseSlaMinutes: number;
  bookingMethod: "partner_portal_confirmation" | "admin_confirmed_request";
  cancellationPolicy: string; amendmentPolicy: string; pricingModel: "fixed_test_fixture" | "request_quote"; basePrice: number; perPassengerPrice: number;
  settlementModel: string; currency: "EGP"; taxAndFees: string; minimumLeadTimeHours: number;
  quoteValidityMinutes: number; operationalContact: string; escalationContact: string;
  status: "ACTIVE_TEST_ONLY" | "INACTIVE"; source: VipDataSource; verificationStatus: VipVerificationStatus;
};
export type VipSearchInput = { cityOrLocation: string; dateTime: string; passengerCount: number; serviceType?: VipServiceType };
export type VipOffer = {
  id: string; partnerId: string; serviceType: VipServiceType; cityOrLocation: string; airport?: string;
  dateTime: string; passengerCount: number; inclusions: string[]; exclusions: string[]; currency: "EGP";
  price: string; taxAndFees: string; cancellationTerms: string; minimumLeadTimeHours: number;
  providerReference: string; availabilityStatus: VipAvailabilityStatus; source: VipDataSource;
  verificationStatus: VipVerificationStatus;
};
export type VipSearchResult = { provider: string; status: "ok" | "no_results" | "blocked"; offers: VipOffer[]; error?: NormalizedError };
export type VipQuote = VipOffer & { quoteId: string; version: number; expiresAt: string; changed: boolean };
export type VipBooking = {
  quoteId: string; bookingReference: string; customerMetadata: Record<string, string>;
  serviceMetadata: Record<string, string>; partnerReference: string;
  status: "pending_partner_review" | "confirmed" | "cancellation_pending" | "cancelled" | "failed" | "no_response";
  confirmation?: string; cancellation?: string; createdAt: string; updatedAt: string; idempotencyKey: string;
  source: VipDataSource; verificationStatus: VipVerificationStatus;
};
export type VipProviderStatus = { provider: string; status: "ok" | "inactive" | "blocked"; mode: "local_test"; synthetic: boolean };
export type VipProvider = {
  searchVipServices(input: VipSearchInput): Promise<VipSearchResult>;
  getVipQuote(offerId: string): Promise<VipQuote>;
  revalidateVipQuote(quoteId: string): Promise<VipQuote>;
  createVipBooking(input: { quoteId: string; customerMetadata: Record<string, string>; serviceMetadata?: Record<string, string>; idempotencyKey: string }): Promise<VipBooking>;
  getVipBooking(bookingReference: string): Promise<VipBooking>;
  confirmVipBooking(bookingReference: string, confirmation: string): Promise<VipBooking>;
  cancelVipBooking(bookingReference: string, reason: string): Promise<VipBooking>;
  getVipProviderStatus(): Promise<VipProviderStatus>;
};

export type CarSearchInput = { pickup: string; dropoff: string; pickupDateTime: string; dropoffDateTime: string; driverAge?: number };
export type VehicleSummary = { vehicleId: string; vehicleName: string; vehicleClass?: string; transmission?: string; fuelType?: string; seats?: number; bags?: number; doors?: number; airConditioning?: boolean; supplier?: string };
export type VehicleDetails = VehicleSummary & { terms?: string; mileagePolicy?: string; fuelPolicy?: string; cancellationPolicy?: string };
export type CarQuoteRequest = { vehicleId: string; rateId?: string; pickup: string; dropoff: string; pickupDateTime: string; dropoffDateTime: string };
export type CarQuote = { provider: string; offerId: string; rateId?: string; vehicle: VehicleDetails; currency: string; totalAmount: string; deposit?: string; expiresAt?: string; terms?: string };
export type CarSearchResult = { provider: string; status: "ok" | "no_results" | "blocked" | "unavailable"; vehicles: VehicleSummary[]; error?: NormalizedError };
export type CarBookingRequest = { quoteId: string; customer: unknown; idempotencyKey: string };
export type CarBooking = { id: string; provider: string; status: "confirmed" | "pending" | "failed" | "cancelled"; bookingReference?: string; currency?: string; totalAmount?: string; error?: NormalizedError };
export type CarCancellationRequest = { bookingId: string; idempotencyKey: string };
export type CarCancellationResult = { id: string; provider: string; status: "cancelled" | "failed"; error?: NormalizedError };
export type CarProvider = {
  searchCars(input: CarSearchInput): Promise<CarSearchResult>;
  getVehicleDetails(vehicleId: string): Promise<VehicleDetails>;
  getQuote(input: CarQuoteRequest): Promise<CarQuote>;
  createCarBooking(input: CarBookingRequest): Promise<CarBooking>;
  getCarBooking(bookingId: string): Promise<CarBooking>;
  cancelCarBooking(input: CarCancellationRequest): Promise<CarCancellationResult>;
};
