import { createSabreRequest } from "./client";
import { createSabreTokenProvider } from "./auth";

export type SabreFlightSearchInput = { origin: string; destination: string; departureDate: string; adults: number };

export type NormalizedSabreItinerary = {
  id: string;
  origin: string;
  destination: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
  totalDurationMinutes?: number;
  stopCount: number;
  marketingCarrier?: string;
  operatingCarrier?: string;
  flightNumber?: string;
  equipment?: string;
  cabin?: string;
  totalFare?: number;
  baseFare?: number;
  taxes?: number;
  currency?: string;
  validatingCarrier?: string;
};

export type SabreFlightSearchResult = {
  provider: "sabre";
  environment: "cert";
  itineraryCount: number;
  itineraries: NormalizedSabreItinerary[];
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const number = (value: unknown) => (typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : undefined);

export class SabreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SabreValidationError";
  }
}

export function validateSabreFlightSearch(input: SabreFlightSearchInput): SabreFlightSearchInput {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();

  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    throw new SabreValidationError("Origin and destination must be three-letter IATA codes.");
  }
  if (origin === destination) {
    throw new SabreValidationError("Origin and destination must differ.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate)) {
    throw new SabreValidationError("Departure date must use YYYY-MM-DD.");
  }

  const date = new Date(`${input.departureDate}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (Number.isNaN(date.valueOf()) || date <= today) {
    throw new SabreValidationError("Departure date must be a valid future date.");
  }

  if (!Number.isInteger(input.adults) || input.adults < 1 || input.adults > 9) {
    throw new SabreValidationError("Adults must be an integer between 1 and 9.");
  }

  return { ...input, origin, destination };
}

export function normalizeSabreBfmResponse(raw: unknown, input: SabreFlightSearchInput): SabreFlightSearchResult {
  if (!isRecord(raw) || !isRecord(raw.groupedItineraryResponse)) {
    throw new Error("Sabre returned a malformed shopping response.");
  }

  const grouped = raw.groupedItineraryResponse;
  const schedules = new Map(records(grouped.scheduleDescs).map((item) => [number(item.id), item]));
  const legs = new Map(records(grouped.legDescs).map((item) => [number(item.id), item]));
  const itineraries: NormalizedSabreItinerary[] = [];

  for (const group of records(grouped.itineraryGroups)) {
    const groupInfo = isRecord(group.groupDescription) ? group.groupDescription : {};
    const legDescription = records(groupInfo.legDescriptions)[0];

    for (const itinerary of records(group.itineraries)) {
      const pricing = records(itinerary.pricingInformation)[0];
      const fare = isRecord(pricing?.fare) ? pricing.fare : {};
      const totalFare = isRecord(fare.totalFare) ? fare.totalFare : {};
      const legRef = records(itinerary.legs)[0];
      const leg = legs.get(number(legRef?.ref));
      const scheduleRefs = records(leg?.schedules);
      const first = schedules.get(number(scheduleRefs[0]?.ref));
      const last = schedules.get(number(scheduleRefs.at(-1)?.ref));
      const carrier = isRecord(first?.carrier) ? first.carrier : {};
      const operating = isRecord(carrier.operating) ? carrier.operating : {};
      const equipment = isRecord(carrier.equipment) ? carrier.equipment : isRecord(first?.equipment) ? first.equipment : {};
      const passengerInfo = records(fare.passengerInfoList)[0];
      const passenger = isRecord(passengerInfo?.passengerInfo) ? passengerInfo.passengerInfo : {};
      const fareComponents = records(passenger.fareComponents);
      const departureDate = text(legDescription?.departureDate) ?? input.departureDate;
      const departureValue = isRecord(first?.departure) ? first.departure : {};
      const arrivalValue = isRecord(last?.arrival) ? last.arrival : {};
      const departureTime = text(departureValue.time);
      const arrivalTime = text(arrivalValue.time);
      const departureDateTime = text(first?.departure) ?? (departureTime ? `${departureDate}T${departureTime}` : undefined);
      const elapsed = number(leg?.elapsedTime);
      const computedArrival =
        text(last?.arrival) ??
        (departureDateTime && elapsed != null
          ? new Date(new Date(departureDateTime).getTime() + elapsed * 60_000).toISOString()
          : arrivalTime
            ? `${departureDate}T${arrivalTime}`
            : undefined);

      itineraries.push({
        id: String(itinerary.id ?? itineraries.length + 1),
        origin: input.origin,
        destination: input.destination,
        departureDateTime,
        arrivalDateTime: computedArrival,
        totalDurationMinutes: elapsed,
        stopCount: Math.max(0, scheduleRefs.length - 1),
        marketingCarrier: text(carrier.marketing),
        operatingCarrier: text(carrier.operating) ?? text(operating.code) ?? text(carrier.marketing),
        flightNumber:
          text(carrier.marketingFlightNumber) ??
          (carrier.marketingFlightNumber == null ? undefined : String(carrier.marketingFlightNumber)),
        equipment: text(equipment.code),
        cabin: text(
          fareComponents[0]?.segments && records(fareComponents[0].segments)[0]?.segment
            ? (records(fareComponents[0].segments)[0].segment as RecordValue).cabinCode
            : undefined
        ),
        totalFare: number(totalFare.totalPrice),
        baseFare: number(totalFare.equivalentAmount ?? totalFare.baseFareAmount),
        taxes: number(totalFare.totalTaxAmount),
        currency: text(totalFare.currency),
        validatingCarrier: text(fare.validatingCarrierCode) ?? text(groupInfo.validatingCarrier),
      });
    }
  }

  return {
    provider: "sabre",
    environment: "cert",
    itineraryCount: itineraries.length,
    itineraries,
  };
}

export async function searchSabreFlights(input: SabreFlightSearchInput): Promise<SabreFlightSearchResult> {
  const valid = validateSabreFlightSearch(input);
  const pcc = process.env.SABRE_PCC?.trim();
  if (!pcc) {
    throw new Error("SABRE_PCC is required.");
  }

  const body = {
    OTA_AirLowFareSearchRQ: {
      Version: "5",
      POS: {
        Source: [
          {
            PseudoCityCode: pcc,
            RequestorID: {
              Type: "1",
              ID: "1",
              CompanyName: { Code: "TN" },
            },
          },
        ],
      },
      OriginDestinationInformation: [
        {
          RPH: "1",
          DepartureDateTime: `${valid.departureDate}T00:00:00`,
          OriginLocation: { LocationCode: valid.origin },
          DestinationLocation: { LocationCode: valid.destination },
        },
      ],
      TravelPreferences: { ValidInterlineTicket: true },
      TravelerInfoSummary: {
        SeatsRequested: [valid.adults],
        AirTravelerAvail: [{ PassengerTypeQuantity: [{ Code: "ADT", Quantity: valid.adults }] }],
      },
      TPA_Extensions: { IntelliSellTransaction: { RequestType: { Name: "50ITINS" } } },
    },
  };

  const fetchImpl = globalThis.fetch;
  const request = createSabreRequest(process.env, fetchImpl, createSabreTokenProvider(process.env, fetchImpl));
  return normalizeSabreBfmResponse(await request("/v5/offers/shop", { method: "POST", body: JSON.stringify(body) }), valid);
}
