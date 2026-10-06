import { parseSavedTrip, type SavedTrip } from './continuity-contract';
import type { ContinuitySnapshot } from './continuity-service';
import { parseDabraLocale } from './locale-contract';

export type ContinuityChatTrip = { revision: number; generation: number; trip: SavedTrip };
export function parseContinuityChatTrip(value: unknown): ContinuityChatTrip | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 3 || !['revision','generation','trip'].every(key => Object.hasOwn(v, key))
    || typeof v.revision !== 'number' || !Number.isSafeInteger(v.revision) || v.revision < 0
    || typeof v.generation !== 'number' || !Number.isSafeInteger(v.generation) || v.generation < 0) return null;
  const trip = parseSavedTrip(v.trip);
  return trip ? { revision: v.revision, generation: v.generation, trip } : null;
}
/** The authenticated RPC supplies ownership. Client planning fields grant no access. */
export function continuityChatTripFresh(input: ContinuityChatTrip, state: ContinuitySnapshot, now = Date.now()) {
  return state.consentEnabled && state.revision === input.revision && state.generation === input.generation
    && state.trip?.id === input.trip.id && Date.parse(state.tripExpiresAt ?? '') > now;
}
export function continuityRequestLocale(preferences: { replyLanguage?: unknown } | null, ui: 'ar' | 'en') {
  return parseDabraLocale(preferences?.replyLanguage) ?? ui;
}
