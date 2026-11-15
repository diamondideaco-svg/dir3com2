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
  let origin: string | undefined, destination: string | undefined, destinationIndex = -1;
  const unqualified = new Set<string>();
  for (const token of ordered) {
    const before = text.slice(0, token.index);
    if (/(?:\bfrom|\borigin|من|المغادره من)\s*[:=]?\s*$/.test(before)) origin = token.name;
    else if (/(?:\bto|\bin|\bdestination|\binstead|الي|في|الوجهه|بدلا من ذلك في)\s*[:=]?\s*$/.test(before)) { destination = token.name; destinationIndex = token.index; }
    else unqualified.add(token.name);
  }
  const ambiguous = !destination && (unqualified.size > 1 || (origin !== undefined && unqualified.size > 0));
  const city = destination ?? (!origin && !ambiguous && unqualified.size === 1 ? [...unqualified][0] : undefined);
  // A named but unrecognised destination must not inherit a prior city.
  // A short explicit destination correction can stand without a service word.
  const service = /\b(?:car|cars|hotel|hotels|apartment|apartments|flight|flights|instead|change\s+(?:the\s+)?destination)\b|سيار|فندق|فنادق|شقه|شقق|طيران|بدلا|تعديل الوجهه|غير الوجهه/u.exec(text);
  const nonPlaces = /^(?:english|arabic|the|a|an|from|with|for|morning|evening|afternoon|summer|winter|spring|autumn|fall|january|february|march|april|may|june|july|august|september|october|november|december|من|مع|الي|الانجليزيه|الانجليزي|العربيه|العربي|اليوم|الصباح|المساء|المطار|الصيف|الشتاء|الربيع|الخريف|صيفا|شتاء)$/u;
  const aliases = new Set(cities.flatMap(names => names.map(normalize)));
  const relativeTime = /^(?:one|two|three|four|five|six|seven|eight|nine|ten|few|several|next)\s+(?:hours?|days?|weeks?|months?|years?)\b/u;
  const unknownDestination = Boolean(service && [...text.matchAll(/(?:\b(?:in|to)[ \t]+|(?:في|الي)[ \t]+)([\p{L}][\p{L}'-]*)/gu)]
    .some(match => (match.index ?? 0) > Math.max(service.index,destinationIndex) && !aliases.has(match[1]) && !nonPlaces.test(match[1])
      && !relativeTime.test(text.slice((match.index ?? 0) + match[0].length - match[1].length))));
  return { origin, destination, city, ambiguous, unknownDestination };
}

/** Only explicit roles update a resumed trip; its display summary is never parsed. */
export function refineRoutingTrip(trip: SavedTrip, message: string): SavedTrip {
  const roles = cityRoles(message);
  return { ...trip, origin: roles.origin ?? trip.origin, destination: roles.destination ?? trip.destination, families: [...trip.families] };
}
