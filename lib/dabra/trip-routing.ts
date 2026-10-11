import type { SavedTrip } from './continuity-contract';

const cities = [
  ['cairo', 'القاهرة'], ['giza', 'الجيزة'], ['riyadh', 'الرياض'],
  ['jeddah', 'جدة'], ['dubai', 'دبي'], ['alexandria', 'الإسكندرية'],
] as const;
function normalize(value: string) {
  return value.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}
export function routingPlace(value: string) {
  const normalized = normalize(value);
  return cities.find(names => names.some(name => normalize(name) === normalized))?.[0] ?? normalized;
}
export function newTripRequested(message: string) {
  return /new trip|start over|رحله جديده|ابدا من جديد/.test(normalize(message));
}
export function withoutRoutingCities(message: string) {
  const aliases = cities.flatMap(names => names.map(normalize)).join('|');
  return normalize(message).replace(new RegExp(`(?<![\\p{L}])(?:${aliases})(?![\\p{L}])`, 'gu'), '');
}

/** Bounded city-role interpretation, not a general NLU or authorization source. */
export function cityRoles(message: string) {
  const text = normalize(message);
  const tokens = cities.flatMap(([name, ar]) => [name, normalize(ar)].map(alias => ({ name, alias })))
    .flatMap(({ name, alias }) => [...text.matchAll(new RegExp(`(?<![\\p{L}])${alias}(?![\\p{L}])`, 'gu'))]
      .map(match => ({ name, index: match.index!, end: match.index! + alias.length })));
  const ordered = tokens.sort((a, b) => a.index - b.index);
  let origin: string | undefined, destination: string | undefined;
  const unqualified = new Set<string>();
  for (const token of ordered) {
    const before = text.slice(0, token.index);
    if (/(?:\bfrom|\borigin|من|المغادره من)\s*[:=]?\s*$/.test(before)) origin = token.name;
    else if (/(?:\bto|\bin|\bdestination|\binstead|الي|في|الوجهه|بدلا من ذلك في)\s*[:=]?\s*$/.test(before)) destination = token.name;
    else unqualified.add(token.name);
  }
  const ambiguous = !destination && (unqualified.size > 1 || (origin !== undefined && unqualified.size > 0));
  const city = destination ?? (!origin && !ambiguous && unqualified.size === 1 ? [...unqualified][0] : undefined);
  return { origin, destination, city, ambiguous };
}

/** Only explicit roles update a resumed trip; its display summary is never parsed. */
export function refineRoutingTrip(trip: SavedTrip, message: string): SavedTrip {
  const roles = cityRoles(message);
  return { ...trip, origin: roles.origin ?? trip.origin, destination: roles.destination ?? trip.destination, families: [...trip.families] };
}
