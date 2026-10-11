/** Client-safe, explicit user choices only. Never authorization or model instructions. */
export const CONTINUITY_PREFERENCE_CHOICES = {
  replyLanguage: ['ar', 'en'],
  displayCurrency: ['SAR', 'EGP', 'USD', 'EUR', 'AED'],
  travelClass: ['economy', 'premium_economy', 'business', 'first'],
  lodgingStyle: ['hotel', 'apartment', 'resort', 'boutique'],
  itineraryPace: ['relaxed', 'balanced', 'active'],
} as const;
export type ContinuityPreferences = {
  [K in keyof typeof CONTINUITY_PREFERENCE_CHOICES]: (typeof CONTINUITY_PREFERENCE_CHOICES)[K][number];
};
export type SavedTrip = {
  id: string;
  origin: string | null;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  adults: number;
  children: number;
  rooms: number;
  budget: number | null;
  currency: ContinuityPreferences['displayCurrency'];
  families: Array<'drive' | 'stay' | 'fly' | 'concierge' | 'vip'>;
};
export type ContinuityRetention = Readonly<{
  preferencesDays: number; tripAfterEndDays: number; undatedTripDays: number; purgeTargetHours: number;
}>;
// Task187 proposals; not an approved production retention policy.
export const PROPOSED_CONTINUITY_RETENTION: ContinuityRetention = Object.freeze({
  preferencesDays: 180, tripAfterEndDays: 30, undatedTripDays: 180, purgeTargetHours: 24,
});
const DAY = 86_400_000;
export const CONTINUITY_SCHEMA_VERSION = 1;
export const CONTINUITY_CONSENT_VERSION = 'task187-v1';
export const CONTINUITY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function choice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}
function count(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
// Explicit BMP ranges shared verbatim with the SQL candidate. Supports AR/EN
// labels and common Latin accents without locale-dependent POSIX classes.
export const CONTINUITY_PLACE_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ſء-غف-يٱ-ۓ][A-Za-zÀ-ÖØ-öø-ſء-غف-يٱ-ۓ\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7-\u06e8\u06ea-\u06ed0-9٠-٩۰-۹ .,''()-]*$/u;
function place(value: unknown): value is string {
  // Bounded place labels, not transcripts, URLs, identifiers, or arbitrary notes.
  return typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 80
    && CONTINUITY_PLACE_PATTERN.test(value);
}
export function continuityDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseContinuityPreferences(value: unknown): ContinuityPreferences | null {
  if (!record(value) || !exactKeys(value, Object.keys(CONTINUITY_PREFERENCE_CHOICES))) return null;
  for (const key of Object.keys(CONTINUITY_PREFERENCE_CHOICES) as Array<keyof ContinuityPreferences>) {
    if (!choice(value[key], CONTINUITY_PREFERENCE_CHOICES[key] as readonly string[])) return null;
  }
  return { ...value } as ContinuityPreferences;
}
const TRIP_KEYS = ['id', 'origin', 'destination', 'startDate', 'endDate', 'adults', 'children', 'rooms', 'budget', 'currency', 'families'];
const FAMILIES = ['drive', 'stay', 'fly', 'concierge', 'vip'] as const;
export function parseSavedTrip(value: unknown): SavedTrip | null {
  if (!record(value) || !exactKeys(value, TRIP_KEYS)) return null;
  if (typeof value.id !== 'string' || !CONTINUITY_UUID.test(value.id)
    || !place(value.destination) || (value.origin !== null && !place(value.origin))) return null;
  if ((value.startDate === null) !== (value.endDate === null)) return null;
  if (value.startDate !== null && (!continuityDate(value.startDate) || !continuityDate(value.endDate)
    || value.startDate > value.endDate)) return null;
  if (!count(value.adults, 1, 20) || !count(value.children, 0, 19) || value.adults + value.children > 20
    || !count(value.rooms, 1, 8)) return null;
  if (value.budget !== null && (typeof value.budget !== 'number' || !Number.isFinite(value.budget)
    || value.budget <= 0 || value.budget > 1_000_000_000)) return null;
  if (!choice(value.currency, CONTINUITY_PREFERENCE_CHOICES.displayCurrency)
    || !Array.isArray(value.families) || !value.families.length || value.families.length > 5
    || new Set(value.families).size !== value.families.length || !value.families.every(f => choice(f, FAMILIES))) return null;
  return { ...value, families: [...value.families] } as SavedTrip;
}
function retention(value: ContinuityRetention) {
  if (!count(value.preferencesDays, 1, 3650) || !count(value.tripAfterEndDays, 1, 365)
    || !count(value.undatedTripDays, 1, 3650) || !count(value.purgeTargetHours, 1, 168)) {
    throw new Error('CONTINUITY_RETENTION_INVALID');
  }
}
function clock(now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_000_000_000_000_000) throw new Error('CONTINUITY_CLOCK_INVALID');
}
export function preferenceExpiry(confirmedAt: number, policy = PROPOSED_CONTINUITY_RETENTION) {
  clock(confirmedAt); retention(policy);
  return confirmedAt + policy.preferencesDays * DAY;
}
export function savedTripExpiry(trip: SavedTrip, savedAt: number, policy = PROPOSED_CONTINUITY_RETENTION) {
  clock(savedAt); retention(policy);
  if (!parseSavedTrip(trip)) throw new Error('CONTINUITY_TRIP_INVALID');
  return trip.endDate === null ? savedAt + policy.undatedTripDays * DAY
    : Date.parse(trip.endDate + 'T00:00:00Z') + policy.tripAfterEndDays * DAY;
}
export function resumeSavedTrip(value: unknown, expiresAt: number, now = Date.now()) {
  clock(now);
  const intent = parseSavedTrip(value);
  if (!intent || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  // This projection has no provider, booking, payment, or orchestration side effects.
  return {
    intent,
    approvalState: 'NOT_REQUESTED' as const,
    availability: 'unknown' as const,
    options: [] as never[],
    selections: [] as never[],
    estimates: [] as never[],
  };
}
