import { TravelProviderError } from "./errors";

export const MAX_TRAVEL_ADULTS = 9;
export const MAX_TRAVEL_CHILDREN = 8;
export const MAX_TRAVEL_PARTY = 9;

export type ValidatedTravelerCounts = { adults: number; children: number };

function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value);
}

export function validateTravelerCounts(adults: unknown, children: unknown = 0): ValidatedTravelerCounts {
  if (
    !isValidCount(adults)
    || !isValidCount(children)
    || adults < 1
    || children < 0
    || adults > MAX_TRAVEL_ADULTS
    || children > MAX_TRAVEL_CHILDREN
    || adults + children > MAX_TRAVEL_PARTY
  ) {
    throw new TravelProviderError("INVALID_TRAVELER_COUNT", "Traveler counts are invalid.");
  }

  return { adults, children };
}
